/**
 * Public Tez Routes — Guest Access via Share Tokens
 *
 * These endpoints require a share token (not JWT). They allow recipients of
 * shared tezits to view surface content and interrogate context within the
 * scope the sender defined.
 *
 * Trust model: Share tokens ARE authentication. The card owner explicitly
 * created the token, controlling what's visible and for how long.
 * AI compute is charged to the sender's resources.
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { cards, cardContext, users } from "../db/schema.js";
import { authenticateShareToken } from "../middleware/auth.js";
import { strictRateLimit, standardRateLimit } from "../middleware/rateLimit.js";
import { tezInterrogationService } from "../services/tezInterrogation.js";
import { reserveInterrogationSlot, releaseInterrogationSlot } from "../services/tezShareToken.js";
import { recordProductEvent } from "../services/tezOps.js";
import { logger } from "../middleware/logging.js";

const router = Router();

// ============= Validation Schemas =============

const guestInterrogateSchema = z.object({
  question: z.string().min(1, "Question is required").max(5000),
  sessionId: z.string().optional(),
});

const guestConversionSchema = z.object({
  email: z.string().email().optional(),
  intent: z.enum(["get_pa", "book_demo", "learn_more"]).optional(),
  source: z.enum(["guest_page", "cta", "unknown"]).optional(),
});

function parseProactiveHints(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").slice(0, 3);
  }
  if (typeof value === "string" && value.trim()) {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed.filter((item): item is string => typeof item === "string").slice(0, 3);
      }
    } catch {
      return [];
    }
  }
  return [];
}

function toEmailDomain(email: string | undefined): string | null {
  if (!email) return null;
  const [, domain] = email.split("@");
  return domain || null;
}

// ============= Routes =============

/**
 * GET /api/tez/public/:cardId
 * View a shared Tez's surface content.
 * Scope determines how much context is visible.
 */
router.get("/:cardId", authenticateShareToken, standardRateLimit, async (req, res) => {
  try {
    const shareToken = req.shareToken!;
    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    // Get sender name
    const sender = await db.query.users.findFirst({ where: eq(users.id, card.fromUserId) });
    const senderName = sender?.name || "Unknown";

    // Build response based on context scope
    const response: Record<string, unknown> = {
      id: card.id,
      content: card.content,
      summary: card.summary,
      shareIntent: card.shareIntent || "note",
      proactiveHints: parseProactiveHints(card.proactiveHints),
      senderName,
      createdAt: card.createdAt,
      contextScope: shareToken.contextScope,
      guestAccess: {
        maxInterrogations: shareToken.maxInterrogations,
        interrogationCount: shareToken.interrogationCount,
        remainingInterrogations: shareToken.maxInterrogations === null
          ? null
          : Math.max(shareToken.maxInterrogations - shareToken.interrogationCount, 0),
        expiresAt: shareToken.expiresAt,
      },
    };

    // Include context summaries if scope allows
    if (shareToken.contextScope === "full" || shareToken.contextScope === "selected") {
      const allContextItems = await db
        .select()
        .from(cardContext)
        .where(eq(cardContext.cardId, cardId));

      let visibleItems = allContextItems;
      if (shareToken.contextScope === "selected" && shareToken.contextItemIds.length > 0) {
        const allowedIds = new Set(shareToken.contextItemIds);
        visibleItems = allContextItems.filter((item) => allowedIds.has(item.id));
      }

      response.contextItems = visibleItems.map((item) => ({
        id: item.id,
        type: item.originalType,
        displayBullets: item.displayBullets,
        capturedAt: item.capturedAt,
      }));
    }

    // Audit
    await recordProductEvent({
      userId: shareToken.createdByUserId,
      teamId: card.teamId || null,
      cardId,
      eventName: "tez_share_viewed",
      metadata: {
        shareTokenId: shareToken.id,
        contextScope: shareToken.contextScope,
      },
    });

    res.json({ data: response });
  } catch (error) {
    logger.error("Public tez view error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to load shared tez" } });
  }
});

/**
 * POST /api/tez/public/:cardId/interrogate
 * Guest interrogation — ask questions about shared context.
 * Uses the card owner's AI resources.
 */
router.post("/:cardId/interrogate", authenticateShareToken, strictRateLimit, async (req, res) => {
  let slotReserved = false;
  try {
    const shareToken = req.shareToken!;
    const cardId = req.params.cardId as string;

    // Validate request body
    const parsed = guestInterrogateSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const slot = await reserveInterrogationSlot(shareToken.id);
    if (!slot.allowed) {
      return res.status(429).json({
        error: {
          code: "SHARE_TOKEN_LIMIT_REACHED",
          message: "This share token reached its interrogation limit or expired",
        },
      });
    }
    slotReserved = true;

    // Run interrogation using card owner's userId (their AI resources)
    const result = await tezInterrogationService.interrogate({
      cardId,
      question: parsed.data.question,
      userId: card.fromUserId, // Sender pays for AI
      sessionId: parsed.data.sessionId,
      guestTokenId: shareToken.id,
      contextFilter: {
        scope: shareToken.contextScope as "surface" | "full" | "selected",
        contextItemIds: shareToken.contextItemIds,
      },
    });

    // Audit
    await recordProductEvent({
      userId: card.fromUserId,
      teamId: card.teamId || null,
      cardId,
      eventName: "tez_guest_interrogated",
      metadata: {
        shareTokenId: shareToken.id,
        classification: result.classification,
        confidence: result.confidence,
        contextScope: shareToken.contextScope,
        remainingInterrogations: slot.remainingInterrogations,
      },
    });

    res.json({ data: result });
  } catch (error) {
    if (slotReserved) {
      await releaseInterrogationSlot(req.shareToken!.id).catch((releaseError) => {
        logger.warn("Failed to release reserved guest interrogation slot", {
          requestId: req.requestId,
          releaseErrorMessage: releaseError instanceof Error ? releaseError.message : String(releaseError),
        });
      });
    }

    logger.error("Public TIP interrogation error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to process interrogation" } });
  }
});

/**
 * GET /api/tez/public/:cardId/interrogate/history
 * Guest session history — retrieve Q&A pairs from a guest session.
 */
router.get("/:cardId/interrogate/history", authenticateShareToken, standardRateLimit, async (req, res) => {
  try {
    const shareToken = req.shareToken!;
    const cardId = req.params.cardId as string;

    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });

    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    const sessionId = req.query.sessionId as string | undefined;

    if (sessionId) {
      // Use card owner's userId since that's who the interrogation was stored under
      const sessions = await tezInterrogationService.getSessionHistory({
        sessionId,
        cardId,
        userId: card.fromUserId,
      });
      res.json({ data: { sessions } });
    } else {
      res.json({ data: { sessions: [] } });
    }
  } catch (error) {
    logger.error("Public TIP history error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch interrogation history" } });
  }
});

/**
 * POST /api/tez/public/:cardId/convert
 * Capture conversion intent from guest viewers.
 */
router.post("/:cardId/convert", authenticateShareToken, standardRateLimit, async (req, res) => {
  try {
    const shareToken = req.shareToken!;
    const cardId = req.params.cardId as string;

    const parsed = guestConversionSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    const card = await db.query.cards.findFirst({
      where: eq(cards.id, cardId),
    });
    if (!card) {
      return res.status(404).json({ error: { code: "CARD_NOT_FOUND", message: "Card not found" } });
    }

    await recordProductEvent({
      userId: card.fromUserId,
      teamId: card.teamId || null,
      cardId,
      eventName: "tez_guest_conversion_intent",
      metadata: {
        shareTokenId: shareToken.id,
        intent: parsed.data.intent || "get_pa",
        source: parsed.data.source || "guest_page",
        emailDomain: toEmailDomain(parsed.data.email),
      },
    });

    res.status(202).json({
      data: {
        captured: true,
        intent: parsed.data.intent || "get_pa",
      },
    });
  } catch (error) {
    logger.error("Public conversion capture error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to capture conversion intent" } });
  }
});

export default router;
