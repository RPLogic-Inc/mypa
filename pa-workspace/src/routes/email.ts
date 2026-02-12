import { Router, Request, Response } from "express";
import { db, emailLog } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import { authenticate } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { readPaInbox, sendFromPa, markAsRead } from "../services/googleGmail.js";
import { detectTezitContent } from "../services/tezEmail.js";
import { createCardFromEmail, importTezBundle } from "../services/appClient.js";
import { logAction } from "../services/actionLogger.js";
import { randomUUID } from "crypto";

const router = Router();
router.use(authenticate);

/**
 * Look up workspace config for a PA email.
 * Returns serviceAccountJson if the workspace is ready, or null.
 */
async function getCredentialsForPa(paEmail: string): Promise<{
  serviceAccountJson: string;
  teamId: string;
  userId: string;
} | null> {
  const { paIdentities, workspaceConfig } = await import("../db/schema.js");

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.paEmail, paEmail),
  });

  if (!identity) return null;

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });

  if (!config?.googleServiceAccountJson || config.setupStatus !== "ready") return null;

  return {
    serviceAccountJson: config.googleServiceAccountJson,
    teamId: identity.teamId,
    userId: identity.userId,
  };
}

/**
 * Privacy: verify the authenticated user owns the PA email being accessed.
 * Service-auth (backend service token) bypasses this check for workflows/provisioning.
 */
function assertPaOwnership(req: Request, creds: { userId: string }): string | null {
  if (req.isServiceAuth) return null;
  if (!req.user) return "Authentication required";
  if (creds.userId !== req.user.id) return "You can only access your own PA";
  return null;
}

/**
 * GET /api/email/inbox
 * Read PA's Gmail inbox.
 */
router.get("/inbox", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;
  const maxResults = parseInt(req.query.maxResults as string) || 20;
  const query = req.query.q as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  const ownershipError = assertPaOwnership(req, creds);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  try {
    const messages = await readPaInbox({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      maxResults,
      query,
    });

    res.json({
      data: messages.map((m) => ({
        id: m.id,
        threadId: m.threadId,
        subject: m.subject,
        from: m.from,
        to: m.to,
        date: m.date,
        snippet: m.snippet,
        hasAttachments: m.attachments.length > 0,
        isTezit: detectTezitContent({
          headers: m.headers,
          attachments: m.attachments,
          body: m.body,
        }),
        labelIds: m.labelIds,
      })),
      meta: { total: messages.length },
    });
  } catch (error) {
    logger.error("Failed to read PA inbox", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "INBOX_READ_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * POST /api/email/send
 * Send email from PA.
 */
router.post("/send", async (req: Request, res: Response) => {
  const { paEmail, to, subject, body, replyTo, headers, attachments } = req.body;

  if (!paEmail || !to || !subject || !body) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail, to, subject, and body are required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  const ownershipError = assertPaOwnership(req, creds);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  try {
    const result = await sendFromPa({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      to,
      subject,
      body,
      replyTo,
      headers,
      attachments,
    });

    // Log in email_log
    await db.insert(emailLog).values({
      id: randomUUID(),
      paEmail,
      direction: "outbound",
      fromAddress: paEmail,
      toAddress: to,
      subject,
      bodyPreview: body.slice(0, 200),
      gmailMessageId: result.messageId,
      isTezit: headers?.["X-Tezit-Protocol"] ? true : false,
      processedAs: "sent",
      processedAt: new Date(),
    });

    // Log action for timesheet
    await logAction({
      paEmail,
      actionType: "email_sent",
      summary: `Sent email to ${to}: ${subject}`,
      serviceAccountJson: creds.serviceAccountJson,
    });

    res.status(201).json({ data: { messageId: result.messageId, to, subject } });
  } catch (error) {
    logger.error("Failed to send email from PA", error as Error, { paEmail, to });
    res.status(500).json({
      error: { code: "SEND_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * POST /api/email/process
 * Process unread PA emails → forward to app as cards/tezits.
 */
router.post("/process", async (req: Request, res: Response) => {
  const { paEmail, maxResults } = req.body;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  const ownershipError = assertPaOwnership(req, creds);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  try {
    const messages = await readPaInbox({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      maxResults: maxResults || 10,
      query: "is:unread",
    });

    const results: Array<{
      messageId: string;
      subject: string;
      from: string;
      processedAs: string;
      cardId?: string;
    }> = [];

    for (const msg of messages) {
      const isTezit = detectTezitContent({
        headers: msg.headers,
        attachments: msg.attachments,
        body: msg.body,
      });

      let processedAs = "ignored";
      let cardId: string | undefined;

      if (isTezit) {
        // Import as Tez bundle (Phase 5 will have full extraction)
        const imported = await importTezBundle({
          source: "email",
          sourceRef: msg.id,
          content: msg.body,
          from: msg.from,
        });
        if (imported) {
          processedAs = "tez_import";
          cardId = imported.id;
        }
      } else {
        // Create a card from the email
        const card = await createCardFromEmail({
          content: msg.body,
          summary: `Email from ${msg.from}: ${msg.subject}`,
          fromUserId: creds.userId,
          sourceType: "email",
          sourceRef: msg.id,
        });
        if (card) {
          processedAs = "card";
          cardId = card.id;
        }
      }

      // Log in email_log
      await db.insert(emailLog).values({
        id: randomUUID(),
        paEmail,
        direction: "inbound",
        fromAddress: msg.from,
        toAddress: paEmail,
        subject: msg.subject,
        bodyPreview: msg.body.slice(0, 200),
        gmailMessageId: msg.id,
        isTezit,
        processedAs,
        cardId: cardId || null,
        processedAt: new Date(),
      });

      // Mark as read
      try {
        await markAsRead(
          { serviceAccountJson: creds.serviceAccountJson, paEmail },
          msg.id,
        );
      } catch (markError) {
        logger.warn("Failed to mark message as read", { messageId: msg.id });
      }

      results.push({
        messageId: msg.id,
        subject: msg.subject,
        from: msg.from,
        processedAs,
        cardId,
      });
    }

    // Log action for timesheet
    if (results.length > 0) {
      await logAction({
        paEmail,
        actionType: "email_read",
        summary: `Processed ${results.length} unread emails`,
        serviceAccountJson: creds.serviceAccountJson,
      });
    }

    res.json({
      data: results,
      meta: {
        total: results.length,
        cards: results.filter((r) => r.processedAs === "card").length,
        tezImports: results.filter((r) => r.processedAs === "tez_import").length,
        ignored: results.filter((r) => r.processedAs === "ignored").length,
      },
    });
  } catch (error) {
    logger.error("Failed to process PA emails", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "PROCESS_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/email/log
 * Email processing log.
 */
router.get("/log", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;
  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  // Privacy: verify PA ownership before exposing email logs
  const creds = await getCredentialsForPa(paEmail);
  if (creds) {
    const ownershipError = assertPaOwnership(req, creds);
    if (ownershipError) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
    }
  } else if (!req.isServiceAuth) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "PA not found" } });
  }

  const logs = await db
    .select()
    .from(emailLog)
    .where(eq(emailLog.paEmail, paEmail))
    .orderBy(desc(emailLog.processedAt));

  res.json({ data: logs, meta: { total: logs.length } });
});

export const emailRoutes = router;
