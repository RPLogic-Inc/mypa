/**
 * Admin routes — federation trust management.
 *
 * All routes require JWT auth + admin role (ADMIN_USER_IDS env var).
 */

import { Router } from "express";
import { eq } from "drizzle-orm";
import { db, federatedServers, federationOutbox } from "../db/index.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";

export const adminRoutes = Router();

// Admin guard middleware
function requireAdmin(req: import("express").Request, res: import("express").Response, next: import("express").NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    return;
  }
  if (!config.adminUserIds.includes(req.user.userId)) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin access required" } });
    return;
  }
  next();
}

adminRoutes.use(authenticate, requireAdmin);

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/federation/servers — list known servers
// ─────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/federation/servers", async (_req, res) => {
  const servers = await db.select().from(federatedServers);
  res.json({ data: servers });
});

// ─────────────────────────────────────────────────────────────────────────────
// PATCH /admin/federation/servers/:host — update trust level
// ─────────────────────────────────────────────────────────────────────────────

adminRoutes.patch("/federation/servers/:host", async (req, res) => {
  const { host } = req.params;
  const { trustLevel } = req.body;

  if (!["pending", "trusted", "blocked"].includes(trustLevel)) {
    res.status(400).json({
      error: { code: "INVALID_TRUST_LEVEL", message: "trustLevel must be pending, trusted, or blocked" },
    });
    return;
  }

  const existing = await db
    .select()
    .from(federatedServers)
    .where(eq(federatedServers.host, host))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Server not found" } });
    return;
  }

  await db
    .update(federatedServers)
    .set({ trustLevel, lastSeenAt: new Date().toISOString() })
    .where(eq(federatedServers.host, host));

  res.json({ data: { host, trustLevel, updated: true } });
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE /admin/federation/servers/:host — remove a server
// ─────────────────────────────────────────────────────────────────────────────

adminRoutes.delete("/federation/servers/:host", async (req, res) => {
  const { host } = req.params;

  const existing = await db
    .select()
    .from(federatedServers)
    .where(eq(federatedServers.host, host))
    .limit(1);

  if (existing.length === 0) {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Server not found" } });
    return;
  }

  await db.delete(federatedServers).where(eq(federatedServers.host, host));
  res.json({ data: { host, removed: true } });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /admin/federation/outbox — view delivery queue
// ─────────────────────────────────────────────────────────────────────────────

adminRoutes.get("/federation/outbox", async (req, res) => {
  const status = req.query.status as string | undefined;

  let query = db.select().from(federationOutbox);
  if (status) {
    query = query.where(eq(federationOutbox.status, status)) as typeof query;
  }

  const items = await query;
  res.json({
    data: items.map((item) => ({
      id: item.id,
      tezId: item.tezId,
      targetHost: item.targetHost,
      status: item.status,
      attempts: item.attempts,
      lastAttemptAt: item.lastAttemptAt,
      nextRetryAt: item.nextRetryAt,
      createdAt: item.createdAt,
      deliveredAt: item.deliveredAt,
      error: item.error,
    })),
  });
});
