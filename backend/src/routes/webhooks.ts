import { Router } from "express";
import { db, cards, cardRecipients as cardRecipientsTable, users } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { createHmac } from "crypto";
import { z } from "zod";
import { logger, webhookRateLimit } from "../middleware/index.js";

export const webhookRoutes = Router();

// Apply webhook rate limiting to all routes
webhookRoutes.use(webhookRateLimit);

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Email webhook schema (supports common providers like SendGrid, Mailgun, etc.)
const emailWebhookSchema = z.object({
  // Common fields across providers
  from: z.string().email(),
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string(),
  body: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  // Provider-specific fields
  messageId: z.string().optional(),
  inReplyTo: z.string().optional(),
  references: z.string().optional(),
  timestamp: z.string().optional(),
  attachments: z.array(z.object({
    filename: z.string(),
    contentType: z.string(),
    size: z.number(),
    url: z.string().optional(),
  })).optional(),
});

type EmailWebhook = z.infer<typeof emailWebhookSchema>;

/**
 * Verify webhook signature (provider-specific)
 * Supports: SendGrid, Mailgun, custom HMAC
 */
function verifyWebhookSignature(
  payload: string,
  signature: string | undefined,
  provider: string
): boolean {
  const secret = process.env.WEBHOOK_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      logger.error("WEBHOOK_SECRET is required in production - rejecting unsigned webhook");
      return false;
    }
    logger.warn("No WEBHOOK_SECRET configured, skipping signature verification (dev only)");
    return true;
  }

  if (!signature) {
    return false;
  }

  switch (provider) {
    case "sendgrid": {
      // SendGrid uses timestamp + payload
      const expectedSignature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      return signature === expectedSignature;
    }
    case "mailgun": {
      // Mailgun uses timestamp + token + signature
      const parts = signature.split(",");
      if (parts.length < 2) return false;
      const timestamp = parts[0];
      const token = parts[1];
      const expectedSignature = createHmac("sha256", secret)
        .update(timestamp + token)
        .digest("hex");
      return parts[2] === expectedSignature;
    }
    default: {
      // Default HMAC-SHA256
      const expectedSignature = createHmac("sha256", secret)
        .update(payload)
        .digest("hex");
      return signature === expectedSignature;
    }
  }
}

/**
 * Extract action items from email body
 * Looks for common patterns like:
 * - "Action required:", "TODO:", "Please do:"
 * - Bullet points starting with action verbs
 * - Deadline mentions
 */
function extractActionItems(text: string): Array<{
  content: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
}> {
  const actionItems: Array<{
    content: string;
    priority: "low" | "medium" | "high" | "urgent";
    dueDate?: string;
  }> = [];

  const lines = text.split("\n");

  // Common action patterns
  const actionPatterns = [
    /^[•\-\*]\s*(.+)$/i,
    /^(?:action|todo|task|please|need to|must|should|could you)[\s:]+(.+)$/i,
    /^\d+[.)]\s*(.+)$/i,
  ];

  // Priority indicators
  const urgentKeywords = ["urgent", "asap", "immediately", "critical", "emergency"];
  const highKeywords = ["important", "priority", "soon", "today"];

  // Due date patterns
  const datePattern = /(?:by|before|due|deadline)[\s:]+(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?|\w+\s+\d{1,2}(?:st|nd|rd|th)?(?:,?\s+\d{4})?)/i;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const pattern of actionPatterns) {
      const match = trimmed.match(pattern);
      if (match) {
        const content = match[1]?.trim() || trimmed;
        if (content.length < 5) continue; // Skip very short matches

        // Determine priority
        const lowerContent = content.toLowerCase();
        let priority: "low" | "medium" | "high" | "urgent" = "medium";
        if (urgentKeywords.some(k => lowerContent.includes(k))) {
          priority = "urgent";
        } else if (highKeywords.some(k => lowerContent.includes(k))) {
          priority = "high";
        }

        // Extract due date if present
        const dateMatch = content.match(datePattern);
        let dueDate: string | undefined;
        if (dateMatch) {
          try {
            const parsed = new Date(dateMatch[1]);
            if (!isNaN(parsed.getTime())) {
              dueDate = parsed.toISOString();
            }
          } catch {
            // Ignore invalid dates
          }
        }

        actionItems.push({ content, priority, dueDate });
        break; // Only match first pattern
      }
    }
  }

  return actionItems;
}

/**
 * Detect if email is a reply in a chain
 */
function isReplyChain(email: EmailWebhook): boolean {
  return !!(email.inReplyTo || email.references);
}

/**
 * Find user by email address
 */
async function findUserByEmail(email: string): Promise<{ id: string; name: string } | null> {
  const result = await db
    .select({ id: users.id, name: users.name })
    .from(users)
    .where(eq(users.email, email.toLowerCase()))
    .limit(1);

  return result[0] || null;
}

/**
 * POST /api/webhooks/email
 * Receive incoming emails and convert to cards
 */
webhookRoutes.post("/email", async (req, res) => {
  try {
    // Get provider from header or query
    const provider = (req.headers["x-webhook-provider"] as string) ||
      (req.query.provider as string) || "default";

    // Verify signature
    const signature = req.headers["x-webhook-signature"] as string;
    const isValid = verifyWebhookSignature(
      JSON.stringify(req.body),
      signature,
      provider
    );

    if (!isValid) {
      logger.warn("Invalid webhook signature", { provider });
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse and validate email data
    const parseResult = emailWebhookSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn("Invalid email webhook payload", {
        errors: parseResult.error.errors,
      });
      return res.status(400).json({
        error: "Invalid payload",
        details: parseResult.error.errors,
      });
    }

    const email = parseResult.data;

    // Find sender in our system
    const sender = await findUserByEmail(email.from);

    // Determine recipients
    const toEmails = Array.isArray(email.to) ? email.to : [email.to];
    const recipientIds: string[] = [];

    for (const toEmail of toEmails) {
      const user = await findUserByEmail(toEmail);
      if (user) {
        recipientIds.push(user.id);
      }
    }

    if (recipientIds.length === 0) {
      logger.info("No internal recipients found for email", {
        from: email.from,
        to: email.to,
      });
      return res.json({
        success: true,
        message: "No internal recipients found",
        cardCreated: false,
      });
    }

    // Get email body (prefer text over HTML)
    const body = email.text || email.body || (email.html ? email.html.replace(/<[^>]+>/g, " ").trim() : "");

    // Extract action items
    const actionItems = extractActionItems(body);

    // Determine card priority based on subject and content
    let priority: "low" | "medium" | "high" | "urgent" = "medium";
    const combinedText = `${email.subject} ${body}`.toLowerCase();
    if (combinedText.includes("urgent") || combinedText.includes("asap")) {
      priority = "urgent";
    } else if (combinedText.includes("important") || combinedText.includes("priority")) {
      priority = "high";
    }

    // Create card
    const cardId = randomUUID();
    const isReply = isReplyChain(email);

    const newCard = {
      id: cardId,
      content: body,
      summary: email.subject,
      sourceType: "email",
      sourceUserId: sender?.id || null,
      sourceRef: email.messageId || null,
      fromUserId: sender?.id || recipientIds[0], // Use first recipient if sender unknown
      toUserIds: recipientIds,
      visibility: "private",
      tag: actionItems.length > 0 ? "task" : "update",
      priority,
      priorityScore: priority === "urgent" ? 90 : priority === "high" ? 75 : 50,
      status: "pending",
      dueDate: actionItems[0]?.dueDate ? new Date(actionItems[0].dueDate) : null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(cards).values(newCard);

    // Insert recipients into junction table
    const recipientEntries = recipientIds.map(userId => ({
      cardId,
      userId,
      addedAt: new Date(),
    }));
    await db.insert(cardRecipientsTable).values(recipientEntries);

    logger.info("Created card from email", {
      cardId,
      from: email.from,
      subject: email.subject,
      isReply,
      actionItemsCount: actionItems.length,
    });

    res.status(201).json({
      success: true,
      cardCreated: true,
      card: {
        id: cardId,
        sourceType: "email",
        actionItems: actionItems.length,
        isReply,
      },
    });
  } catch (error) {
    logger.error("Error processing email webhook", error as Error);
    res.status(500).json({ error: "Failed to process email" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// CALENDAR WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════

// Calendar event schema (supports Google Calendar, Outlook, etc.)
const calendarEventSchema = z.object({
  eventId: z.string(),
  title: z.string(),
  description: z.string().optional(),
  start: z.string(), // ISO datetime
  end: z.string(), // ISO datetime
  location: z.string().optional(),
  organizer: z.object({
    email: z.string().email(),
    name: z.string().optional(),
  }),
  attendees: z.array(z.object({
    email: z.string().email(),
    name: z.string().optional(),
    responseStatus: z.enum(["accepted", "declined", "tentative", "needsAction"]).optional(),
  })).optional(),
  // Event type/action
  action: z.enum(["created", "updated", "deleted", "reminder"]).optional(),
  recurrence: z.string().optional(),
});

type CalendarEvent = z.infer<typeof calendarEventSchema>;

/**
 * Extract action items from calendar event
 * Looks for:
 * - Action items in description
 * - Follow-up indicators
 * - Meeting prep tasks
 */
function extractCalendarActions(event: CalendarEvent): Array<{
  content: string;
  priority: "low" | "medium" | "high" | "urgent";
  dueDate?: string;
}> {
  const actionItems: Array<{
    content: string;
    priority: "low" | "medium" | "high" | "urgent";
    dueDate?: string;
  }> = [];

  const description = event.description || "";

  // Extract explicit action items from description
  const descriptionActions = extractActionItems(description);
  actionItems.push(...descriptionActions);

  // Check for follow-up indicators in title
  const titleLower = event.title.toLowerCase();
  const followUpKeywords = ["follow-up", "follow up", "debrief", "review", "1:1", "one-on-one"];

  if (followUpKeywords.some(k => titleLower.includes(k))) {
    // Create a follow-up action item due at event time
    actionItems.push({
      content: `Follow up from: ${event.title}`,
      priority: "medium",
      dueDate: event.end,
    });
  }

  // Check for prep needed
  const prepKeywords = ["prepare", "prep", "agenda", "presentation"];
  if (prepKeywords.some(k => titleLower.includes(k) || description.toLowerCase().includes(k))) {
    // Create a prep action item due before event
    const prepDate = new Date(event.start);
    prepDate.setHours(prepDate.getHours() - 1);
    actionItems.push({
      content: `Prepare for: ${event.title}`,
      priority: "high",
      dueDate: prepDate.toISOString(),
    });
  }

  return actionItems;
}

/**
 * POST /api/webhooks/calendar
 * Receive calendar events and create cards for meetings needing follow-up
 */
webhookRoutes.post("/calendar", async (req, res) => {
  try {
    // Get provider from header or query
    const provider = (req.headers["x-webhook-provider"] as string) ||
      (req.query.provider as string) || "default";

    // Verify signature
    const signature = req.headers["x-webhook-signature"] as string;
    const isValid = verifyWebhookSignature(
      JSON.stringify(req.body),
      signature,
      provider
    );

    if (!isValid) {
      logger.warn("Invalid calendar webhook signature", { provider });
      return res.status(401).json({ error: "Invalid signature" });
    }

    // Parse and validate event data
    const parseResult = calendarEventSchema.safeParse(req.body);
    if (!parseResult.success) {
      logger.warn("Invalid calendar webhook payload", {
        errors: parseResult.error.errors,
      });
      return res.status(400).json({
        error: "Invalid payload",
        details: parseResult.error.errors,
      });
    }

    const event = parseResult.data;

    // Skip deleted events
    if (event.action === "deleted") {
      logger.info("Skipping deleted calendar event", { eventId: event.eventId });
      return res.json({ success: true, message: "Deleted event skipped" });
    }

    // Find organizer in our system
    const organizer = await findUserByEmail(event.organizer.email);

    // Find attendees in our system
    const attendeeIds: string[] = [];
    if (event.attendees) {
      for (const attendee of event.attendees) {
        const user = await findUserByEmail(attendee.email);
        if (user) {
          attendeeIds.push(user.id);
        }
      }
    }

    // Include organizer in recipients if found
    if (organizer && !attendeeIds.includes(organizer.id)) {
      attendeeIds.unshift(organizer.id);
    }

    if (attendeeIds.length === 0) {
      logger.info("No internal attendees found for calendar event", {
        eventId: event.eventId,
        title: event.title,
      });
      return res.json({
        success: true,
        message: "No internal attendees found",
        cardCreated: false,
      });
    }

    // Extract action items
    const actionItems = extractCalendarActions(event);

    // Only create card if there are action items or it's a meeting that likely needs follow-up
    const needsFollowUp = actionItems.length > 0 ||
      event.title.toLowerCase().includes("meeting") ||
      event.title.toLowerCase().includes("call") ||
      event.title.toLowerCase().includes("sync");

    if (!needsFollowUp) {
      logger.info("Skipping calendar event - no action items detected", {
        eventId: event.eventId,
        title: event.title,
      });
      return res.json({
        success: true,
        message: "No action items detected",
        cardCreated: false,
      });
    }

    // Create card
    const cardId = randomUUID();

    const content = event.description
      ? `${event.title}\n\n${event.description}`
      : event.title;

    const newCard = {
      id: cardId,
      content,
      summary: event.title,
      sourceType: "calendar",
      sourceRef: event.eventId,
      fromUserId: organizer?.id || attendeeIds[0],
      toUserIds: attendeeIds,
      visibility: "team",
      tag: "task",
      priority: "medium" as const,
      priorityScore: 60,
      status: "pending",
      dueDate: new Date(event.end), // Due at end of meeting
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(cards).values(newCard);

    // Insert recipients into junction table
    const recipientEntries = attendeeIds.map(userId => ({
      cardId,
      userId,
      addedAt: new Date(),
    }));
    await db.insert(cardRecipientsTable).values(recipientEntries);

    logger.info("Created card from calendar event", {
      cardId,
      eventId: event.eventId,
      title: event.title,
      actionItemsCount: actionItems.length,
    });

    res.status(201).json({
      success: true,
      cardCreated: true,
      card: {
        id: cardId,
        sourceType: "calendar",
        actionItems: actionItems.length,
        eventTitle: event.title,
      },
    });
  } catch (error) {
    logger.error("Error processing calendar webhook", error as Error);
    res.status(500).json({ error: "Failed to process calendar event" });
  }
});
