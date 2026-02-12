/**
 * Channel routes — provider config (admin), user connections, webhooks.
 *
 * Admin endpoints:
 *   GET    /channels/providers                         — List provider status
 *   PATCH  /channels/providers/:provider               — Configure/enable provider
 *   POST   /channels/providers/:provider/test          — Test provider health
 *   POST   /channels/providers/:provider/rotate-webhook-secret — Rotate secret
 *
 * User endpoints:
 *   GET    /channels/me                                — My channel links
 *   POST   /channels/me/:provider/connect/start        — Start connection flow
 *   GET    /channels/me/:provider/connect/status       — Poll connection status
 *   POST   /channels/me/:provider/disconnect           — Disconnect channel
 *   PATCH  /channels/me/routing                        — Update routing prefs
 *
 * Webhook endpoint:
 *   POST   /channels/webhooks/:provider                — Inbound events from providers
 */

import { Router } from "express";
import { randomUUID, randomBytes, createHmac, timingSafeEqual } from "crypto";
import { z } from "zod";
import { eq, and, sql } from "drizzle-orm";
import { db, channelProviderConfig, userChannelLink, contacts, teamMembers } from "../db/index.js";
import { authenticate } from "../middleware/auth.js";
import { isTeamAdmin, assertTeamMember } from "../services/acl.js";
import { recordAudit } from "../services/audit.js";
import { resolveChannelsForRecipients } from "../services/channelRouting.js";

export const channelRoutes = Router();

const SUPPORTED_PROVIDERS = ["telegram", "whatsapp", "slack", "imessage", "sms", "email"] as const;
type Provider = (typeof SUPPORTED_PROVIDERS)[number];

function isValidProvider(p: string): p is Provider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(p);
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: resolve the user's active team
// ─────────────────────────────────────────────────────────────────────────────

async function getUserActiveTeamId(userId: string): Promise<string | null> {
  const rows = await db
    .select({ teamId: teamMembers.teamId })
    .from(teamMembers)
    .where(eq(teamMembers.userId, userId))
    .limit(1);
  return rows.length > 0 ? rows[0].teamId : null;
}

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: GET /channels/providers — List provider status for team
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.get("/providers", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    if (!(await isTeamAdmin(userId, teamId))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin or team_lead required" } });
      return;
    }

    // Get configured providers
    const configs = await db
      .select()
      .from(channelProviderConfig)
      .where(eq(channelProviderConfig.teamId, teamId));

    const configMap = new Map(configs.map((c) => [c.provider, c]));

    // Count connected links per provider
    const linkCounts = await db
      .select({
        provider: userChannelLink.provider,
        count: sql<number>`count(*)`,
      })
      .from(userChannelLink)
      .where(and(eq(userChannelLink.teamId, teamId), eq(userChannelLink.status, "connected")))
      .groupBy(userChannelLink.provider);

    const countMap = new Map(linkCounts.map((l) => [l.provider, l.count]));

    const data = SUPPORTED_PROVIDERS.map((provider) => {
      const cfg = configMap.get(provider);
      return {
        provider,
        enabled: cfg?.enabled ?? false,
        configured: !!cfg?.configRef,
        healthy: cfg?.enabled && !!cfg?.configRef, // simplified health check
        connectionCount: countMap.get(provider) ?? 0,
      };
    });

    res.json({ data });
  } catch (err) {
    console.error("List channel providers error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list providers" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: PATCH /channels/providers/:provider — Configure/enable provider
// ─────────────────────────────────────────────────────────────────────────────

const PatchProviderSchema = z.object({
  enabled: z.boolean().optional(),
  configRef: z.string().max(500).optional(),
});

channelRoutes.patch("/providers/:provider", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    if (!(await isTeamAdmin(userId, teamId))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin or team_lead required" } });
      return;
    }

    const body = PatchProviderSchema.parse(req.body);
    const now = new Date().toISOString();

    const existing = await db
      .select()
      .from(channelProviderConfig)
      .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)))
      .limit(1);

    if (existing.length > 0) {
      const updates: Record<string, unknown> = { updatedBy: userId, updatedAt: now };
      if (body.enabled !== undefined) updates.enabled = body.enabled;
      if (body.configRef !== undefined) updates.configRef = body.configRef;

      await db
        .update(channelProviderConfig)
        .set(updates)
        .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)));
    } else {
      await db.insert(channelProviderConfig).values({
        teamId,
        provider,
        enabled: body.enabled ?? false,
        configRef: body.configRef ?? null,
        webhookSecretRef: null,
        createdBy: userId,
        updatedBy: userId,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.provider.updated",
      targetType: "channel",
      targetId: provider,
      metadata: { enabled: body.enabled, hasConfig: !!body.configRef },
    });

    const updated = await db
      .select()
      .from(channelProviderConfig)
      .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)))
      .limit(1);

    res.json({
      data: {
        provider,
        enabled: updated[0]?.enabled ?? false,
        configured: !!updated[0]?.configRef,
        updatedAt: updated[0]?.updatedAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Update channel provider error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update provider" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /channels/providers/:provider/test — Health check
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.post("/providers/:provider/test", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    if (!(await isTeamAdmin(userId, teamId))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin or team_lead required" } });
      return;
    }

    const config = await db
      .select()
      .from(channelProviderConfig)
      .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)))
      .limit(1);

    if (config.length === 0 || !config[0].configRef) {
      res.json({ data: { ok: false, message: "Provider not configured" } });
      return;
    }

    if (!config[0].enabled) {
      res.json({ data: { ok: false, message: "Provider is disabled" } });
      return;
    }

    // TODO: Actual provider SDK health check per-provider
    // For now, return ok if configured + enabled
    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.provider.tested",
      targetType: "channel",
      targetId: provider,
      metadata: { result: "ok" },
    });

    res.json({ data: { ok: true, message: "Provider configured and enabled" } });
  } catch (err) {
    console.error("Test channel provider error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to test provider" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ADMIN: POST /channels/providers/:provider/rotate-webhook-secret
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.post("/providers/:provider/rotate-webhook-secret", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    if (!(await isTeamAdmin(userId, teamId))) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Admin or team_lead required" } });
      return;
    }

    const now = new Date().toISOString();
    const newSecret = randomBytes(32).toString("hex");

    await db
      .update(channelProviderConfig)
      .set({ webhookSecretRef: newSecret, updatedBy: userId, updatedAt: now })
      .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)));

    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.provider.updated",
      targetType: "channel",
      targetId: provider,
      metadata: { rotatedWebhookSecret: true },
    });

    res.json({ data: { rotated: true, updatedAt: now } });
  } catch (err) {
    console.error("Rotate webhook secret error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to rotate secret" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: GET /channels/me — My channel links
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    // Get team provider configs
    const configs = await db
      .select()
      .from(channelProviderConfig)
      .where(eq(channelProviderConfig.teamId, teamId));
    const configMap = new Map(configs.map((c) => [c.provider, c]));

    // Get user's own links
    const links = await db
      .select()
      .from(userChannelLink)
      .where(and(eq(userChannelLink.teamId, teamId), eq(userChannelLink.userId, userId)));
    const linkMap = new Map(links.map((l) => [l.provider, l]));

    const data = SUPPORTED_PROVIDERS.map((provider) => {
      const cfg = configMap.get(provider);
      const link = linkMap.get(provider);
      const providerEnabled = cfg?.enabled ?? false;
      return {
        provider,
        providerEnabled,
        status: link?.status ?? "not_connected",
        handle: link?.handle ?? null,
        lastVerifiedAt: link?.lastVerifiedAt ?? null,
        canConnect: providerEnabled && (!link || link.status === "disconnected" || link.status === "failed"),
      };
    });

    res.json({ data });
  } catch (err) {
    console.error("Get my channels error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get channels" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: POST /channels/me/:provider/connect/start — Begin connection flow
// ─────────────────────────────────────────────────────────────────────────────

const ConnectStartSchema = z.object({
  handle: z.string().max(200).optional(),
});

channelRoutes.post("/me/:provider/connect/start", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    // Check provider is enabled
    const cfg = await db
      .select()
      .from(channelProviderConfig)
      .where(and(eq(channelProviderConfig.teamId, teamId), eq(channelProviderConfig.provider, provider)))
      .limit(1);

    if (cfg.length === 0 || !cfg[0].enabled) {
      res.status(400).json({ error: { code: "CHANNEL_PROVIDER_DISABLED", message: "Provider is not enabled for this team" } });
      return;
    }

    if (!cfg[0].configRef) {
      res.status(400).json({ error: { code: "CHANNEL_PROVIDER_NOT_CONFIGURED", message: "Provider is not configured" } });
      return;
    }

    // Check not already connected
    const existingLink = await db
      .select()
      .from(userChannelLink)
      .where(
        and(
          eq(userChannelLink.teamId, teamId),
          eq(userChannelLink.userId, userId),
          eq(userChannelLink.provider, provider)
        )
      )
      .limit(1);

    if (existingLink.length > 0 && existingLink[0].status === "connected") {
      res.status(400).json({ error: { code: "CHANNEL_ALREADY_CONNECTED", message: "Already connected to this provider" } });
      return;
    }

    const body = ConnectStartSchema.parse(req.body);
    const now = new Date().toISOString();
    const state = randomBytes(24).toString("hex"); // opaque state token
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString(); // 15 min

    if (existingLink.length > 0) {
      // Update existing link to pending
      await db
        .update(userChannelLink)
        .set({
          status: "pending",
          handle: body.handle ?? existingLink[0].handle,
          metadata: { state, expiresAt },
          failureReason: null,
          updatedAt: now,
        })
        .where(eq(userChannelLink.id, existingLink[0].id));
    } else {
      // Create new link
      await db.insert(userChannelLink).values({
        id: randomUUID(),
        teamId,
        userId,
        provider,
        status: "pending",
        externalUserId: null,
        externalChatId: null,
        handle: body.handle ?? null,
        metadata: { state, expiresAt },
        lastVerifiedAt: null,
        failureReason: null,
        createdAt: now,
        updatedAt: now,
      });
    }

    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.connect.started",
      targetType: "channel",
      targetId: provider,
      metadata: { provider },
    });

    // TODO: Per-provider, generate a real connect URL (e.g. Telegram bot deep link)
    // For now, return the state token for webhook callback matching
    res.json({
      data: {
        state,
        connectUrl: null, // provider-specific URL goes here
        expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Connect start error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to start connection" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: GET /channels/me/:provider/connect/status — Poll connection status
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.get("/me/:provider/connect/status", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    const link = await db
      .select()
      .from(userChannelLink)
      .where(
        and(
          eq(userChannelLink.teamId, teamId),
          eq(userChannelLink.userId, userId),
          eq(userChannelLink.provider, provider)
        )
      )
      .limit(1);

    if (link.length === 0) {
      res.status(404).json({ error: { code: "CHANNEL_LINK_NOT_FOUND", message: "No connection found" } });
      return;
    }

    res.json({
      data: {
        status: link[0].status,
        handle: link[0].handle,
        failureReason: link[0].failureReason,
        lastVerifiedAt: link[0].lastVerifiedAt,
      },
    });
  } catch (err) {
    console.error("Connect status error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get status" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: POST /channels/me/:provider/disconnect
// ─────────────────────────────────────────────────────────────────────────────

const DisconnectSchema = z.object({ confirm: z.literal(true) });

channelRoutes.post("/me/:provider/disconnect", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unsupported provider: ${provider}` } });
      return;
    }

    DisconnectSchema.parse(req.body);

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    const link = await db
      .select()
      .from(userChannelLink)
      .where(
        and(
          eq(userChannelLink.teamId, teamId),
          eq(userChannelLink.userId, userId),
          eq(userChannelLink.provider, provider)
        )
      )
      .limit(1);

    if (link.length === 0) {
      res.status(404).json({ error: { code: "CHANNEL_LINK_NOT_FOUND", message: "No connection found" } });
      return;
    }

    const now = new Date().toISOString();
    await db
      .update(userChannelLink)
      .set({ status: "disconnected", updatedAt: now })
      .where(eq(userChannelLink.id, link[0].id));

    // Remove from contact routing if present
    const contact = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);

    if (contact.length > 0) {
      const currentChannels = (contact[0].channels as string[] | null) ?? [];
      const filtered = currentChannels.filter((c) => c !== provider);
      const updates: Record<string, unknown> = { channels: filtered, updatedAt: now };
      if (contact[0].preferredChannel === provider) {
        updates.preferredChannel = filtered[0] ?? null;
      }
      await db.update(contacts).set(updates).where(eq(contacts.id, userId));
    }

    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.disconnected",
      targetType: "channel",
      targetId: provider,
    });

    res.json({ data: { disconnected: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Disconnect error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to disconnect" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// USER: PATCH /channels/me/routing — Update routing preferences
// ─────────────────────────────────────────────────────────────────────────────

const RoutingSchema = z.object({
  preferredChannel: z.string().max(50).nullable().optional(),
  channels: z.array(z.string().max(50)).max(10).optional(),
});

channelRoutes.patch("/me/routing", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const body = RoutingSchema.parse(req.body);

    const teamId = await getUserActiveTeamId(userId);
    if (!teamId) {
      res.status(400).json({ error: { code: "NO_TEAM", message: "User has no active team" } });
      return;
    }

    // Validate: only allow channels where user is connected (+ tezit/email always allowed)
    const alwaysAllowed = new Set(["tezit", "email"]);
    const connectedLinks = await db
      .select({ provider: userChannelLink.provider })
      .from(userChannelLink)
      .where(
        and(
          eq(userChannelLink.teamId, teamId),
          eq(userChannelLink.userId, userId),
          eq(userChannelLink.status, "connected")
        )
      );
    const connectedProviders = new Set([
      ...connectedLinks.map((l) => l.provider),
      ...alwaysAllowed,
    ]);

    if (body.preferredChannel && !connectedProviders.has(body.preferredChannel)) {
      res.status(400).json({
        error: { code: "CHANNEL_INVALID_STATE", message: `Cannot set preferred to disconnected provider: ${body.preferredChannel}` },
      });
      return;
    }

    if (body.channels) {
      const invalid = body.channels.filter((c) => !connectedProviders.has(c));
      if (invalid.length > 0) {
        res.status(400).json({
          error: { code: "CHANNEL_INVALID_STATE", message: `Disconnected providers in fallback: ${invalid.join(", ")}` },
        });
        return;
      }
    }

    const now = new Date().toISOString();
    const updates: Record<string, unknown> = { updatedAt: now };
    if (body.preferredChannel !== undefined) updates.preferredChannel = body.preferredChannel;
    if (body.channels !== undefined) updates.channels = body.channels;

    await db.update(contacts).set(updates).where(eq(contacts.id, userId));

    const updated = await db.select().from(contacts).where(eq(contacts.id, userId)).limit(1);

    await recordAudit({
      teamId,
      actorUserId: userId,
      action: "channel.routing.updated",
      targetType: "channel",
      targetId: userId,
      metadata: { preferredChannel: body.preferredChannel, channels: body.channels },
    });

    res.json({
      data: {
        preferredChannel: updated[0]?.preferredChannel ?? null,
        channels: (updated[0]?.channels as string[] | null) ?? [],
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Update routing error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update routing" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// WEBHOOK: POST /channels/webhooks/:provider — Inbound events from providers
// ─────────────────────────────────────────────────────────────────────────────

channelRoutes.post("/webhooks/:provider", async (req, res) => {
  try {
    const provider = req.params.provider;

    if (!isValidProvider(provider)) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: `Unknown provider: ${provider}` } });
      return;
    }

    // Validate webhook signature
    const signature = req.header("x-webhook-signature") || req.header("x-telegram-bot-api-secret-token");
    const state = (req.body?.state as string) || (req.body?.callback_state as string);

    if (!state && !signature) {
      res.status(401).json({ error: { code: "CHANNEL_WEBHOOK_INVALID_SIGNATURE", message: "Missing state or signature" } });
      return;
    }

    // Resolve link by state token (connection callback)
    if (state) {
      const links = await db
        .select()
        .from(userChannelLink)
        .where(and(eq(userChannelLink.provider, provider), eq(userChannelLink.status, "pending")));

      const matchedLink = links.find((l) => {
        const meta = l.metadata as Record<string, unknown> | null;
        return meta?.state === state;
      });

      if (!matchedLink) {
        res.status(404).json({ error: { code: "CHANNEL_LINK_NOT_FOUND", message: "No pending connection for state" } });
        return;
      }

      // Check expiry
      const meta = matchedLink.metadata as Record<string, unknown> | null;
      if (meta?.expiresAt && new Date(meta.expiresAt as string) < new Date()) {
        await db
          .update(userChannelLink)
          .set({ status: "failed", failureReason: "Connection expired", updatedAt: new Date().toISOString() })
          .where(eq(userChannelLink.id, matchedLink.id));

        await recordAudit({
          teamId: matchedLink.teamId,
          actorUserId: "system",
          action: "channel.connect.failed",
          targetType: "channel",
          targetId: provider,
          metadata: { userId: matchedLink.userId, reason: "expired" },
        });

        res.status(400).json({ error: { code: "CHANNEL_CONNECT_EXPIRED", message: "Connection state expired" } });
        return;
      }

      // Mark as connected
      const now = new Date().toISOString();
      const externalUserId = (req.body?.external_user_id as string) ?? null;
      const externalChatId = (req.body?.external_chat_id as string) ?? null;
      const handle = (req.body?.handle as string) ?? matchedLink.handle;

      await db
        .update(userChannelLink)
        .set({
          status: "connected",
          externalUserId,
          externalChatId,
          handle,
          lastVerifiedAt: now,
          failureReason: null,
          metadata: null, // clear state token
          updatedAt: now,
        })
        .where(eq(userChannelLink.id, matchedLink.id));

      // Auto-add to contact routing
      const contact = await db
        .select()
        .from(contacts)
        .where(eq(contacts.id, matchedLink.userId))
        .limit(1);

      if (contact.length > 0) {
        const currentChannels = (contact[0].channels as string[] | null) ?? [];
        if (!currentChannels.includes(provider)) {
          await db
            .update(contacts)
            .set({ channels: [...currentChannels, provider], updatedAt: now })
            .where(eq(contacts.id, matchedLink.userId));
        }
      }

      await recordAudit({
        teamId: matchedLink.teamId,
        actorUserId: "system",
        action: "channel.connect.completed",
        targetType: "channel",
        targetId: provider,
        metadata: { userId: matchedLink.userId, handle },
      });

      res.json({ ok: true });
      return;
    }

    // Inbound message event — resolve by external user ID
    const externalUserId = (req.body?.from?.id as string) ?? (req.body?.external_user_id as string);
    if (!externalUserId) {
      res.status(400).json({ error: { code: "CHANNEL_INVALID_STATE", message: "Cannot resolve sender" } });
      return;
    }

    // Validate signature against team's webhook secret
    const links = await db
      .select()
      .from(userChannelLink)
      .where(
        and(
          eq(userChannelLink.provider, provider),
          eq(userChannelLink.externalUserId, externalUserId),
          eq(userChannelLink.status, "connected")
        )
      );

    if (links.length === 0) {
      res.status(404).json({ error: { code: "CHANNEL_LINK_NOT_FOUND", message: "No connected user for sender" } });
      return;
    }

    const link = links[0];

    // Verify webhook signature if available
    if (signature) {
      const cfg = await db
        .select()
        .from(channelProviderConfig)
        .where(and(eq(channelProviderConfig.teamId, link.teamId), eq(channelProviderConfig.provider, provider)))
        .limit(1);

      if (cfg.length > 0 && cfg[0].webhookSecretRef) {
        const rawBody = JSON.stringify(req.body);
        const expected = createHmac("sha256", cfg[0].webhookSecretRef).update(rawBody).digest("hex");
        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expected, "hex");
        if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) {
          res.status(401).json({ error: { code: "CHANNEL_WEBHOOK_INVALID_SIGNATURE", message: "Signature mismatch" } });
          return;
        }
      }
    }

    await recordAudit({
      teamId: link.teamId,
      actorUserId: "system",
      action: "channel.inbound.received",
      targetType: "channel",
      targetId: provider,
      metadata: {
        userId: link.userId,
        externalUserId,
        hasMessage: !!req.body?.message || !!req.body?.text,
      },
    });

    // TODO: Create Tez from inbound message (bridge to relay/tez/share)
    // For now, acknowledge the webhook
    res.json({ ok: true });
  } catch (err) {
    console.error("Channel webhook error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Webhook processing failed" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /channels/resolve — Resolve best delivery channel for recipients
// Used by skills/agents before outbound delivery.
// ─────────────────────────────────────────────────────────────────────────────

const ResolveSchema = z.object({
  teamId: z.string().uuid(),
  recipientIds: z.array(z.string()).min(1).max(100),
});

channelRoutes.post("/resolve", authenticate, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const body = ResolveSchema.parse(req.body);

    await assertTeamMember(userId, body.teamId);

    const routes = await resolveChannelsForRecipients(body.recipientIds, body.teamId);

    res.json({ data: routes });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    if ((err as NodeJS.ErrnoException).code === "FORBIDDEN") {
      res.status(403).json({ error: { code: "FORBIDDEN", message: (err as Error).message } });
      return;
    }
    console.error("Resolve channels error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to resolve channels" } });
  }
});
