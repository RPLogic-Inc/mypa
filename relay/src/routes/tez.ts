/**
 * Tez routes — the core API surface.
 *
 * POST /tez/share        — Send a Tez (create + deliver)
 * GET  /tez/stream       — Get feed for authenticated user
 * POST /tez/:id/reply    — Reply to a Tez (threaded)
 * GET  /tez/:id          — Get full Tez with context + provenance
 * GET  /tez/:id/thread   — Get full thread
 */

import { Router } from "express";
import { randomUUID } from "crypto";
import { z } from "zod";
import { eq, and, desc, inArray, or } from "drizzle-orm";
import { db, tez, tezContext, tezRecipients, teamMembers, conversationMembers } from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { assertTeamMember, assertTezAccess } from "../services/acl.js";
import { recordAudit } from "../services/audit.js";
import { routeToFederation } from "../services/federationOutbound.js";
import { eventBus } from "../services/eventBus.js";
import { sanitizeText, sanitizeContextItem } from "../services/sanitize.js";

export const tezRoutes = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /tez/share — Send a Tez
// ─────────────────────────────────────────────────────────────────────────────

const ShareSchema = z.object({
  teamId: z.string().uuid(),
  surfaceText: z.string().min(1).max(10000),
  type: z.enum(["note", "decision", "handoff", "question", "update"]).default("note"),
  urgency: z.enum(["critical", "high", "normal", "low", "fyi"]).default("normal"),
  actionRequested: z.string().max(500).optional(),
  visibility: z.enum(["team", "dm", "private"]).default("private"),
  recipients: z.array(z.string()).min(0).max(100).default([]),
  // Channel bridge fields — set when recording an inbound channel message as a Tez
  sourceChannel: z.string().max(50).optional(),
  sourceAddress: z.string().max(500).optional(),
  context: z
    .array(
      z.object({
        layer: z.enum(["background", "fact", "artifact", "relationship", "constraint", "hint"]),
        content: z.string(),
        mimeType: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
        source: z.enum(["stated", "inferred", "verified"]).optional(),
      })
    )
    .default([]),
});

tezRoutes.post("/share", authenticate, async (req, res) => {
  try {
    const body = ShareSchema.parse(req.body);
    const userId = req.user!.userId;

    // ACL: sender must be team member
    await assertTeamMember(userId, body.teamId);

    const now = new Date().toISOString();
    const tezId = randomUUID();
    const threadId = tezId; // root of a new thread

    // Security: sanitize user input before storage
    const sanitizedSurface = sanitizeText(body.surfaceText);

    // 1. Create the Tez
    await db.insert(tez).values({
      id: tezId,
      teamId: body.teamId,
      threadId,
      parentTezId: null,
      surfaceText: sanitizedSurface,
      type: body.type,
      urgency: body.urgency,
      actionRequested: body.actionRequested ? sanitizeText(body.actionRequested) : null,
      senderUserId: userId,
      visibility: body.visibility,
      sourceChannel: body.sourceChannel ?? null,
      sourceAddress: body.sourceAddress ?? null,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // 2. Create context items (the iceberg) — sanitized
    for (const ctx of body.context) {
      const { content, mimeType } = sanitizeContextItem(ctx);
      await db.insert(tezContext).values({
        id: randomUUID(),
        tezId,
        layer: ctx.layer,
        content,
        mimeType,
        confidence: ctx.confidence ?? null,
        source: ctx.source ?? null,
        derivedFrom: null,
        createdAt: now,
        createdBy: userId,
      });
    }

    // 3. Record recipients
    for (const recipientId of body.recipients) {
      await db.insert(tezRecipients).values({
        tezId,
        userId: recipientId,
        deliveredAt: now,
        readAt: null,
        acknowledgedAt: null,
      });
    }

    // 4. Audit
    await recordAudit({
      teamId: body.teamId,
      actorUserId: userId,
      action: "tez.shared",
      targetType: "tez",
      targetId: tezId,
      metadata: {
        type: body.type,
        visibility: body.visibility,
        recipientCount: body.recipients.length,
        contextLayerCount: body.context.length,
      },
    });

    // 5. Federation: route to remote servers if any recipients are remote
    let federationResult: { queued: number; remoteHosts: string[] } | undefined;
    if (body.recipients.length > 0) {
      federationResult = await routeToFederation(
        {
          id: tezId,
          threadId,
          parentTezId: null,
          surfaceText: body.surfaceText,
          type: body.type,
          urgency: body.urgency,
          actionRequested: body.actionRequested ?? null,
          visibility: body.visibility,
          createdAt: now,
          senderUserId: userId,
        },
        body.recipients,
      );
    }

    // 6. Emit SSE events to all relevant users
    const ssePayload = { tezId, teamId: body.teamId, senderId: userId, type: body.type };
    const notified = new Set<string>();

    if (body.visibility === "team") {
      // Team-visible: notify ALL team members
      const members = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, body.teamId));
      for (const m of members) {
        if (!notified.has(m.userId)) {
          notified.add(m.userId);
          eventBus.emit(`user:${m.userId}`, { type: "new_tez", data: ssePayload });
          if (m.userId !== userId) {
            eventBus.emit(`user:${m.userId}`, { type: "unread_update", data: { reason: "new_tez", tezId } });
          }
        }
      }
    } else {
      // DM/private: notify explicit recipients only
      for (const recipientId of body.recipients) {
        if (!notified.has(recipientId)) {
          notified.add(recipientId);
          eventBus.emit(`user:${recipientId}`, { type: "new_tez", data: ssePayload });
          eventBus.emit(`user:${recipientId}`, { type: "unread_update", data: { reason: "new_tez", tezId } });
        }
      }
    }
    // Always notify sender for multi-device sync
    if (!notified.has(userId)) {
      eventBus.emit(`user:${userId}`, { type: "new_tez", data: ssePayload });
    }

    res.status(201).json({
      data: {
        id: tezId,
        threadId,
        type: body.type,
        surfaceText: body.surfaceText,
        createdAt: now,
        ...(federationResult && federationResult.queued > 0 ? {
          federation: {
            queued: federationResult.queued,
            remoteHosts: federationResult.remoteHosts,
          },
        } : {}),
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Share error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to share Tez" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tez/stream — Get feed for authenticated user
// ─────────────────────────────────────────────────────────────────────────────

tezRoutes.get("/stream", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const teamId = req.query.teamId as string;

    if (!teamId) {
      res.status(400).json({ error: { code: "MISSING_TEAM", message: "teamId query param required" } });
      return;
    }

    await assertTeamMember(userId, teamId);

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const before = req.query.before as string | undefined;

    // Get tezits: team-visible OR where user is a recipient
    let query = db
      .select()
      .from(tez)
      .where(
        and(
          eq(tez.teamId, teamId),
          eq(tez.status, "active"),
          or(
            eq(tez.visibility, "team"),
            eq(tez.senderUserId, userId)
            // DM recipients checked separately below
          )
        )
      )
      .orderBy(desc(tez.createdAt))
      .limit(limit);

    if (before) {
      // Simple cursor pagination: created before this timestamp
      const { lt } = await import("drizzle-orm");
      query = db
        .select()
        .from(tez)
        .where(
          and(
            eq(tez.teamId, teamId),
            eq(tez.status, "active"),
            lt(tez.createdAt, before),
            or(eq(tez.visibility, "team"), eq(tez.senderUserId, userId))
          )
        )
        .orderBy(desc(tez.createdAt))
        .limit(limit);
    }

    const items = await query;

    res.json({
      data: items,
      meta: { count: items.length, hasMore: items.length === limit },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Stream error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch stream" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /tez/:id/reply — Reply to a Tez (threaded)
// ─────────────────────────────────────────────────────────────────────────────

const ReplySchema = z.object({
  surfaceText: z.string().min(1).max(10000),
  type: z.enum(["note", "decision", "handoff", "question", "update"]).default("note"),
  context: z
    .array(
      z.object({
        layer: z.enum(["background", "fact", "artifact", "relationship", "constraint", "hint"]),
        content: z.string(),
        mimeType: z.string().optional(),
        confidence: z.number().min(0).max(100).optional(),
        source: z.enum(["stated", "inferred", "verified"]).optional(),
      })
    )
    .default([]),
});

tezRoutes.post("/:id/reply", authenticate, async (req, res) => {
  try {
    const parentId = req.params.id;
    const body = ReplySchema.parse(req.body);
    const userId = req.user!.userId;

    // Find the parent Tez
    const parent = await db
      .select()
      .from(tez)
      .where(eq(tez.id, parentId))
      .limit(1);

    if (parent.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tez not found" } });
      return;
    }

    const parentTez = parent[0];

    // ACL: verify access (team membership, conversation membership, or sender)
    await assertTezAccess(userId, parentTez);

    const now = new Date().toISOString();
    const replyId = randomUUID();

    // Reply joins the parent's thread
    const threadId = parentTez.threadId || parentTez.id;

    await db.insert(tez).values({
      id: replyId,
      teamId: parentTez.teamId ?? null,
      threadId,
      parentTezId: parentId,
      surfaceText: sanitizeText(body.surfaceText),
      type: body.type,
      urgency: "normal",
      actionRequested: null,
      senderUserId: userId,
      visibility: parentTez.visibility,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Context items for the reply — sanitized
    for (const ctx of body.context) {
      const { content, mimeType } = sanitizeContextItem(ctx);
      await db.insert(tezContext).values({
        id: randomUUID(),
        tezId: replyId,
        layer: ctx.layer,
        content,
        mimeType,
        confidence: ctx.confidence ?? null,
        source: ctx.source ?? null,
        derivedFrom: null,
        createdAt: now,
        createdBy: userId,
      });
    }

    await recordAudit({
      teamId: parentTez.teamId ?? undefined,
      actorUserId: userId,
      action: "tez.replied",
      targetType: "tez",
      targetId: replyId,
      metadata: { parentTezId: parentId, threadId },
    });

    // Emit SSE events — notify the parent tez sender + any recipients
    const replyPayload = { tezId: replyId, threadId, parentTezId: parentId, senderId: userId };
    // Notify parent tez sender (if not the replier)
    if (parentTez.senderUserId !== userId) {
      eventBus.emit(`user:${parentTez.senderUserId}`, { type: "new_reply", data: replyPayload });
      eventBus.emit(`user:${parentTez.senderUserId}`, { type: "unread_update", data: { reason: "new_reply", tezId: replyId } });
    }
    // Notify all recipients of the parent tez
    const parentRecipients = await db
      .select({ userId: tezRecipients.userId })
      .from(tezRecipients)
      .where(eq(tezRecipients.tezId, parentId));
    for (const { userId: recipientId } of parentRecipients) {
      if (recipientId !== userId) {
        eventBus.emit(`user:${recipientId}`, { type: "new_reply", data: replyPayload });
        eventBus.emit(`user:${recipientId}`, { type: "unread_update", data: { reason: "new_reply", tezId: replyId } });
      }
    }
    // Notify sender for multi-device sync
    eventBus.emit(`user:${userId}`, { type: "new_reply", data: replyPayload });

    res.status(201).json({
      data: {
        id: replyId,
        threadId,
        parentTezId: parentId,
        surfaceText: body.surfaceText,
        createdAt: now,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Reply error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to reply" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /tez/:id — Update Tez status (archive / soft-delete)
// ─────────────────────────────────────────────────────────────────────────────

const UpdateStatusSchema = z.object({
  status: z.enum(["active", "archived", "deleted"]),
});

tezRoutes.patch("/:id", authenticate, async (req, res) => {
  try {
    const tezId = req.params.id;
    const body = UpdateStatusSchema.parse(req.body);
    const userId = req.user!.userId;

    const rows = await db.select().from(tez).where(eq(tez.id, tezId)).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tez not found" } });
      return;
    }

    const theTez = rows[0];

    // Only the sender can archive/delete their own Tez
    if (theTez.senderUserId !== userId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Only the sender can change Tez status" } });
      return;
    }

    const now = new Date().toISOString();
    await db
      .update(tez)
      .set({ status: body.status, updatedAt: now })
      .where(eq(tez.id, tezId));

    const auditAction = body.status === "archived" ? "tez.archived" as const
      : body.status === "deleted" ? "tez.deleted" as const
      : "tez.archived" as const; // "active" = unarchive, log as archive toggle

    await recordAudit({
      teamId: theTez.teamId ?? undefined,
      actorUserId: userId,
      action: auditAction,
      targetType: "tez",
      targetId: tezId,
      metadata: { newStatus: body.status },
    });

    // Emit SSE update so all relevant clients refresh (multi-device + other members)
    const notifyUserIds = new Set<string>();
    notifyUserIds.add(theTez.senderUserId);

    if (theTez.conversationId) {
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, theTez.conversationId));
      for (const m of members) notifyUserIds.add(m.userId);
    } else if (theTez.visibility === "team" && theTez.teamId) {
      const members = await db
        .select({ userId: teamMembers.userId })
        .from(teamMembers)
        .where(eq(teamMembers.teamId, theTez.teamId));
      for (const m of members) notifyUserIds.add(m.userId);
    } else {
      const recipients = await db
        .select({ userId: tezRecipients.userId })
        .from(tezRecipients)
        .where(eq(tezRecipients.tezId, tezId));
      for (const r of recipients) notifyUserIds.add(r.userId);
    }

    for (const uid of notifyUserIds) {
      eventBus.emit(`user:${uid}`, {
        type: "tez_updated",
        data: { tezId, status: body.status },
      });
    }

    res.json({ data: { id: tezId, status: body.status, updatedAt: now } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Update tez status error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update Tez status" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tez/:id — Get full Tez with context + provenance
// ─────────────────────────────────────────────────────────────────────────────

tezRoutes.get("/:id", authenticate, async (req, res) => {
  try {
    const tezId = req.params.id;
    const userId = req.user!.userId;

    const rows = await db.select().from(tez).where(eq(tez.id, tezId)).limit(1);
    if (rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tez not found" } });
      return;
    }

    const theTez = rows[0];

    // ACL: verify access (team membership, conversation membership, or sender)
    await assertTezAccess(userId, theTez);

    // Fetch all context layers
    const contextItems = await db
      .select()
      .from(tezContext)
      .where(eq(tezContext.tezId, tezId));

    // Fetch recipients
    const recipients = await db
      .select()
      .from(tezRecipients)
      .where(eq(tezRecipients.tezId, tezId));

    // Record the read
    await recordAudit({
      teamId: theTez.teamId ?? undefined,
      actorUserId: userId,
      action: "tez.read",
      targetType: "tez",
      targetId: tezId,
    });

    res.json({
      data: {
        ...theTez,
        context: contextItems,
        recipients,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Get tez error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get Tez" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /tez/:id/thread — Get full conversation thread
// ─────────────────────────────────────────────────────────────────────────────

tezRoutes.get("/:id/thread", authenticate, async (req, res) => {
  try {
    const tezId = req.params.id;
    const userId = req.user!.userId;

    // Find the root tez to get the threadId
    const root = await db.select().from(tez).where(eq(tez.id, tezId)).limit(1);
    if (root.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Tez not found" } });
      return;
    }

    const threadId = root[0].threadId || root[0].id;

    // ACL: verify access (team membership, conversation membership, or sender)
    await assertTezAccess(userId, root[0]);

    // Get all tezits in this thread, chronological
    const thread = await db
      .select()
      .from(tez)
      .where(and(eq(tez.threadId, threadId), eq(tez.status, "active")))
      .orderBy(tez.createdAt);

    res.json({
      data: {
        threadId,
        rootTezId: threadId,
        messages: thread,
        messageCount: thread.length,
      },
    });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Thread error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get thread" } });
  }
});
