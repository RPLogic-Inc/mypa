/**
 * Federation routes — server-to-server Tez exchange.
 *
 * POST /federation/inbox      — receive a Tez from a remote server (HTTP Signature auth)
 * GET  /federation/server-info — public server identity + capabilities
 * POST /federation/verify      — trust handshake (remote server introduces itself)
 */

import { Router } from "express";
import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  db,
  tez,
  tezContext,
  tezRecipients,
  contacts,
  federatedServers,
  federatedTez,
} from "../db/index.js";
import { config } from "../config.js";
import { loadOrCreateIdentity } from "../services/identity.js";
import { verifyRequest } from "../services/httpSignature.js";
import { validateBundle, type FederationBundle } from "../services/federationBundle.js";
import { discoverServer } from "../services/discovery.js";
import { recordAudit } from "../services/audit.js";
import { sanitizeText, sanitizeContextItem } from "../services/sanitize.js";
import { rateLimit } from "../middleware/rateLimit.js";

export const federationRoutes = Router();

// Stricter rate limits for federation endpoints
const federationRateLimit = rateLimit({ windowMs: 60_000, max: 30 });

// ─────────────────────────────────────────────────────────────────────────────
// GET /federation/server-info — public identity
// ─────────────────────────────────────────────────────────────────────────────

federationRoutes.get("/server-info", (_req, res) => {
  if (!config.federationEnabled) {
    res.status(404).json({ error: { code: "FEDERATION_DISABLED", message: "Federation is not enabled on this server" } });
    return;
  }

  try {
    const identity = loadOrCreateIdentity();
    res.json({
      host: identity.host,
      server_id: identity.serverId,
      public_key: identity.publicKey,
      protocol_version: "1.2.4",
      profiles: ["messaging", "knowledge"],
      federation: {
        enabled: true,
        mode: config.federationMode,
        inbox: "/federation/inbox",
      },
    });
  } catch (error) {
    console.error("Federation server-info error:", error);
    res.status(500).json({
      error: { code: "IDENTITY_INIT_FAILED", message: "Failed to initialize federation identity" },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /federation/verify — trust handshake
// ─────────────────────────────────────────────────────────────────────────────

federationRoutes.post("/verify", federationRateLimit, async (req, res) => {
  if (!config.federationEnabled) {
    res.status(404).json({ error: { code: "FEDERATION_DISABLED", message: "Federation is not enabled on this server" } });
    return;
  }

  const { host, server_id, public_key, display_name } = req.body;

  if (!host || !server_id || !public_key) {
    res.status(400).json({
      error: { code: "INVALID_REQUEST", message: "host, server_id, and public_key are required" },
    });
    return;
  }

  try {
    // Check if we already know this server
    const existing = await db
      .select()
      .from(federatedServers)
      .where(eq(federatedServers.host, host))
      .limit(1);

    const now = new Date().toISOString();

    if (existing.length > 0) {
      // Update existing record
      await db
        .update(federatedServers)
        .set({
          serverId: server_id,
          publicKey: public_key,
          displayName: display_name || existing[0].displayName,
          lastSeenAt: now,
          protocolVersion: "1.2.4",
        })
        .where(eq(federatedServers.host, host));

      res.json({
        data: {
          status: existing[0].trustLevel,
          message: existing[0].trustLevel === "trusted"
            ? "Server is already trusted"
            : `Server verification is ${existing[0].trustLevel}`,
        },
      });
    } else {
      // Insert new server as pending
      const trustLevel = config.federationMode === "open" ? "trusted" : "pending";

      await db.insert(federatedServers).values({
        host,
        serverId: server_id,
        publicKey: public_key,
        displayName: display_name || null,
        trustLevel,
        protocolVersion: "1.2.4",
        lastSeenAt: now,
        firstSeenAt: now,
        metadata: null,
      });

      res.status(201).json({
        data: {
          status: trustLevel,
          message: trustLevel === "trusted"
            ? "Server automatically trusted (open federation mode)"
            : "Server registered. Awaiting admin approval.",
        },
      });
    }
  } catch (error) {
    console.error("Federation verify error:", error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to process verification" },
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /federation/inbox — receive a Tez from a remote server
// ─────────────────────────────────────────────────────────────────────────────

federationRoutes.post("/inbox", federationRateLimit, async (req, res) => {
  if (!config.federationEnabled) {
    res.status(404).json({ error: { code: "FEDERATION_DISABLED", message: "Federation is not enabled" } });
    return;
  }

  const body = JSON.stringify(req.body);

  // Step 1: Extract sender server host from headers
  const senderHost = req.headers["x-tezit-server"] as string | undefined;
  if (!senderHost) {
    res.status(401).json({ error: { code: "MISSING_SIGNATURE", message: "X-Tezit-Server header required" } });
    return;
  }

  // Step 2: Look up sender in trust registry
  const serverRows = await db
    .select()
    .from(federatedServers)
    .where(eq(federatedServers.host, senderHost))
    .limit(1);

  if (serverRows.length === 0) {
    // Try to discover the server if open mode
    if (config.federationMode !== "open") {
      res.status(403).json({ error: { code: "UNKNOWN_SERVER", message: "Server not in trust registry. Use /federation/verify first." } });
      return;
    }

    // In open mode, try to discover and auto-trust
    const discovered = await discoverServer(senderHost);
    if (!discovered) {
      res.status(403).json({ error: { code: "UNDISCOVERABLE_SERVER", message: "Could not discover server at " + senderHost } });
      return;
    }

    // Auto-register
    await db.insert(federatedServers).values({
      host: senderHost,
      serverId: discovered.serverId,
      publicKey: discovered.publicKey,
      trustLevel: "trusted",
      protocolVersion: discovered.protocolVersion,
      lastSeenAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      metadata: { profiles: discovered.profiles, federationInbox: discovered.federationInbox },
    });

    serverRows.push({
      host: senderHost,
      serverId: discovered.serverId,
      publicKey: discovered.publicKey,
      trustLevel: "trusted",
      displayName: null,
      protocolVersion: discovered.protocolVersion,
      lastSeenAt: new Date().toISOString(),
      firstSeenAt: new Date().toISOString(),
      metadata: { profiles: discovered.profiles, federationInbox: discovered.federationInbox },
    });
  }

  const senderServer = serverRows[0];

  if (senderServer.trustLevel === "blocked") {
    res.status(403).json({ error: { code: "SERVER_BLOCKED", message: "This server has been blocked" } });
    return;
  }

  if (senderServer.trustLevel === "pending") {
    res.status(403).json({ error: { code: "SERVER_PENDING", message: "This server is awaiting trust approval" } });
    return;
  }

  // Step 3: Verify HTTP Signature (includes nonce for replay protection)
  const verifyResult = verifyRequest(
    req.method,
    req.path,
    req.hostname,
    {
      "x-tezit-signature": req.headers["x-tezit-signature"] as string,
      "x-tezit-server": senderHost,
      "x-tezit-date": req.headers["x-tezit-date"] as string,
      "x-tezit-digest": req.headers["x-tezit-digest"] as string,
      "x-request-nonce": req.headers["x-request-nonce"] as string,
    },
    body,
    senderServer.publicKey,
  );

  if (!verifyResult.valid) {
    res.status(401).json({
      error: { code: "INVALID_SIGNATURE", message: verifyResult.error || "Signature verification failed" },
    });
    return;
  }

  // Step 4: Enforce bundle size limit
  const contentLength = parseInt(req.headers["content-length"] as string, 10);
  if (contentLength && contentLength > config.maxTezSizeBytes) {
    res.status(413).json({
      error: { code: "BUNDLE_TOO_LARGE", message: `Bundle exceeds maximum size of ${config.maxTezSizeBytes} bytes` },
    });
    return;
  }

  // Step 5: Validate bundle format
  const bundle = req.body as FederationBundle;
  const validationError = validateBundle(bundle);
  if (validationError) {
    res.status(422).json({ error: { code: "INVALID_BUNDLE", message: validationError } });
    return;
  }

  // Step 6: Bundle dedup — reject replayed bundles via bundle_hash
  const existingBundle = await db
    .select({ id: federatedTez.id })
    .from(federatedTez)
    .where(eq(federatedTez.bundleHash, bundle.bundle_hash))
    .limit(1);

  if (existingBundle.length > 0) {
    res.status(409).json({
      error: { code: "DUPLICATE_BUNDLE", message: "This bundle has already been delivered" },
    });
    return;
  }

  // Step 7: Identify and pre-validate local recipients
  const now = new Date().toISOString();
  const localHost = config.relayHost;
  const localRecipients = bundle.to.filter((addr) => {
    const atIndex = addr.lastIndexOf("@");
    return atIndex > 0 && addr.slice(atIndex + 1) === localHost;
  });

  if (localRecipients.length === 0) {
    res.status(422).json({
      error: { code: "NO_LOCAL_RECIPIENTS", message: "None of the recipients are on this server" },
    });
    return;
  }

  // Pre-validate recipients BEFORE creating the tez record (avoid orphaned tez)
  const validRecipients: { userId: string; addr: string }[] = [];
  const failures: string[] = [];

  for (const addr of localRecipients) {
    const userId = addr.slice(0, addr.lastIndexOf("@"));
    const contactRows = await db
      .select()
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);

    if (contactRows.length === 0) {
      failures.push(addr);
    } else {
      validRecipients.push({ userId, addr });
    }
  }

  // If zero valid recipients, reject early — no orphaned tez created
  if (validRecipients.length === 0) {
    res.status(422).json({
      error: { code: "ALL_RECIPIENTS_FAILED", message: "None of the local recipients could be found" },
    });
    return;
  }

  const deliveredTezIds: string[] = [];

  try {
    // Step 8: Create local Tez record (only if we have valid recipients)
    const localTezId = randomUUID();

    // Security: sanitize external content before storage
    const sanitizedSurface = sanitizeText(bundle.tez.surfaceText);

    await db.insert(tez).values({
      id: localTezId,
      teamId: null,
      conversationId: null,
      threadId: localTezId, // new thread on receiving server
      parentTezId: null,
      surfaceText: sanitizedSurface,
      type: bundle.tez.type || "note",
      urgency: bundle.tez.urgency || "normal",
      actionRequested: bundle.tez.actionRequested ? sanitizeText(bundle.tez.actionRequested) : null,
      senderUserId: bundle.from,
      visibility: "dm",
      sourceChannel: "federation",
      sourceAddress: bundle.from,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    // Create context items — sanitized from external source
    for (const ctx of bundle.context) {
      const { content, mimeType } = sanitizeContextItem(ctx);
      await db.insert(tezContext).values({
        id: randomUUID(),
        tezId: localTezId,
        layer: ctx.layer,
        content,
        mimeType,
        confidence: ctx.confidence ?? null,
        source: ctx.source || "stated",
        derivedFrom: null,
        createdAt: ctx.createdAt || now,
        createdBy: bundle.from,
      });
    }

    // Create recipient records (already validated above)
    for (const { userId } of validRecipients) {
      await db.insert(tezRecipients).values({
        tezId: localTezId,
        userId,
        deliveredAt: now,
        readAt: null,
        acknowledgedAt: null,
      });
    }

    // Record in federated_tez (with bundle_hash for dedup)
    await db.insert(federatedTez).values({
      id: randomUUID(),
      localTezId,
      remoteTezId: bundle.tez.id,
      remoteHost: bundle.sender_server,
      direction: "inbound",
      bundleHash: bundle.bundle_hash,
      federatedAt: now,
    });

    // Update server lastSeenAt
    await db
      .update(federatedServers)
      .set({ lastSeenAt: now })
      .where(eq(federatedServers.host, senderHost));

    // Audit
    await recordAudit({
      actorUserId: bundle.from,
      action: "federation.received",
      targetType: "federation",
      targetId: localTezId,
      metadata: {
        remoteHost: bundle.sender_server,
        remoteTezId: bundle.tez.id,
        recipientCount: validRecipients.length,
        failedCount: failures.length,
      },
    });

    deliveredTezIds.push(localTezId);

    // Return appropriate status
    if (failures.length > 0) {
      res.status(207).json({
        data: {
          accepted: true,
          localTezIds: deliveredTezIds,
          partial: true,
          failures: failures.map((addr) => ({ address: addr, reason: "Contact not found" })),
        },
      });
    } else {
      res.json({
        data: { accepted: true, localTezIds: deliveredTezIds },
      });
    }
  } catch (error) {
    console.error("Federation inbox error:", error);

    await recordAudit({
      actorUserId: bundle.from,
      action: "federation.failed",
      targetType: "federation",
      targetId: bundle.tez.id,
      metadata: { remoteHost: bundle.sender_server, error: String(error) },
    });

    res.status(500).json({
      error: { code: "DELIVERY_ERROR", message: "Failed to deliver federated Tez" },
    });
  }
});
