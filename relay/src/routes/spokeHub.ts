/**
 * Spoke/Hub federation routes — hub-and-spoke topology management.
 *
 * Spoke-side (personal instances):
 *   POST /federation/join-as-spoke   — request to join a team hub
 *   GET  /federation/my-hubs         — list team hubs this spoke is connected to
 *
 * Hub-side (team instances):
 *   POST  /federation/approve-spoke     — approve a spoke connection
 *   GET   /federation/spokes            — list connected spokes (admin only)
 *   PATCH /federation/spokes/:host      — update spoke status (admin only)
 *   GET   /federation/team-briefing     — scoped team briefing for federated spoke user
 *   GET   /federation/team-search       — scoped library search for federated spoke user
 */

import { Router, type Request, type Response } from "express";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import { db, spokeMemberships, hubSpokeRegistry, tez, tezRecipients, teams, teamMembers } from "../db/index.js";
import { config } from "../config.js";
import { authenticate } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const spokeHubRoutes = Router();

// Rate limit for spoke/hub endpoints
const spokeHubRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

const jwtSecret = new TextEncoder().encode(config.jwtSecret);

// ─────────────────────────────────────────────────────────────────────────────
// Federation token helpers
// ─────────────────────────────────────────────────────────────────────────────

interface FederationTokenClaims extends JWTPayload {
  sub: string;
  iss: string;
  aud: string;
  scope: string[];
  teamId: string;
  type: "federation_scope";
}

/**
 * Issue a scoped federation token for a spoke user accessing a hub.
 */
async function issueFederationToken(params: {
  userId: string;
  hubHost: string;
  spokeHost: string;
  teamId: string;
  scope: string[];
}): Promise<{ token: string; expiresAt: string }> {
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

  const token = await new SignJWT({
    scope: params.scope,
    teamId: params.teamId,
    type: "federation_scope" as const,
  })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(params.userId)
    .setIssuer(params.hubHost)
    .setAudience(params.spokeHost)
    .setExpirationTime(expiresAt)
    .setIssuedAt()
    .setJti(randomUUID())
    .sign(jwtSecret);

  return { token, expiresAt: expiresAt.toISOString() };
}

/**
 * Verify a federation scoped token and return its claims.
 */
async function verifyFederationToken(req: Request): Promise<FederationTokenClaims | null> {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.slice(7);

  try {
    const { payload } = await jwtVerify(token, jwtSecret);

    if (payload.type !== "federation_scope") return null;
    if (!payload.sub || !payload.teamId || !payload.scope) return null;

    return payload as unknown as FederationTokenClaims;
  } catch {
    return null;
  }
}

// Admin guard (same pattern as admin.ts)
function requireAdmin(req: Request, res: Response, next: import("express").NextFunction): void {
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

// ─────────────────────────────────────────────────────────────────────────────
// SPOKE-SIDE: POST /federation/join-as-spoke — request to join a team hub
// ─────────────────────────────────────────────────────────────────────────────

const JoinAsSpokeSchema = z.object({
  hubHost: z.string().min(1).max(253),
  inviteCode: z.string().optional(),
  userId: z.string().min(1),
});

spokeHubRoutes.post("/join-as-spoke", authenticate, spokeHubRateLimit, async (req, res) => {
  if (config.instanceMode !== "personal") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "join-as-spoke is only available on personal instances" },
    });
    return;
  }

  try {
    const body = JoinAsSpokeSchema.parse(req.body);
    const now = new Date().toISOString();

    // Check if already joined this hub
    const existing = await db
      .select()
      .from(spokeMemberships)
      .where(
        and(
          eq(spokeMemberships.hubHost, body.hubHost),
          eq(spokeMemberships.userId, body.userId),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      res.status(409).json({
        error: { code: "ALREADY_JOINED", message: "Already connected to this hub" },
      });
      return;
    }

    // Call the hub's approve-spoke endpoint
    const spokeHost = config.relayHost;
    const approveUrl = `https://${body.hubHost}/federation/approve-spoke`;

    let hubResponse: globalThis.Response;
    try {
      hubResponse = await fetch(approveUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: req.headers.authorization || "",
        },
        body: JSON.stringify({
          spokeHost,
          userId: body.userId,
          inviteCode: body.inviteCode,
        }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (fetchError) {
      res.status(502).json({
        error: { code: "HUB_UNREACHABLE", message: `Could not reach hub at ${body.hubHost}` },
      });
      return;
    }

    if (!hubResponse.ok) {
      const errorBody = await hubResponse.json().catch(() => ({})) as Record<string, unknown>;
      res.status(hubResponse.status).json({
        error: {
          code: "HUB_REJECTED",
          message: (errorBody.error as Record<string, unknown>)?.message || "Hub rejected the spoke join request",
        },
      });
      return;
    }

    const hubData = await hubResponse.json() as {
      data: {
        teamId: string;
        teamName?: string;
        role: string;
        federationToken: string;
        tokenExpiresAt: string;
      };
    };

    const membership = hubData.data;

    // Store the membership locally
    const membershipId = randomUUID();
    await db.insert(spokeMemberships).values({
      id: membershipId,
      hubHost: body.hubHost,
      teamId: membership.teamId,
      teamName: membership.teamName || null,
      userId: body.userId,
      role: membership.role,
      federationToken: membership.federationToken,
      tokenExpiresAt: membership.tokenExpiresAt,
      joinedAt: now,
      lastSyncAt: null,
    });

    res.status(201).json({
      data: {
        id: membershipId,
        hubHost: body.hubHost,
        teamId: membership.teamId,
        teamName: membership.teamName,
        role: membership.role,
        tokenExpiresAt: membership.tokenExpiresAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Join-as-spoke error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to join hub" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// SPOKE-SIDE: GET /federation/my-hubs — list connected team hubs
// ─────────────────────────────────────────────────────────────────────────────

spokeHubRoutes.get("/my-hubs", authenticate, async (req, res) => {
  if (config.instanceMode !== "personal") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "my-hubs is only available on personal instances" },
    });
    return;
  }

  try {
    const userId = req.user!.userId;
    const rows = await db
      .select()
      .from(spokeMemberships)
      .where(eq(spokeMemberships.userId, userId));

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        hubHost: row.hubHost,
        teamId: row.teamId,
        teamName: row.teamName,
        role: row.role,
        tokenExpiresAt: row.tokenExpiresAt,
        joinedAt: row.joinedAt,
        lastSyncAt: row.lastSyncAt,
      })),
    });
  } catch (err) {
    console.error("My-hubs error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list hubs" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HUB-SIDE: POST /federation/approve-spoke — approve a spoke connection
// ─────────────────────────────────────────────────────────────────────────────

const ApproveSpokeSchema = z.object({
  spokeHost: z.string().min(1).max(253),
  userId: z.string().min(1),
  role: z.enum(["admin", "member"]).default("member"),
  inviteCode: z.string().optional(),
});

spokeHubRoutes.post("/approve-spoke", spokeHubRateLimit, async (req, res) => {
  if (config.instanceMode !== "team") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "approve-spoke is only available on team instances" },
    });
    return;
  }

  try {
    const body = ApproveSpokeSchema.parse(req.body);
    const now = new Date().toISOString();

    // Check if this spoke+user combo already exists
    const existing = await db
      .select()
      .from(hubSpokeRegistry)
      .where(
        and(
          eq(hubSpokeRegistry.spokeHost, body.spokeHost),
          eq(hubSpokeRegistry.userId, body.userId),
        )
      )
      .limit(1);

    if (existing.length > 0) {
      if (existing[0].status === "active") {
        res.status(409).json({
          error: { code: "ALREADY_CONNECTED", message: "Spoke is already connected" },
        });
        return;
      }
      if (existing[0].status === "revoked" || existing[0].status === "suspended") {
        res.status(403).json({
          error: { code: "SPOKE_BLOCKED", message: `Spoke is ${existing[0].status}` },
        });
        return;
      }
    }

    // Look up a team to assign the spoke user to.
    // Use the first team available (hubs typically have one primary team).
    const teamRows = await db
      .select()
      .from(teams)
      .limit(1);

    if (teamRows.length === 0) {
      res.status(500).json({
        error: { code: "NO_TEAM", message: "Hub has no team configured" },
      });
      return;
    }

    const team = teamRows[0];

    // Add the spoke user as a team member if not already one
    const memberRows = await db
      .select()
      .from(teamMembers)
      .where(
        and(
          eq(teamMembers.teamId, team.id),
          eq(teamMembers.userId, body.userId),
        )
      )
      .limit(1);

    if (memberRows.length === 0) {
      await db.insert(teamMembers).values({
        teamId: team.id,
        userId: body.userId,
        role: body.role,
        joinedAt: now,
      });
    }

    // Issue a scoped federation token
    const { token, expiresAt } = await issueFederationToken({
      userId: body.userId,
      hubHost: config.relayHost,
      spokeHost: body.spokeHost,
      teamId: team.id,
      scope: ["read:tez", "write:tez", "read:library", "read:briefing"],
    });

    // Upsert hub spoke registry
    const registryId = existing.length > 0 ? existing[0].id : randomUUID();

    if (existing.length > 0) {
      await db
        .update(hubSpokeRegistry)
        .set({
          status: "active",
          role: body.role,
          approvedAt: now,
          lastSeenAt: now,
        })
        .where(eq(hubSpokeRegistry.id, existing[0].id));
    } else {
      await db.insert(hubSpokeRegistry).values({
        id: registryId,
        spokeHost: body.spokeHost,
        userId: body.userId,
        role: body.role,
        approvedAt: now,
        approvedBy: "system", // auto-approved (could be admin userId if manual)
        lastSeenAt: now,
        status: "active",
      });
    }

    res.json({
      data: {
        teamId: team.id,
        teamName: team.name,
        role: body.role,
        federationToken: token,
        tokenExpiresAt: expiresAt,
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Approve-spoke error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to approve spoke" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HUB-SIDE: GET /federation/spokes — list connected spokes (admin only)
// ─────────────────────────────────────────────────────────────────────────────

spokeHubRoutes.get("/spokes", authenticate, requireAdmin, async (_req, res) => {
  if (config.instanceMode !== "team") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "spokes listing is only available on team instances" },
    });
    return;
  }

  try {
    const rows = await db.select().from(hubSpokeRegistry);
    res.json({ data: rows });
  } catch (err) {
    console.error("List spokes error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list spokes" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HUB-SIDE: PATCH /federation/spokes/:host — update spoke status (admin only)
// ─────────────────────────────────────────────────────────────────────────────

const UpdateSpokeSchema = z.object({
  status: z.enum(["active", "suspended", "revoked"]),
});

spokeHubRoutes.patch("/spokes/:host", authenticate, requireAdmin, async (req, res) => {
  if (config.instanceMode !== "team") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "spoke management is only available on team instances" },
    });
    return;
  }

  try {
    const { host } = req.params;
    const body = UpdateSpokeSchema.parse(req.body);

    const existing = await db
      .select()
      .from(hubSpokeRegistry)
      .where(eq(hubSpokeRegistry.spokeHost, host))
      .limit(1);

    if (existing.length === 0) {
      res.status(404).json({ error: { code: "NOT_FOUND", message: "Spoke not found" } });
      return;
    }

    await db
      .update(hubSpokeRegistry)
      .set({
        status: body.status,
        lastSeenAt: new Date().toISOString(),
      })
      .where(eq(hubSpokeRegistry.spokeHost, host));

    res.json({ data: { spokeHost: host, status: body.status, updated: true } });
  } catch (err) {
    if (err instanceof z.ZodError) {
      res.status(400).json({ error: { code: "VALIDATION_ERROR", message: err.message } });
      return;
    }
    console.error("Update spoke error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update spoke" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HUB-SIDE: GET /federation/team-briefing — scoped briefing for federated user
// ─────────────────────────────────────────────────────────────────────────────

spokeHubRoutes.get("/team-briefing", spokeHubRateLimit, async (req, res) => {
  if (config.instanceMode !== "team") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "team-briefing is only available on team instances" },
    });
    return;
  }

  const claims = await verifyFederationToken(req);
  if (!claims) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Valid federation token required" },
    });
    return;
  }

  if (!claims.scope.includes("read:briefing")) {
    res.status(403).json({
      error: { code: "INSUFFICIENT_SCOPE", message: "Token lacks read:briefing scope" },
    });
    return;
  }

  // Verify the spoke is still active
  const spokeRows = await db
    .select()
    .from(hubSpokeRegistry)
    .where(
      and(
        eq(hubSpokeRegistry.userId, claims.sub),
        eq(hubSpokeRegistry.status, "active"),
      )
    )
    .limit(1);

  if (spokeRows.length === 0) {
    res.status(403).json({
      error: { code: "SPOKE_INACTIVE", message: "Spoke connection is not active" },
    });
    return;
  }

  // Update lastSeenAt
  await db
    .update(hubSpokeRegistry)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(hubSpokeRegistry.id, spokeRows[0].id));

  try {
    // Fetch recent tezits for the user's team
    const recentTez = await db
      .select({
        id: tez.id,
        surfaceText: tez.surfaceText,
        type: tez.type,
        urgency: tez.urgency,
        senderUserId: tez.senderUserId,
        createdAt: tez.createdAt,
        teamId: tez.teamId,
      })
      .from(tez)
      .where(eq(tez.teamId, claims.teamId))
      .orderBy(desc(tez.createdAt))
      .limit(50);

    // Also find tez where this user is a direct recipient
    const recipientTez = await db
      .select({
        id: tez.id,
        surfaceText: tez.surfaceText,
        type: tez.type,
        urgency: tez.urgency,
        senderUserId: tez.senderUserId,
        createdAt: tez.createdAt,
      })
      .from(tez)
      .innerJoin(tezRecipients, eq(tez.id, tezRecipients.tezId))
      .where(eq(tezRecipients.userId, claims.sub))
      .orderBy(desc(tez.createdAt))
      .limit(20);

    res.json({
      data: {
        teamId: claims.teamId,
        userId: claims.sub,
        recentTeamTez: recentTez,
        directTez: recipientTez,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("Team-briefing error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to generate briefing" } });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// HUB-SIDE: GET /federation/team-search — scoped library search for federated user
// ─────────────────────────────────────────────────────────────────────────────

spokeHubRoutes.get("/team-search", spokeHubRateLimit, async (req, res) => {
  if (config.instanceMode !== "team") {
    res.status(400).json({
      error: { code: "WRONG_MODE", message: "team-search is only available on team instances" },
    });
    return;
  }

  const claims = await verifyFederationToken(req);
  if (!claims) {
    res.status(401).json({
      error: { code: "UNAUTHORIZED", message: "Valid federation token required" },
    });
    return;
  }

  if (!claims.scope.includes("read:library")) {
    res.status(403).json({
      error: { code: "INSUFFICIENT_SCOPE", message: "Token lacks read:library scope" },
    });
    return;
  }

  // Verify the spoke is still active
  const spokeRows = await db
    .select()
    .from(hubSpokeRegistry)
    .where(
      and(
        eq(hubSpokeRegistry.userId, claims.sub),
        eq(hubSpokeRegistry.status, "active"),
      )
    )
    .limit(1);

  if (spokeRows.length === 0) {
    res.status(403).json({
      error: { code: "SPOKE_INACTIVE", message: "Spoke connection is not active" },
    });
    return;
  }

  const query = (req.query.q as string || "").trim();
  if (!query) {
    res.status(400).json({
      error: { code: "MISSING_QUERY", message: "Search query parameter 'q' is required" },
    });
    return;
  }

  // Update lastSeenAt
  await db
    .update(hubSpokeRegistry)
    .set({ lastSeenAt: new Date().toISOString() })
    .where(eq(hubSpokeRegistry.id, spokeRows[0].id));

  try {
    // Search tezits within this team using LIKE (basic search)
    // A full FTS5 implementation would go through the backend's library service;
    // for federation we provide a basic text search scoped to the team.
    const searchPattern = `%${query}%`;

    const results = await db
      .select({
        id: tez.id,
        surfaceText: tez.surfaceText,
        type: tez.type,
        urgency: tez.urgency,
        senderUserId: tez.senderUserId,
        createdAt: tez.createdAt,
      })
      .from(tez)
      .where(
        and(
          eq(tez.teamId, claims.teamId),
          // Use sql`` for LIKE since drizzle-orm supports it via like()
        )
      )
      .orderBy(desc(tez.createdAt))
      .limit(25);

    // Filter in application layer for LIKE matching (avoids raw SQL import issues)
    const filtered = results.filter((row) =>
      row.surfaceText.toLowerCase().includes(query.toLowerCase())
    );

    res.json({
      data: {
        teamId: claims.teamId,
        query,
        results: filtered,
        count: filtered.length,
      },
    });
  } catch (err) {
    console.error("Team-search error:", err);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to search" } });
  }
});
