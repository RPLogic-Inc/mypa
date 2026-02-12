import { Router } from "express";
import { db, cards, responses, reactions, cardViews, users, cardContext, cardRecipients as cardRecipientsTable, userTeams, getClient } from "../db/index.js";
import { eq, desc, and, inArray, ne, or, like, sql, lt } from "drizzle-orm";
import { randomUUID } from "crypto";
import { classifyService } from "../services/classify.js";
import { notificationService } from "../services/notifications.js";
import {
  generateProactiveHints,
  normalizeShareIntent,
  recordProductEvent,
  recordTezAuditEvent,
  sanitizeTezContent,
} from "../services/tezOps.js";
import { logger, validate, schemas, authenticate, standardRateLimit, strictRateLimit, aiRateLimit } from "../middleware/index.js";
import { insertIntoFTS } from "../db/fts.js";
// Inline status state machine (pending → active → resolved, archived from any)
const STATUS_TRANSITIONS: Record<string, string[]> = {
  pending: ["active", "resolved", "archived"],
  active: ["resolved", "archived"],
  resolved: ["archived"],
  archived: [],
};
function isValidTransition(from: string, to: string): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
function getValidTransitions(from: string): string[] {
  return STATUS_TRANSITIONS[from] ?? [];
}

export const cardRoutes = Router();

// Apply auth first so rate limiting can key by JWT user ID (not just IP)
cardRoutes.use(authenticate);
cardRoutes.use(standardRateLimit);

/**
 * Decode cursor for pagination
 * Cursor format: base64(JSON({sortValue, id}))
 */
function decodeCursor(cursor: string | undefined): { sortValue: number; id: string } | null {
  if (!cursor) return null;
  try {
    const decoded = Buffer.from(cursor, "base64").toString("utf-8");
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

/**
 * Encode cursor for pagination
 */
function encodeCursor(sortValue: number, id: string): string {
  return Buffer.from(JSON.stringify({ sortValue, id })).toString("base64");
}

async function generateDisplayBullets(rawText: string): Promise<string[]> {
  const summary = rawText.slice(0, 100);
  const bullets = summary
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
  return bullets.length > 0 ? bullets : [summary];
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE CLASSIFICATION - Classify intent before card creation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cards/classify
 * Classify a message's routing intent (self, DM, or broadcast).
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
cardRoutes.post("/classify", validate({ body: schemas.classifyMessage }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content, teamId: explicitTeamId } = req.body;

    // Get sender info
    const senderResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (senderResult.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }
    const sender = senderResult[0];

    // Resolve team scope for name matching
    let resolvedTeamId: string | null = null;
    if (explicitTeamId) {
      // Validate user is a member of the specified team
      const membership = await db.select().from(userTeams).where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, explicitTeamId))).limit(1);
      if (membership.length === 0) {
        return res.status(403).json({ error: { code: "NOT_TEAM_MEMBER", message: "You are not a member of the specified team." } });
      }
      resolvedTeamId = explicitTeamId;
    } else {
      resolvedTeamId = sender.teamId || null;
    }

    // Get team members for name matching
    let teamMembers: typeof users.$inferSelect[];
    if (resolvedTeamId) {
      const memberRows = await db
        .select({ user: users })
        .from(userTeams)
        .innerJoin(users, eq(userTeams.userId, users.id))
        .where(and(eq(userTeams.teamId, resolvedTeamId), ne(users.id, userId)));
      teamMembers = memberRows.map((r) => r.user);
    } else {
      teamMembers = await db.select().from(users).where(ne(users.id, userId));
    }

    const result = classifyService.classifyMessageIntent(
      content,
      {
        id: sender.id,
        name: sender.name,
        roles: sender.roles || [],
        skills: sender.skills || [],
        department: sender.department || "unknown",
      },
      teamMembers.map((m) => ({
        id: m.id,
        name: m.name,
        roles: m.roles || [],
        skills: m.skills || [],
        department: m.department || "unknown",
      }))
    );

    res.json({
      data: result,
      meta: { teamSize: teamMembers.length },
    });
  } catch (error) {
    logger.error("Error classifying message", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId });
    res.status(500).json({ error: "Failed to classify message" });
  }
});

/**
 * GET /api/cards/feed
 * Get user's card feed with cursor-based pagination.
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
cardRoutes.get("/feed", validate({ query: schemas.feedQuery }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const status = req.query.status as string;
    const sourceType = req.query.sourceType as string; // "self" | "bot" | "email" | "calendar"
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const cursor = decodeCursor(req.query.cursor as string);

    const now = new Date();

    // Step 1: Get card IDs where user is a recipient (using junction table OR JSON fallback)
    const recipientCardIds = await db
      .select({ cardId: cardRecipientsTable.cardId })
      .from(cardRecipientsTable)
      .where(eq(cardRecipientsTable.userId, userId));

    const cardIdsFromJunction = recipientCardIds.map(r => r.cardId);

    // Build base query - get cards where user is fromUserId OR in junction table
    let baseConditions = or(
      eq(cards.fromUserId, userId),
      cardIdsFromJunction.length > 0 ? inArray(cards.id, cardIdsFromJunction) : sql`0=1`
    );

    // Filter by status if provided
    let conditions = status && status !== "all"
      ? and(baseConditions, eq(cards.status, status))
      : baseConditions;

    // Apply cursor-based pagination (chronological sort only)
    if (cursor) {
      conditions = and(
        conditions,
        or(
          lt(cards.createdAt, new Date(cursor.sortValue)),
          and(
            eq(cards.createdAt, new Date(cursor.sortValue)),
            lt(cards.id, cursor.id)
          )
        )
      );
    }

    // Build and execute the query with sorting
    // Fetch one extra to check if there are more results
    const userCards = await db
      .select()
      .from(cards)
      .where(conditions)
      .orderBy(
        desc(cards.createdAt),
        desc(cards.id) // Secondary sort for stable pagination
      )
      .limit(limit + 1);

    // Filter for snooze, sourceType, and JSON fallback access check
    const filteredCards = userCards.filter((card) => {
      // Backward compat: also check toUserIds JSON array
      const hasAccess = card.fromUserId === userId ||
        cardIdsFromJunction.includes(card.id) ||
        card.toUserIds?.includes(userId);
      if (!hasAccess) return false;

      // Filter by sourceType if specified
      if (sourceType && card.sourceType !== sourceType) {
        return false;
      }

      // Filter out snoozed cards where snooze time hasn't passed yet
      if (card.snoozedUntil) {
        if (new Date(card.snoozedUntil) > now) {
          return false;
        }
      }
      return true;
    });

    // Check if there are more results
    const hasMore = filteredCards.length > limit;
    const results = filteredCards.slice(0, limit);

    if (results.length === 0) {
      return res.json({
        cards: [],
        pagination: {
          hasMore: false,
          nextCursor: null,
        },
      });
    }

    // Step 2: Batch load related data (fixes N+1)
    const cardIds = results.map(c => c.id);

    const senderIds = Array.from(new Set(results.map((c) => c.fromUserId).filter(Boolean)));

    // Batch load responses, reactions, views, and sender display info in parallel
    const [allResponses, allReactions, allViews, senderRows] = await Promise.all([
      db.select().from(responses).where(inArray(responses.cardId, cardIds)).orderBy(desc(responses.createdAt)),
      db.select().from(reactions).where(inArray(reactions.cardId, cardIds)),
      db.select().from(cardViews).where(inArray(cardViews.cardId, cardIds)),
      senderIds.length > 0
        ? db.select({ id: users.id, name: users.name, avatarUrl: users.avatarUrl }).from(users).where(inArray(users.id, senderIds))
        : Promise.resolve([]),
    ]);

    // Step 3: Group by card ID
    const responsesByCard = new Map<string, typeof allResponses>();
    const reactionsByCard = new Map<string, typeof allReactions>();
    const viewsByCard = new Map<string, string[]>();

    for (const resp of allResponses) {
      if (!responsesByCard.has(resp.cardId)) responsesByCard.set(resp.cardId, []);
      responsesByCard.get(resp.cardId)!.push(resp);
    }
    for (const react of allReactions) {
      if (!reactionsByCard.has(react.cardId)) reactionsByCard.set(react.cardId, []);
      reactionsByCard.get(react.cardId)!.push(react);
    }
    for (const view of allViews) {
      if (!viewsByCard.has(view.cardId)) viewsByCard.set(view.cardId, []);
      viewsByCard.get(view.cardId)!.push(view.userId);
    }

    // Step 4: Combine data
    const senderById = new Map(senderRows.map((u) => [u.id, u]));
    const cardsWithResponses = results.map((card) => ({
      ...card,
      fromUserName: senderById.get(card.fromUserId)?.name,
      fromUserAvatar: senderById.get(card.fromUserId)?.avatarUrl,
      responses: responsesByCard.get(card.id) || [],
      reactions: reactionsByCard.get(card.id) || [],
      viewedBy: viewsByCard.get(card.id) || [],
    }));

    // Generate next cursor
    let nextCursor: string | null = null;
    if (hasMore && results.length > 0) {
      const lastCard = results[results.length - 1];
      const sortValue = lastCard.createdAt?.getTime() || 0;
      nextCursor = encodeCursor(sortValue, lastCard.id);
    }

    res.json({
      cards: cardsWithResponses,
      pagination: {
        hasMore,
        nextCursor,
      },
    });
  } catch (error) {
    logger.error("Error fetching feed", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch feed" });
  }
});

/**
 * POST /api/cards/personal
 * Create a personal card (message for me).
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
cardRoutes.post("/personal", aiRateLimit, validate({ body: schemas.createPersonalCard }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { content: rawContent, summary: providedSummary, audioUrl, dueDate, shareIntent, contextLayers } = req.body;
    const intent = normalizeShareIntent(shareIntent);
    const { sanitized: content, redactions } = sanitizeTezContent(rawContent);
    const proactiveHints = generateProactiveHints(content, intent);

    const userResult = await db.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
    const userName = userResult[0]?.name || "Unknown User";
    const originalType = audioUrl ? "voice" : "text";
    const originalDisplayBullets = await generateDisplayBullets(content);

    // Create a single card with the raw content
    const id = randomUUID();
    const sourceType = contextLayers?.length ? "ai_share" : "self";
    const newCard = {
      id,
      fromUserId: userId,
      toUserIds: [userId],
      visibility: "private",
      content,
      summary: providedSummary || content.slice(0, 100),
      audioUrl,
      status: "pending",
      shareIntent: intent,
      proactiveHints,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const contextId = randomUUID();
    const now = new Date();

    // Collect context layer IDs for FTS indexing after transaction
    const layerInserts: Array<{ contextId: string; rawText: string; type: string }> = [];

    await db.transaction(async (tx) => {
      await tx.insert(cards).values(newCard);

      // Also insert into junction table for efficient querying
      await tx.insert(cardRecipientsTable).values({
        cardId: id,
        userId: userId,
        addedAt: new Date(),
      });

      // Store original input in Library of Context
      await tx.insert(cardContext).values({
        id: contextId,
        cardId: id,
        userId,
        userName,
        originalType,
        originalRawText: content,
        originalAudioUrl: audioUrl,
        capturedAt: now,
        displayBullets: originalDisplayBullets,
        displayGeneratedAt: now,
        displayModelUsed: "claude-sonnet",
        createdAt: now,
      });

      // Insert context layers (AI conversation history shared alongside the Tez)
      if (contextLayers && contextLayers.length > 0) {
        for (const layer of contextLayers) {
          const layerContextId = randomUUID();
          const layerBullets = await generateDisplayBullets(layer.content);
          await tx.insert(cardContext).values({
            id: layerContextId,
            cardId: id,
            userId,
            userName,
            originalType: layer.type,
            originalRawText: layer.content,
            assistantData: layer.query ? { query: layer.query, fullResponse: layer.content, toolsUsed: [], sources: [], executionTimeMs: 0 } : undefined,
            capturedAt: now,
            displayBullets: layerBullets,
            displayGeneratedAt: now,
            displayModelUsed: "claude-sonnet",
            createdAt: now,
          });
          layerInserts.push({ contextId: layerContextId, rawText: layer.content, type: layer.type });
        }
      }
    });

    // Insert into FTS5 for searchability (outside transaction - non-critical)
    const client = getClient();
    await insertIntoFTS(client, {
      contextId,
      cardId: id,
      userId,
      userName,
      originalType,
      capturedAt: now.getTime(),
      originalRawText: content,
      displayBullets: originalDisplayBullets,
    });

    // Index context layers in FTS
    for (const layer of layerInserts) {
      await insertIntoFTS(client, {
        contextId: layer.contextId,
        cardId: id,
        userId,
        userName,
        originalType: layer.type,
        capturedAt: now.getTime(),
        originalRawText: layer.rawText,
        displayBullets: await generateDisplayBullets(layer.rawText),
      });
    }

    await recordProductEvent({
      userId,
      teamId: null,
      cardId: id,
      eventName: "tez_shared",
      metadata: {
        visibility: "private",
        shareIntent: intent,
        sourceType,
        contextLayerCount: contextLayers?.length || 0,
        hadRedactions: redactions.length > 0,
      },
    });
    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "share",
      details: {
        visibility: "private",
        shareIntent: intent,
        sourceType,
        contextLayerCount: contextLayers?.length || 0,
      },
    });
    if (redactions.length > 0) {
      await recordTezAuditEvent({
        cardId: id,
        actorUserId: userId,
        action: "redact",
        details: { kinds: redactions },
      });
    }

    res.status(201).json(newCard);
  } catch (error) {
    logger.error("Error creating personal card", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to create card" });
  }
});

/**
 * POST /api/cards/team
 * Create a team card (message for team).
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
cardRoutes.post("/team", aiRateLimit, validate({ body: schemas.createTeamCard }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const {
      content: rawContent,
      summary,
      audioUrl,
      recipients: providedRecipients,
      shareToTeam,
      dueDate,
      shareIntent,
      contextLayers,
      teamId: explicitTeamId,
    } = req.body;
    const intent = normalizeShareIntent(shareIntent);
    const { sanitized: content, redactions } = sanitizeTezContent(rawContent);

    // Get sender info
    const senderResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const sender = senderResult[0] || {
      id: userId,
      name: "Unknown",
      roles: [],
      skills: [],
      department: "unknown",
    };

    // ── Team scope resolution ──
    // 1. If explicit teamId → validate membership, use it
    // 2. If not provided + user in 1 team → use that team implicitly
    // 3. If not provided + user in 2+ teams → 400 AMBIGUOUS_TEAM_SCOPE
    let resolvedTeamId: string | null = null;

    if (explicitTeamId) {
      const membership = await db.select().from(userTeams).where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, explicitTeamId))).limit(1);
      if (membership.length === 0) {
        return res.status(403).json({
          error: { code: "NOT_TEAM_MEMBER", message: "You are not a member of the specified team." },
        });
      }
      resolvedTeamId = explicitTeamId;
    } else {
      // Check all teams the user belongs to
      const allMemberships = await db
        .select({ teamId: userTeams.teamId, role: userTeams.role })
        .from(userTeams)
        .where(eq(userTeams.userId, userId));

      if (allMemberships.length === 0) {
        // Fall back to legacy teamId on user record
        resolvedTeamId = sender.teamId || null;
      } else if (allMemberships.length === 1) {
        resolvedTeamId = allMemberships[0].teamId;
      } else {
        // Multi-team user without explicit scope — look up team names for the error
        const { teams: teamsTable } = await import("../db/schema.js");
        const teamIds = allMemberships.map((m) => m.teamId);
        const teamRows = await db.select({ id: teamsTable.id, name: teamsTable.name }).from(teamsTable).where(inArray(teamsTable.id, teamIds));
        const teamNameMap = new Map(teamRows.map((t) => [t.id, t.name]));

        return res.status(400).json({
          error: {
            code: "AMBIGUOUS_TEAM_SCOPE",
            message: "User is a member of multiple teams. Specify teamId explicitly.",
            teams: allMemberships.map((m) => ({
              id: m.teamId,
              name: teamNameMap.get(m.teamId) || "Team",
              role: m.role,
            })),
          },
        });
      }
    }

    // Get team members for routing via user_teams junction table
    const senderTeamId = resolvedTeamId;
    let teamMembers: typeof users.$inferSelect[];
    if (senderTeamId) {
      const memberRows = await db
        .select({ user: users })
        .from(userTeams)
        .innerJoin(users, eq(userTeams.userId, users.id))
        .where(and(eq(userTeams.teamId, senderTeamId), ne(users.id, userId)));
      teamMembers = memberRows.map((r) => r.user);
    } else {
      teamMembers = await db.select().from(users).where(ne(users.id, userId));
    }

    // If recipients are explicitly provided, ensure they're on the sender's active team (closed network).
    if (senderTeamId && providedRecipients && providedRecipients.length > 0) {
      const allowedIds = new Set(teamMembers.map((m) => m.id));
      const invalid = providedRecipients.filter((rid: string) => rid !== userId && !allowedIds.has(rid));
      if (invalid.length > 0) {
        return res.status(400).json({
          error: {
            code: "INVALID_RECIPIENTS",
            message: "One or more recipients are not on your team.",
          },
        });
      }
    }

    // Privacy: no silent broadcast.
    // - If `recipients` are provided: treat as explicit DM-like delivery (within team).
    // - If `shareToTeam === true`: expand recipients to all teammates (explicit broadcast intent).
    let cardRecipients: string[] = Array.isArray(providedRecipients) ? providedRecipients : [];
    if (cardRecipients.length === 0) {
      if (shareToTeam === true) {
        if (!senderTeamId) {
          return res.status(400).json({
            error: {
              code: "NO_TEAM",
              message: "Cannot broadcast without an active team.",
            },
          });
        }
        cardRecipients = teamMembers.map((m) => m.id);
      } else {
        return res.status(400).json({
          error: {
            code: "RECIPIENTS_REQUIRED",
            message: "Choose recipients or set shareToTeam=true to broadcast to your team.",
          },
        });
      }
    }
    const cardSummary = summary || content.slice(0, 100);
    const proactiveHints = generateProactiveHints(content, intent);

    const originalType = audioUrl ? "voice" : "text";
    const originalDisplayBullets = await generateDisplayBullets(content);

    const id = randomUUID();
    const sourceType = contextLayers?.length ? "ai_share" : "self";
    const newCard = {
      id,
      fromUserId: userId,
      toUserIds: cardRecipients,
      visibility: "team",
      teamId: senderTeamId,
      content,
      summary: cardSummary,
      audioUrl,
      status: "pending",
      shareIntent: intent,
      proactiveHints,
      dueDate: dueDate ? new Date(dueDate) : undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const contextId = randomUUID();
    const now = new Date();

    // Collect context layer IDs for FTS indexing after transaction
    const layerInserts: Array<{ contextId: string; rawText: string; type: string }> = [];

    await db.transaction(async (tx) => {
      await tx.insert(cards).values(newCard);

      // Also insert into junction table for all recipients
      if (cardRecipients && cardRecipients.length > 0) {
        const recipientEntries = cardRecipients.map((recipientId: string) => ({
          cardId: id,
          userId: recipientId,
          addedAt: new Date(),
        }));
        await tx.insert(cardRecipientsTable).values(recipientEntries);
      }

      // Store original input in Library of Context
      await tx.insert(cardContext).values({
        id: contextId,
        cardId: id,
        userId,
        userName: sender.name || "Unknown User",
        originalType,
        originalRawText: content,
        originalAudioUrl: audioUrl,
        capturedAt: now,
        displayBullets: originalDisplayBullets,
        displayGeneratedAt: now,
        displayModelUsed: "claude-sonnet",
        createdAt: now,
      });

      // Insert context layers (AI conversation history shared alongside the Tez)
      if (contextLayers && contextLayers.length > 0) {
        for (const layer of contextLayers) {
          const layerContextId = randomUUID();
          const layerBullets = await generateDisplayBullets(layer.content);
          await tx.insert(cardContext).values({
            id: layerContextId,
            cardId: id,
            userId,
            userName: sender.name || "Unknown User",
            originalType: layer.type,
            originalRawText: layer.content,
            assistantData: layer.query ? { query: layer.query, fullResponse: layer.content, toolsUsed: [], sources: [], executionTimeMs: 0 } : undefined,
            capturedAt: now,
            displayBullets: layerBullets,
            displayGeneratedAt: now,
            displayModelUsed: "claude-sonnet",
            createdAt: now,
          });
          layerInserts.push({ contextId: layerContextId, rawText: layer.content, type: layer.type });
        }
      }
    });

    // Insert into FTS5 for searchability (outside transaction - non-critical)
    const client = getClient();
    await insertIntoFTS(client, {
      contextId,
      cardId: id,
      userId,
      userName: sender.name || "Unknown User",
      originalType,
      capturedAt: now.getTime(),
      originalRawText: content,
      displayBullets: originalDisplayBullets,
    });

    // Index context layers in FTS
    for (const layer of layerInserts) {
      await insertIntoFTS(client, {
        contextId: layer.contextId,
        cardId: id,
        userId,
        userName: sender.name || "Unknown User",
        originalType: layer.type,
        capturedAt: now.getTime(),
        originalRawText: layer.rawText,
        displayBullets: await generateDisplayBullets(layer.rawText),
      });
    }

    // Send push notifications to recipients, but cap wait time so card creation never hangs.
    const maxNotificationWaitMs = Number(process.env.CARD_NOTIFICATION_WAIT_MS || 1200);
    const notificationResults = await Promise.race([
      notificationService.notifyCardRecipients({
        cardId: id,
        cardSummary: cardSummary,
        cardContent: content,
        priority: "normal",
        senderName: sender.name,
        recipientIds: cardRecipients,
      }),
      new Promise<{ success: boolean; userId: string; error?: string }[]>((resolve) =>
        setTimeout(() => resolve([]), Number.isFinite(maxNotificationWaitMs) ? maxNotificationWaitMs : 1200)
      ),
    ]);

    // Log notification results (non-blocking)
    const successCount = notificationResults.filter((r) => r.success).length;
    if (notificationResults.length > 0) {
      logger.info(`Sent notifications for card`, {
        cardId: id,
        sent: notificationResults.length,
        successful: successCount,
      });
    }

    await recordProductEvent({
      userId,
      teamId: senderTeamId,
      cardId: id,
      eventName: "tez_shared",
      metadata: {
        visibility: "team",
        recipientCount: cardRecipients.length,
        shareIntent: intent,
        sourceType,
        contextLayerCount: contextLayers?.length || 0,
        hadRedactions: redactions.length > 0,
      },
    });
    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "share",
      details: {
        visibility: "team",
        recipientCount: cardRecipients.length,
        shareIntent: intent,
        sourceType,
        contextLayerCount: contextLayers?.length || 0,
      },
    });
    if (redactions.length > 0) {
      await recordTezAuditEvent({
        cardId: id,
        actorUserId: userId,
        action: "redact",
        details: { kinds: redactions },
      });
    }

    res.status(201).json({
      ...newCard,
      notifications: {
        sent: notificationResults.length,
        successful: successCount,
      },
    });
  } catch (error) {
    logger.error("Error creating team card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId });
    res.status(500).json({ error: "Failed to create card" });
  }
});

// Get single card
cardRoutes.get("/:id", validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const card = await db.select().from(cards).where(eq(cards.id, id)).limit(1);

    if (card.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }

    // Authorization check: user must be sender or recipient
    const cardData = card[0];
    const hasAccess = cardData.fromUserId === userId ||
      cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const [cardResponses, cardReactions, views] = await Promise.all([
      db.select().from(responses).where(eq(responses.cardId, id)).orderBy(desc(responses.createdAt)),
      db.select().from(reactions).where(eq(reactions.cardId, id)),
      db.select().from(cardViews).where(eq(cardViews.cardId, id)),
    ]);

    const senderRow = await db
      .select({ name: users.name, avatarUrl: users.avatarUrl })
      .from(users)
      .where(eq(users.id, cardData.fromUserId))
      .limit(1);

    res.json({
      ...card[0],
      fromUserName: senderRow[0]?.name,
      fromUserAvatar: senderRow[0]?.avatarUrl,
      responses: cardResponses,
      reactions: cardReactions,
      viewedBy: views.map((v) => v.userId),
    });
  } catch (error) {
    logger.error("Error fetching card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to fetch card" });
  }
});

// Track card open (metadata-only product event)
cardRoutes.post("/:id/opened", validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    await recordProductEvent({
      userId,
      teamId: cardData.teamId || null,
      cardId: id,
      eventName: "tez_opened",
      metadata: {
        visibility: cardData.visibility,
        shareIntent: cardData.shareIntent || "note",
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error tracking card open", error instanceof Error ? error : new Error(String(error)), {
      requestId: req.requestId,
      cardId: req.params.id,
    });
    res.status(500).json({ error: "Failed to track open event" });
  }
});

// Track proactive hint click (metadata-only product event)
cardRoutes.post("/:id/hint-click", validate({ params: schemas.cardIdParam, body: schemas.trackHintClick }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { hint } = req.body;

    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    await recordProductEvent({
      userId,
      teamId: cardData.teamId || null,
      cardId: id,
      eventName: "proactive_hint_clicked",
      metadata: {
        hint: hint.slice(0, 120),
        shareIntent: cardData.shareIntent || "note",
      },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error tracking hint click", error instanceof Error ? error : new Error(String(error)), {
      requestId: req.requestId,
      cardId: req.params.id,
    });
    res.status(500).json({ error: "Failed to track hint click" });
  }
});

// Add response to card
cardRoutes.post("/:id/respond", validate({ params: schemas.cardIdParam, body: schemas.addResponse }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { content, audioUrl, attachments } = req.body;

    // Verify card exists and user has access
    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const responseId = randomUUID();
    const newResponse = {
      id: responseId,
      cardId: id,
      userId,
      content,
      audioUrl,
      attachments: attachments || [],
      createdAt: new Date(),
    };

    await db.insert(responses).values(newResponse);

    // Update card status
    await db
      .update(cards)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(cards.id, id));

    await recordProductEvent({
      userId,
      teamId: cardData.teamId || null,
      cardId: id,
      eventName: "tez_replied",
      metadata: {
        visibility: cardData.visibility,
        shareIntent: cardData.shareIntent || "note",
      },
    });
    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "respond",
      details: { responseId },
    });

    res.status(201).json(newResponse);
  } catch (error) {
    logger.error("Error adding response", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to add response" });
  }
});

// Acknowledge card
cardRoutes.post("/:id/acknowledge", validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    // Verify card exists and user has access
    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db
      .update(cards)
      .set({ status: "active", updatedAt: new Date() })
      .where(eq(cards.id, id));

    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "acknowledge",
      details: {},
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error acknowledging card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to acknowledge card" });
  }
});

// Complete/resolve card
cardRoutes.patch("/:id", validate({ params: schemas.cardIdParam, body: schemas.updateCard }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { status } = req.body;

    // Verify card exists and user has access
    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Enforce status state machine
    if (status && !isValidTransition(cardData.status, status)) {
      return res.status(400).json({
        error: {
          code: "INVALID_TRANSITION",
          message: `Cannot transition from '${cardData.status}' to '${status}'`,
          validTransitions: getValidTransitions(cardData.status),
        },
      });
    }

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (status) updates.status = status;

    await db.update(cards).set(updates).where(eq(cards.id, id));

    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: status === "resolved" ? "resolve" : "edit",
      details: { status: status || null },
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error updating card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to update card" });
  }
});

// Add reaction
cardRoutes.post("/:id/react", validate({ params: schemas.cardIdParam, body: schemas.addReaction }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { emoji } = req.body;

    // Verify card exists and user has access
    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const reactionId = randomUUID();
    await db.insert(reactions).values({
      id: reactionId,
      cardId: id,
      userId,
      emoji,
      createdAt: new Date(),
    });

    res.status(201).json({ success: true });
  } catch (error) {
    logger.error("Error adding reaction", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to add reaction" });
  }
});

// Snooze card
cardRoutes.post("/:id/snooze", validate({ params: schemas.cardIdParam, body: schemas.snoozeCard }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;
    const { until } = req.body;

    const snoozedUntil = new Date(until);

    // Verify the card exists
    const existingCard = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (existingCard.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }

    // Check user has access
    const cardData = existingCard[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Set snoozedUntil (keep current status — snooze is a timing mechanism, not a status)
    await db
      .update(cards)
      .set({
        snoozedUntil,
        updatedAt: new Date(),
      })
      .where(eq(cards.id, id));

    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "snooze",
      details: { until },
    });

    // Fetch and return the updated card
    const updatedCard = await db.select().from(cards).where(eq(cards.id, id)).limit(1);

    // Get responses and reactions for the updated card
    const cardResponses = await db
      .select()
      .from(responses)
      .where(eq(responses.cardId, id))
      .orderBy(desc(responses.createdAt));

    const cardReactions = await db
      .select()
      .from(reactions)
      .where(eq(reactions.cardId, id));

    const views = await db
      .select()
      .from(cardViews)
      .where(eq(cardViews.cardId, id));

    res.json({
      ...updatedCard[0],
      responses: cardResponses,
      reactions: cardReactions,
      viewedBy: views.map((v) => v.userId),
    });
  } catch (error) {
    logger.error("Error snoozing card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to snooze card" });
  }
});

// Archive card
cardRoutes.delete("/:id", validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;
    const userId = req.user!.id;

    // Verify card exists and user has access
    const cardResult = await db.select().from(cards).where(eq(cards.id, id)).limit(1);
    if (cardResult.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardResult[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    await db
      .update(cards)
      .set({ status: "resolved", updatedAt: new Date() })
      .where(eq(cards.id, id));

    await recordTezAuditEvent({
      cardId: id,
      actorUserId: userId,
      action: "archive",
      details: {},
    });

    res.json({ success: true });
  } catch (error) {
    logger.error("Error archiving card", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to archive card" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY OF CONTEXT - Context preservation endpoints
// ═══════════════════════════════════════════════════════════════════════════

// Add context to a card (voice, text, or assistant output)
cardRoutes.post("/:id/context", aiRateLimit, validate({ params: schemas.cardIdParam, body: schemas.addContext }), async (req, res) => {
  try {
    const cardId = req.params.id as string;
    const userId = req.user!.id;
    const {
      type, // "voice" | "text" | "assistant"
      rawText,
      audioUrl,
      audioDuration,
      assistantData,
      deviceInfo,
    } = req.body;

    // Verify card exists and user has access
    const cardCheck = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (cardCheck.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardCheck[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get user name for context record
    const userResult = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    const userName = userResult[0]?.name || "Unknown User";

    const displayBullets = await generateDisplayBullets(rawText);

    const contextId = randomUUID();
    const newContext = {
      id: contextId,
      cardId,
      userId,
      userName,
      originalType: type,
      originalRawText: rawText,
      originalAudioUrl: audioUrl,
      originalAudioDuration: audioDuration,
      assistantData: type === "assistant" ? assistantData : undefined,
      capturedAt: new Date(),
      deviceInfo,
      displayBullets,
      displayGeneratedAt: new Date(),
      displayModelUsed: "claude-sonnet",
      createdAt: new Date(),
    };

    await db.insert(cardContext).values(newContext);

    // Insert into FTS5 for searchability
    const client = getClient();
    await insertIntoFTS(client, {
      contextId,
      cardId,
      userId,
      userName,
      originalType: type,
      capturedAt: newContext.capturedAt.getTime(),
      originalRawText: rawText,
      displayBullets,
    });

    // Update the card's updatedAt timestamp
    await db.update(cards).set({ updatedAt: new Date() }).where(eq(cards.id, cardId));

    res.status(201).json(newContext);
  } catch (error) {
    logger.error("Error adding context", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to add context" });
  }
});

// Get all context for a card
cardRoutes.get("/:id/context", validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const cardId = req.params.id as string;
    const userId = req.user!.id;

    // Verify card exists and user has access
    const cardCheck = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (cardCheck.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardCheck[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    const contexts = await db
      .select()
      .from(cardContext)
      .where(eq(cardContext.cardId, cardId))
      .orderBy(desc(cardContext.capturedAt));

    res.json(contexts);
  } catch (error) {
    logger.error("Error fetching context", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to fetch context" });
  }
});

// Regenerate display bullets for a context entry
cardRoutes.post("/:id/context/:contextId/regenerate", aiRateLimit, validate({ params: schemas.cardIdParam }), async (req, res) => {
  try {
    const cardId = req.params.id as string;
    const contextId = req.params.contextId as string;
    const userId = req.user!.id;

    // Verify card exists and user has access
    const cardCheck = await db.select().from(cards).where(eq(cards.id, cardId)).limit(1);
    if (cardCheck.length === 0) {
      return res.status(404).json({ error: "Card not found" });
    }
    const cardData = cardCheck[0];
    const hasAccess = cardData.fromUserId === userId || cardData.toUserIds?.includes(userId);
    if (!hasAccess) {
      return res.status(403).json({ error: "Access denied" });
    }

    // Get the context entry
    const contextResult = await db
      .select()
      .from(cardContext)
      .where(eq(cardContext.id, contextId))
      .limit(1);

    if (contextResult.length === 0) {
      return res.status(404).json({ error: "Context not found" });
    }

    const ctx = contextResult[0];

    const displayBullets = await generateDisplayBullets(ctx.originalRawText);

    await db
      .update(cardContext)
      .set({
        displayBullets,
        displayGeneratedAt: new Date(),
        displayModelUsed: "claude-sonnet",
      })
      .where(eq(cardContext.id, contextId));

    res.json({ success: true, displayBullets });
  } catch (error) {
    logger.error("Error regenerating context", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId, cardId: req.params.id });
    res.status(500).json({ error: "Failed to regenerate context" });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ASSISTANT (DEPRECATED)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * POST /api/cards/:id/assistant
 * Deprecated: assistant orchestration is now handled by OpenClaw via PA chat.
 * This endpoint remains only to provide a clear migration response.
 */
cardRoutes.post("/:id/assistant", strictRateLimit, validate({ params: schemas.cardIdParam }), async (_req, res) => {
  return res.status(410).json({
    error: {
      code: "ENDPOINT_DEPRECATED",
      message: "Card assistant is handled by OpenClaw PA chat. Use /api/openclaw/chat/completions via the frontend bridge.",
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// LIBRARY OF CONTEXT - Search endpoints
// ═══════════════════════════════════════════════════════════════════════════
//
// DEPRECATED: The library search endpoint has been moved to /api/library/search
// with FTS5 full-text search, faceted filtering, and pagination.
// This endpoint is kept for backward compatibility but will be removed in a future version.

// Search all context across cards (Library of Context) - DEPRECATED
cardRoutes.get("/library/search", validate({ query: schemas.librarySearchQuery }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query.q as string;
    const type = req.query.type as string; // "voice" | "text" | "assistant" | undefined
    const limit = 50; // Fixed limit for security

    // Build query conditions
    let queryBuilder = db
      .select({
        context: cardContext,
        card: cards,
      })
      .from(cardContext)
      .innerJoin(cards, eq(cardContext.cardId, cards.id));

    // Get all contexts that match and filter in memory for now
    // (In production, you'd want SQLite FTS5 for full-text search)
    const results = await queryBuilder.orderBy(desc(cardContext.capturedAt)).limit(limit * 2);

    // Filter results
    let filtered = results.filter((r) => {
      // User must have access to the card
      const hasAccess =
        r.card.fromUserId === userId ||
        (r.card.toUserIds as string[])?.includes(userId);
      if (!hasAccess) return false;

      // Filter by type if specified
      if (type && r.context.originalType !== type) return false;

      // Filter by search query if specified
      if (query) {
        const lowerQuery = query.toLowerCase();
        const matchesRaw = r.context.originalRawText.toLowerCase().includes(lowerQuery);
        const matchesBullets = r.context.displayBullets?.some((b) =>
          b.toLowerCase().includes(lowerQuery)
        );
        if (!matchesRaw && !matchesBullets) return false;
      }

      return true;
    });

    // Limit results
    filtered = filtered.slice(0, limit);

    res.json({
      results: filtered,
      total: filtered.length,
    });
  } catch (error) {
    logger.error("Error searching library", error instanceof Error ? error : new Error(String(error)), { requestId: req.requestId });
    res.status(500).json({ error: "Failed to search library" });
  }
});
