/**
 * Tez Protocol Routes
 *
 * Implements Tezit Interrogation Protocol (TIP) endpoints:
 * - POST /api/tez/:cardId/interrogate - Interrogate a card's context
 * - GET /api/tez/:cardId/interrogate/history - Get interrogation session history
 * - GET /api/tez/:cardId/citations - Get verified citations for a card
 * - GET /api/tez/:cardId/export - Export card as Inline Tez
 * - POST /api/tez/import - Import Inline Tez markdown
 */

import { Router } from "express";
import { z } from "zod";
import { eq, or, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { cards, cardRecipients, cardContext, users, userSettings, mirrorAuditLog } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { strictRateLimit, standardRateLimit } from "../middleware/rateLimit.js";
import { tezInterrogationService } from "../services/tezInterrogation.js";
import { tezInlineTezService } from "../services/tezInlineTez.js";
import { exportPortableTez } from "../services/tezPortableExport.js";
import { parseTezUri, isValidTezUri } from "../services/tezUri.js";
import { renderMirror, type MirrorTemplate } from "../services/tezMirrorRenderer.js";
import { recordProductEvent, recordTezAuditEvent } from "../services/tezOps.js";
import {
  createShareToken,
  listShareTokens,
  revokeShareToken,
  updateTokenScope,
} from "../services/tezShareToken.js";
import { logger } from "../middleware/logging.js";
import { randomUUID } from "crypto";
import {
  TEZ_GUEST_MAX_EXPIRY_HOURS,
  TEZ_GUEST_MAX_INTERROGATIONS,
  TEZ_PUBLIC_BASE_URL,
  TEZ_SHARE_PATH_PREFIX,
} from "../config/app.js";

const router = Router();

// ============= Validation Schemas =============

const interrogateSchema = z.object({
  question: z.string().min(1, "Question is required").max(5000),
  sessionId: z.string().optional(),
});

const importSchema = z.object({
  markdown: z.string().min(1, "Markdown content is required").max(100000),
});

// ============= Access Check Helper =============

/**
 * Check if a user has access to a card (is sender or recipient).
 */
async function userHasCardAccess(cardId: string, userId: string): Promise<boolean> {
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  });

  if (!card) return false;

  // Sender always has access
  if (card.fromUserId === userId) return true;

  // Check recipients
  const recipients = await db
    .select()
    .from(cardRecipients)
    .where(eq(cardRecipients.cardId, cardId));

  return recipients.some((r) => r.userId === userId);
}

// ============= Routes =============

/**
 * POST /api/tez/:cardId/interrogate
 * Interrogate a card's context - ask questions answered only from transmitted context.
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
router.post("/:cardId/interrogate", authenticate, strictRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    // Validate request body
    const parsed = interrogateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    // Check card exists
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    // Check access
    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have access to this card" } });
    }

    // Run interrogation
    const result = await tezInterrogationService.interrogate({
      cardId,
      question: parsed.data.question,
      userId,
      sessionId: parsed.data.sessionId,
    });

    await recordProductEvent({
      userId,
      teamId: card.teamId || null,
      cardId,
      eventName: "tez_interrogated",
      metadata: {
        classification: result.classification,
        confidence: result.confidence,
      },
    });

    res.json({ data: result });
  } catch (error) {
    logger.error("TIP interrogation error", error as Error, {
      requestId: req.requestId,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to process interrogation" } });
  }
});

/**
 * GET /api/tez/:cardId/interrogate/history
 * Get interrogation session history for a card.
 */
router.get("/:cardId/interrogate/history", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    // Check card exists
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    // Check access
    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have access to this card" } });
    }

    const sessionId = req.query.sessionId as string | undefined;

    if (sessionId) {
      const sessions = await tezInterrogationService.getSessionHistory({ sessionId, cardId, userId });
      res.json({ data: { sessions } });
    } else {
      // Return empty if no sessionId specified
      res.json({ data: { sessions: [] } });
    }
  } catch (error) {
    logger.error("TIP history error", error as Error, {
      requestId: req.requestId,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch interrogation history" } });
  }
});

/**
 * GET /api/tez/:cardId/citations
 * Get all verified citations for a card from previous interrogations.
 */
router.get("/:cardId/citations", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    // Check card exists
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    // Check access
    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have access to this card" } });
    }

    const citations = await tezInterrogationService.getCitationsForCard(cardId);

    res.json({ data: { citations } });
  } catch (error) {
    logger.error("TIP citations error", error as Error, {
      requestId: req.requestId,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch citations" } });
  }
});

/**
 * GET /api/tez/:cardId/export
 * Export a card as Inline Tez markdown format.
 */
router.get("/:cardId/export", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    // Check card exists
    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    // Check access
    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "You do not have access to this card" } });
    }

    const markdown = await tezInlineTezService.exportCardAsInlineTez(cardId);
    const filename = `tez-${cardId.slice(0, 8)}.md`;

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "export",
      details: { format: "inline" },
    });

    res.json({ data: { markdown, filename } });
  } catch (error) {
    logger.error("Tez export error", error as Error, {
      requestId: req.requestId,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to export card as Inline Tez" } });
  }
});

/**
 * POST /api/tez/import
 * Import Inline Tez markdown and create a card.
 */
router.post("/import", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    // Validate request body
    const parsed = importSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    const result = await tezInlineTezService.importInlineTez(parsed.data.markdown, userId);

    await recordTezAuditEvent({
      cardId: result.cardId,
      actorUserId: userId,
      action: "import",
      details: { format: "inline" },
    });

    res.status(201).json({ data: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";

    if (message.includes("Invalid Inline Tez format") ||
        message.includes("Inline Tez import failed") ||
        message.includes("Duplicate key") ||
        message.includes("Duplicate context label") ||
        message.includes("Invalid URL") ||
        message.includes("validation failed")) {
      return res.status(400).json({
        error: { code: "INVALID_FORMAT", message },
      });
    }

    logger.error("Tez import error", error as Error, {
      requestId: req.requestId,
    });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to import Inline Tez" } });
  }
});

// ============= SSE Streaming Interrogation =============

const streamInterrogateSchema = z.object({
  question: z.string().min(1).max(5000),
  sessionId: z.string().optional(),
});

/**
 * GET /api/tez/:cardId/interrogate/stream
 * SSE streaming version of interrogation.
 * Events: tip.session.start, tip.token, tip.citation, tip.response.end, error
 */
router.get("/:cardId/interrogate/stream", authenticate, strictRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;
    const question = req.query.question as string;
    const sessionId = req.query.sessionId as string | undefined;

    if (!question || question.length === 0) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "question query param required" } });
    }

    // Check card exists and access
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    // Set up SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const tipSessionId = sessionId || randomUUID();

    // Send session start event
    res.write(`event: tip.session.start\ndata: ${JSON.stringify({ sessionId: tipSessionId, cardId })}\n\n`);

    // Run interrogation (non-streaming, but we emit events)
    try {
      const result = await tezInterrogationService.interrogate({
        cardId,
        question,
        userId,
        sessionId: tipSessionId,
      });

      await recordProductEvent({
        userId,
        teamId: card.teamId || null,
        cardId,
        eventName: "tez_interrogated",
        metadata: {
          mode: "stream",
          classification: result.classification,
          confidence: result.confidence,
        },
      });

      // Stream tokens (simulate token-by-token for the answer)
      const words = result.answer.split(" ");
      for (let i = 0; i < words.length; i++) {
        const token = (i === 0 ? "" : " ") + words[i];
        res.write(`event: tip.token\ndata: ${JSON.stringify({ token })}\n\n`);
      }

      // Send citations
      for (const citation of result.citations) {
        res.write(`event: tip.citation\ndata: ${JSON.stringify(citation)}\n\n`);
      }

      // Send response end
      res.write(`event: tip.response.end\ndata: ${JSON.stringify({
        sessionId: tipSessionId,
        classification: result.classification,
        confidence: result.confidence,
        responseTimeMs: result.responseTimeMs,
        modelUsed: result.modelUsed,
      })}\n\n`);
    } catch (error) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Interrogation failed" })}\n\n`);
    }

    res.end();
  } catch (error) {
    logger.error("TIP stream error", error as Error, { requestId: req.requestId });
    if (!res.headersSent) {
      res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to start stream" } });
    } else {
      res.write(`event: error\ndata: ${JSON.stringify({ error: "Internal error" })}\n\n`);
      res.end();
    }
  }
});

// ============= Portable Export =============

/**
 * GET /api/tez/:cardId/export/portable
 * Export a card as a Level 2 Portable Tez bundle.
 */
router.get("/:cardId/export/portable", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    const bundle = await exportPortableTez(cardId);

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "export",
      details: { format: "portable" },
    });

    res.json({ data: bundle });
  } catch (error) {
    logger.error("Portable export error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to export portable tez" } });
  }
});

// ============= URI Resolution =============

/**
 * GET /api/tez/resolve?uri=tez://...
 * Resolve a tez:// URI to its underlying resource.
 */
router.get("/resolve", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const uri = req.query.uri as string;
    if (!uri || !isValidTezUri(uri)) {
      return res.status(400).json({ error: { code: "INVALID_URI", message: "Valid tez:// URI required" } });
    }

    const parsed = parseTezUri(uri);

    // Check card exists and access
    const card = await db.query.cards.findFirst({ where: eq(cards.id, parsed.cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(parsed.cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    // Route based on subresource
    if (!parsed.subresource) {
      // Return the card itself
      res.json({ data: { type: "card", card } });
    } else if (parsed.subresource === "context" && parsed.subresourceId) {
      const ctx = await db.query.cardContext.findFirst({
        where: eq(cardContext.id, parsed.subresourceId),
      });
      if (!ctx) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Context item not found" } });
      }
      res.json({ data: { type: "context", context: ctx } });
    } else if (parsed.subresource === "interrogate") {
      res.json({ data: { type: "interrogate", cardId: parsed.cardId, sessionId: parsed.params?.sessionId } });
    } else if (parsed.subresource === "fork" && parsed.subresourceId) {
      const fork = await db.query.cards.findFirst({ where: eq(cards.id, parsed.subresourceId) });
      if (!fork) {
        return res.status(404).json({ error: { code: "NOT_FOUND", message: "Fork not found" } });
      }
      res.json({ data: { type: "fork", card: fork } });
    } else {
      res.status(400).json({ error: { code: "UNKNOWN_SUBRESOURCE", message: `Unknown subresource: ${parsed.subresource}` } });
    }
  } catch (error) {
    logger.error("URI resolve error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to resolve URI" } });
  }
});

// ============= Forking (Counter-Tez) =============

const forkSchema = z.object({
  forkType: z.enum(["counter", "extension", "reframe", "update"]),
  content: z.string().min(1).max(10000),
  summary: z.string().max(500).optional(),
});

const mirrorRenderSchema = z.object({
  template: z.enum(["teaser", "surface", "surface_facts"]),
});

const mirrorSendSchema = z.object({
  template: z.enum(["teaser", "surface", "surface_facts"]),
  destination: z.enum(["sms", "email", "clipboard", "other"]),
  recipientHint: z.string().max(100).optional(),
});

/**
 * POST /api/tez/:cardId/fork
 * Create a fork (counter-tez) of an existing card.
 */
router.post("/:cardId/fork", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    const parsed = forkSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    // Check original card exists and access
    const originalCard = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!originalCard) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    // Create the forked card
    const forkId = randomUUID();
    const forkCard = {
      id: forkId,
      content: parsed.data.content,
      summary: parsed.data.summary || `${parsed.data.forkType} of: ${originalCard.summary || originalCard.content.slice(0, 50)}`,
      fromUserId: userId,
      toUserIds: originalCard.toUserIds || [],
      visibility: originalCard.visibility,
      status: "pending",
      forkedFromId: cardId,
      forkType: parsed.data.forkType,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(cards).values(forkCard);

    res.status(201).json({ data: forkCard });
  } catch (error) {
    logger.error("Fork error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create fork" } });
  }
});

/**
 * GET /api/tez/:cardId/lineage
 * Get the fork tree for a card (ancestors and descendants).
 */
router.get("/:cardId/lineage", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    // Find ancestors (walk up forkedFromId chain)
    const ancestors: Array<{ id: string; forkType: string | null; summary: string | null }> = [];
    let currentId = card.forkedFromId;
    while (currentId) {
      const ancestor = await db.query.cards.findFirst({ where: eq(cards.id, currentId) });
      if (!ancestor) break;
      ancestors.push({ id: ancestor.id, forkType: ancestor.forkType, summary: ancestor.summary });
      currentId = ancestor.forkedFromId;
    }

    // Find descendants (cards forked from this one)
    const descendants = await db
      .select({ id: cards.id, forkType: cards.forkType, summary: cards.summary, createdAt: cards.createdAt })
      .from(cards)
      .where(eq(cards.forkedFromId, cardId))
      .orderBy(desc(cards.createdAt));

    res.json({
      data: {
        card: { id: card.id, summary: card.summary, forkType: card.forkType, forkedFromId: card.forkedFromId },
        ancestors,
        descendants,
      },
    });
  } catch (error) {
    logger.error("Lineage error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get lineage" } });
  }
});

// ============= Tez Mirror =============

/**
 * POST /api/tez/:cardId/mirror
 * Render a mirror preview of a tez for external sharing.
 */
router.post("/:cardId/mirror", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });

    const cardId = req.params.cardId as string;

    const parsed = mirrorRenderSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues } });
    }

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });

    // Get sender name
    const sender = await db.query.users.findFirst({ where: eq(users.id, card.fromUserId) });
    const senderName = sender?.name || "Unknown";

    // Get user's mirror settings for deep link preference
    const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    const appendDeepLink = settings?.mirrorAppendDeeplink !== false; // default true

    // Get context highlights for surface_facts template
    let contextHighlights: string[] = [];
    if (parsed.data.template === "surface_facts") {
      const contexts = await db.select().from(cardContext).where(eq(cardContext.cardId, cardId));
      contextHighlights = contexts
        .flatMap(c => (c.displayBullets as string[]) || [])
        .slice(0, 5);
    }

    const result = renderMirror(parsed.data.template, {
      cardId,
      content: card.content,
      summary: card.summary,
      senderName,
      createdAt: card.createdAt as Date || new Date(),
      contextHighlights,
      appendDeepLink,
    });

    res.json({ data: result });
  } catch (error) {
    logger.error("Mirror render error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to render mirror" } });
  }
});

/**
 * POST /api/tez/:cardId/mirror/send
 * Log a mirror share for audit transparency. Rate-limited strictly.
 */
router.post("/:cardId/mirror/send", authenticate, strictRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });

    const cardId = req.params.cardId as string;

    const parsed = mirrorSendSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues } });
    }

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });

    // Get user settings
    const settings = await db.query.userSettings.findFirst({ where: eq(userSettings.userId, userId) });
    const appendDeepLink = settings?.mirrorAppendDeeplink !== false;

    // Get sender name for rendering (to compute char count)
    const sender = await db.query.users.findFirst({ where: eq(users.id, card.fromUserId) });
    const senderName = sender?.name || "Unknown";

    let contextHighlights: string[] = [];
    if (parsed.data.template === "surface_facts") {
      const contexts = await db.select().from(cardContext).where(eq(cardContext.cardId, cardId));
      contextHighlights = contexts.flatMap(c => (c.displayBullets as string[]) || []).slice(0, 5);
    }

    const rendered = renderMirror(parsed.data.template, {
      cardId,
      content: card.content,
      summary: card.summary,
      senderName,
      createdAt: card.createdAt as Date || new Date(),
      contextHighlights,
      appendDeepLink,
    });

    // Log audit entry
    await db.insert(mirrorAuditLog).values({
      id: randomUUID(),
      cardId,
      userId,
      template: parsed.data.template,
      destination: parsed.data.destination,
      recipientHint: parsed.data.recipientHint || null,
      charCount: rendered.charCount,
      deepLinkIncluded: appendDeepLink,
    });

    res.json({ data: { logged: true } });
  } catch (error) {
    logger.error("Mirror send error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to log mirror share" } });
  }
});

// ============= Share Token Management =============

const createShareTokenSchema = z.object({
  label: z.string().max(100).optional(),
  contextScope: z.enum(["surface", "full", "selected"]).optional(),
  contextItemIds: z.array(z.string()).optional(),
  maxInterrogations: z.number().int().min(1).max(TEZ_GUEST_MAX_INTERROGATIONS).nullable().optional(),
  expiresInHours: z.number().min(0.5).max(TEZ_GUEST_MAX_EXPIRY_HOURS).nullable().optional(),
});

const updateShareTokenSchema = z.object({
  contextScope: z.enum(["surface", "full", "selected"]).optional(),
  contextItemIds: z.array(z.string()).optional(),
  maxInterrogations: z.number().int().min(1).max(TEZ_GUEST_MAX_INTERROGATIONS).nullable().optional(),
});

/**
 * POST /api/tez/:cardId/share
 * Create a share token for guest access to this Tez.
 * Returns the raw token (shown once) and a shareable URL.
 */
router.post("/:cardId/share", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    const parsed = createShareTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    if (parsed.data.contextScope === "selected" && (!parsed.data.contextItemIds || parsed.data.contextItemIds.length === 0)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "contextItemIds is required when contextScope is selected",
        },
      });
    }

    const { rawToken, tokenRecord } = await createShareToken(cardId, userId, {
      label: parsed.data.label,
      contextScope: parsed.data.contextScope,
      contextItemIds: parsed.data.contextScope === "selected"
        ? (parsed.data.contextItemIds || [])
        : [],
      maxInterrogations: parsed.data.maxInterrogations,
      expiresInHours: parsed.data.expiresInHours,
    });

    const publicBaseUrl = TEZ_PUBLIC_BASE_URL.replace(/\/+$/, "");
    const sharePathPrefix = TEZ_SHARE_PATH_PREFIX.startsWith("/")
      ? TEZ_SHARE_PATH_PREFIX
      : `/${TEZ_SHARE_PATH_PREFIX}`;
    const shareUrl = `${publicBaseUrl}${sharePathPrefix}/${cardId}?token=${encodeURIComponent(rawToken)}`;

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "share",
      details: {
        shareTokenId: tokenRecord.id,
        contextScope: tokenRecord.contextScope,
        maxInterrogations: tokenRecord.maxInterrogations,
        expiresAt: tokenRecord.expiresAt,
      },
    });

    res.status(201).json({
      data: {
        token: rawToken,
        shareUrl,
        tokenId: tokenRecord.id,
        contextScope: tokenRecord.contextScope,
        maxInterrogations: tokenRecord.maxInterrogations,
        expiresAt: tokenRecord.expiresAt,
      },
    });
  } catch (error) {
    logger.error("Share token creation error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create share token" } });
  }
});

/**
 * GET /api/tez/:cardId/shares
 * List all share tokens for a card (for the owner to manage).
 * Never returns raw token values.
 */
router.get("/:cardId/shares", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    const tokens = await listShareTokens(cardId, userId);

    res.json({
      data: {
        tokens: tokens.map((t) => ({
          id: t.id,
          label: t.label,
          contextScope: t.contextScope,
          contextItemIds: t.contextItemIds,
          maxInterrogations: t.maxInterrogations,
          interrogationCount: t.interrogationCount,
          expiresAt: t.expiresAt,
          revokedAt: t.revokedAt,
          lastUsedAt: t.lastUsedAt,
          createdAt: t.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error("Share token list error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list share tokens" } });
  }
});

/**
 * PATCH /api/tez/:cardId/share/:tokenId
 * Update a share token's scope — the "share more" / "pull back" mechanism.
 */
router.patch("/:cardId/share/:tokenId", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cardId = req.params.cardId as string;
    const tokenId = req.params.tokenId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    const parsed = updateShareTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    const updated = await updateTokenScope(tokenId, userId, {
      contextScope: parsed.data.contextScope,
      contextItemIds: parsed.data.contextItemIds,
      maxInterrogations: parsed.data.maxInterrogations,
    });

    if (!updated) {
      return res.status(404).json({ error: { code: "TOKEN_NOT_FOUND", message: "Share token not found or already revoked" } });
    }

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "share",
      details: {
        subAction: "scope_updated",
        shareTokenId: tokenId,
        contextScope: updated.contextScope,
      },
    });

    res.json({
      data: {
        id: updated.id,
        contextScope: updated.contextScope,
        contextItemIds: updated.contextItemIds,
        maxInterrogations: updated.maxInterrogations,
      },
    });
  } catch (error) {
    logger.error("Share token update error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update share token" } });
  }
});

/**
 * DELETE /api/tez/:cardId/share/:tokenId
 * Revoke a share token — the ultimate "pull back".
 */
router.delete("/:cardId/share/:tokenId", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    const cardId = req.params.cardId as string;
    const tokenId = req.params.tokenId as string;

    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const hasAccess = await userHasCardAccess(cardId, userId);
    if (!hasAccess) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: "Access denied" } });
    }

    const revoked = await revokeShareToken(tokenId, userId);
    if (!revoked) {
      return res.status(404).json({ error: { code: "TOKEN_NOT_FOUND", message: "Share token not found" } });
    }

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "share",
      details: {
        subAction: "token_revoked",
        shareTokenId: tokenId,
      },
    });

    res.json({ data: { revoked: true } });
  } catch (error) {
    logger.error("Share token revocation error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to revoke share token" } });
  }
});

// ============= Share With Link (Agent Convenience) =============

/**
 * POST /api/tez/:cardId/share-with-link
 * Creates a share token and returns the full shareable URL.
 * Used by the agent when routing a Tez to a lossy channel.
 */
router.post("/:cardId/share-with-link", authenticate, standardRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const cardId = req.params.cardId as string;

    // Verify card ownership
    const card = await db.query.cards.findFirst({ where: eq(cards.id, cardId) });
    if (!card || card.fromUserId !== userId) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found or not owned by you" } });
    }

    const { contextScope, maxInterrogations, expiresInHours, label } = req.body || {};

    const { rawToken, tokenRecord } = await createShareToken(cardId, userId, {
      contextScope: contextScope || "full",
      maxInterrogations: maxInterrogations ?? 100,
      expiresInHours: expiresInHours ?? 168, // 7 days default
      label: label || "Agent-generated share link",
    });

    // Build the full shareable URL
    const baseUrl = process.env.PUBLIC_URL || "https://app.mypa.chat";
    const shareUrl = `${baseUrl}/api/tez/public/${cardId}?token=${rawToken}`;
    const interrogateUrl = `${baseUrl}/api/tez/public/${cardId}/interrogate?token=${rawToken}`;

    await recordTezAuditEvent({
      cardId,
      actorUserId: userId,
      action: "share_link_created",
      details: {
        tokenId: tokenRecord.id,
        contextScope: tokenRecord.contextScope,
        expiresAt: tokenRecord.expiresAt,
      },
    });

    res.json({
      data: {
        tokenId: tokenRecord.id,
        shareUrl,
        interrogateUrl,
        expiresAt: tokenRecord.expiresAt,
        contextScope: tokenRecord.contextScope,
        maxInterrogations: tokenRecord.maxInterrogations,
      },
    });
  } catch (error) {
    logger.error("Share with link error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create share link" } });
  }
});

export default router;
