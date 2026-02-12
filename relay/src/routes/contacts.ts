/**
 * Contact routes — user profile registration and discovery.
 *
 * POST /contacts/register  — Register/update your profile
 * GET  /contacts/me        — Get own profile
 * GET  /contacts/search    — Search contacts by name or email
 * GET  /contacts/:userId   — Get a contact's public profile
 */

import { Router } from "express";
import { z } from "zod";
import { eq, or, like, and, inArray } from "drizzle-orm";
import { db, contacts, teamMembers } from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { config } from "../config.js";
import { recordAudit } from "../services/audit.js";

export const contactRoutes = Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /contacts/register — Register/update your profile
// ─────────────────────────────────────────────────────────────────────────────

const VALID_CHANNELS = ["tezit", "email", "whatsapp", "telegram", "sms", "imessage", "slack"] as const;

const RegisterSchema = z.object({
  displayName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().max(2000).optional(),
  // Channel routing fields
  channels: z.array(z.string().max(50)).max(10).optional(),
  preferredChannel: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  telegramId: z.string().max(100).optional(),
});

const AdminUpsertSchema = z.object({
  id: z.string().min(1).max(128),
  displayName: z.string().min(1).max(100),
  email: z.string().email().optional(),
  avatarUrl: z.string().url().max(2000).optional(),
  channels: z.array(z.string().max(50)).max(10).optional(),
  preferredChannel: z.string().max(50).optional(),
  phone: z.string().max(30).optional(),
  telegramId: z.string().max(100).optional(),
});

async function getVisibleContactIds(userId: string): Promise<string[]> {
  const memberships = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId));

  if (memberships.length === 0) {
    return [userId];
  }

  const teamIds = Array.from(new Set(memberships.map((m) => m.teamId)));
  const members = await db
    .select({ userId: teamMembers.userId })
    .from(teamMembers)
    .where(inArray(teamMembers.teamId, teamIds));

  return Array.from(new Set([userId, ...members.map((m) => m.userId)]));
}

contactRoutes.post("/register", authenticate, async (req, res) => {
  try {
    const body = RegisterSchema.parse(req.body);
    const userId = req.user!.userId;
    const now = new Date().toISOString();
    const tezAddress = `${userId}@${config.relayHost}`;

    // Check if already registered
    const existing = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);

    if (existing.length > 0) {
      // Update existing profile
      await db
        .update(contacts)
        .set({
          displayName: body.displayName,
          email: body.email ?? null,
          avatarUrl: body.avatarUrl ?? null,
          tezAddress,
          channels: body.channels ?? existing[0].channels,
          preferredChannel: body.preferredChannel ?? existing[0].preferredChannel,
          phone: body.phone ?? existing[0].phone,
          telegramId: body.telegramId ?? existing[0].telegramId,
          updatedAt: now,
        })
        .where(eq(contacts.id, userId));

      const updated = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, userId))
        .limit(1);

      await recordAudit({
        actorUserId: userId,
        action: "contact.updated",
        targetType: "contact",
        targetId: userId,
      });

      res.status(201).json({ data: updated[0] });
      return;
    }

    // Create new profile
    await db.insert(contacts).values({
      id: userId,
      displayName: body.displayName,
      email: body.email ?? null,
      avatarUrl: body.avatarUrl ?? null,
      tezAddress,
      channels: body.channels ?? [],
      preferredChannel: body.preferredChannel ?? null,
      phone: body.phone ?? null,
      telegramId: body.telegramId ?? null,
      status: "active",
      lastSeenAt: null,
      registeredAt: now,
      updatedAt: now,
    });

    const created = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);

    await recordAudit({
      actorUserId: userId,
      action: "contact.registered",
      targetType: "contact",
      targetId: userId,
    });

    res.status(201).json({ data: created[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Register contact error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to register contact" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /contacts/admin/upsert — Service-level contact sync (backend -> relay)
// ─────────────────────────────────────────────────────────────────────────────

contactRoutes.post("/admin/upsert", async (req, res) => {
  try {
    const syncToken = config.relaySyncToken.trim();
    if (!syncToken) {
      res.status(503).json({
        error: { code: "SYNC_DISABLED", message: "Relay sync token is not configured" },
      });
      return;
    }

    const providedToken = req.header("x-relay-sync-token");
    if (!providedToken || providedToken !== syncToken) {
      res.status(401).json({
        error: { code: "UNAUTHORIZED", message: "Valid relay sync token required" },
      });
      return;
    }

    const body = AdminUpsertSchema.parse(req.body);
    const now = new Date().toISOString();
    const tezAddress = `${body.id}@${config.relayHost}`;

    const existing = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, body.id))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(contacts)
        .set({
          displayName: body.displayName,
          email: body.email ?? null,
          avatarUrl: body.avatarUrl ?? null,
          tezAddress,
          channels: body.channels ?? existing[0].channels,
          preferredChannel: body.preferredChannel ?? existing[0].preferredChannel,
          phone: body.phone ?? existing[0].phone,
          telegramId: body.telegramId ?? existing[0].telegramId,
          updatedAt: now,
        })
        .where(eq(contacts.id, body.id));

      const updated = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, body.id))
        .limit(1);

      await recordAudit({
        actorUserId: "relay-sync",
        action: "contact.updated",
        targetType: "contact",
        targetId: body.id,
      });

      res.json({ data: updated[0] });
      return;
    }

    await db.insert(contacts).values({
      id: body.id,
      displayName: body.displayName,
      email: body.email ?? null,
      avatarUrl: body.avatarUrl ?? null,
      tezAddress,
      channels: body.channels ?? [],
      preferredChannel: body.preferredChannel ?? null,
      phone: body.phone ?? null,
      telegramId: body.telegramId ?? null,
      status: "active",
      lastSeenAt: null,
      registeredAt: now,
      updatedAt: now,
    });

    const created = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, body.id))
      .limit(1);

    await recordAudit({
      actorUserId: "relay-sync",
      action: "contact.registered",
      targetType: "contact",
      targetId: body.id,
    });

    res.status(201).json({ data: created[0] });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Admin upsert contact error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to sync contact" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /contacts/me — Get own profile
// ─────────────────────────────────────────────────────────────────────────────

contactRoutes.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;

    const rows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Profile not registered" } });
      return;
    }

    res.json({ data: rows[0] });
  } catch (err) {
    console.error("Get own contact error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get profile" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /contacts/search — Search contacts by name or email
// ─────────────────────────────────────────────────────────────────────────────

contactRoutes.get("/search", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const q = (req.query.q as string || "").trim();
    if (q.length < 2) {
      res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Search query must be at least 2 characters" },
      });
      return;
    }

    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 20, 1), 50);
    const pattern = `%${q}%`;
    const visibleIds = await getVisibleContactIds(userId);

    if (visibleIds.length === 0) {
      res.json({ data: [], meta: { count: 0 } });
      return;
    }

    const results = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        tezAddress: contacts.tezAddress,
        status: contacts.status,
        lastSeenAt: contacts.lastSeenAt,
      })
      .from(contacts)
      .where(
        and(
          inArray(contacts.id, visibleIds),
          or(like(contacts.displayName, pattern), like(contacts.email, pattern))
        )
      )
      .limit(limit);

    await recordAudit({
      actorUserId: userId,
      action: "contact.searched",
      targetType: "contact",
      targetId: userId,
      metadata: { query: q, resultCount: results.length },
    });

    res.json({ data: results, meta: { count: results.length } });
  } catch (err) {
    console.error("Search contacts error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to search contacts" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /contacts/:userId — Get a contact's public profile
// ─────────────────────────────────────────────────────────────────────────────

contactRoutes.get("/:userId", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const targetUserId = req.params.userId;
    const visibleIds = await getVisibleContactIds(userId);

    if (!visibleIds.includes(targetUserId)) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      return;
    }

    const rows = await db
      .select({
        id: contacts.id,
        displayName: contacts.displayName,
        tezAddress: contacts.tezAddress,
        status: contacts.status,
        lastSeenAt: contacts.lastSeenAt,
      })
      .from(contacts)
      .where(eq(contacts.id, targetUserId))
      .limit(1);

    if (rows.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Contact not found" } });
      return;
    }

    await recordAudit({
      actorUserId: userId,
      action: "contact.viewed",
      targetType: "contact",
      targetId: targetUserId,
    });

    res.json({ data: rows[0] });
  } catch (err) {
    console.error("Get contact error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get contact" } });
  }
});
