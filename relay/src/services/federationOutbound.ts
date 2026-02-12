/**
 * Outbound federation — deliver Tez to remote servers.
 *
 * When a local user sends to recipients on other servers,
 * this service creates bundles, signs them, and delivers via the outbox.
 */

import { randomUUID } from "node:crypto";
import { eq, and, lte } from "drizzle-orm";
import {
  db,
  contacts,
  tezContext as tezContextTable,
  federationOutbox,
  federatedTez,
} from "../db/index.js";
import { config } from "../config.js";
import { loadOrCreateIdentity, type ServerIdentity } from "./identity.js";
import { signRequest } from "./httpSignature.js";
import { createBundle, type FederationBundle } from "./federationBundle.js";
import { discoverServer } from "./discovery.js";
import { recordAudit } from "./audit.js";

/** Retry backoff schedule in milliseconds: 1m, 5m, 30m, 2h, 12h */
const RETRY_DELAYS = [60_000, 300_000, 1_800_000, 7_200_000, 43_200_000];
const MAX_ATTEMPTS = RETRY_DELAYS.length;

/**
 * Check if a tezAddress is remote (different host than this server).
 */
export function isRemoteAddress(tezAddress: string): boolean {
  const atIndex = tezAddress.lastIndexOf("@");
  if (atIndex < 0) return false;
  const host = tezAddress.slice(atIndex + 1);
  return host !== config.relayHost;
}

/**
 * Extract host from a tezAddress.
 */
function extractHost(tezAddress: string): string | null {
  const atIndex = tezAddress.lastIndexOf("@");
  if (atIndex < 0) return null;
  return tezAddress.slice(atIndex + 1);
}

/**
 * Resolve tezAddresses for a list of userIds.
 */
async function resolveAddresses(userIds: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  for (const userId of userIds) {
    const rows = await db
      .select({ tezAddress: contacts.tezAddress })
      .from(contacts)
      .where(eq(contacts.id, userId))
      .limit(1);
    if (rows.length > 0) {
      result.set(userId, rows[0].tezAddress);
    }
  }
  return result;
}

/**
 * Route a Tez to remote federation servers.
 *
 * Call this after a Tez is created locally. It checks if any recipients
 * have remote tezAddresses and queues delivery to their servers.
 */
export async function routeToFederation(
  tezData: {
    id: string;
    threadId: string | null;
    parentTezId: string | null;
    surfaceText: string;
    type: string;
    urgency: string;
    actionRequested: string | null;
    visibility: string;
    createdAt: string;
    senderUserId: string;
  },
  recipientUserIds: string[],
): Promise<{ queued: number; remoteHosts: string[] }> {
  if (!config.federationEnabled) {
    return { queued: 0, remoteHosts: [] };
  }

  const identity = loadOrCreateIdentity();

  // Resolve tezAddresses for all recipients
  const addressMap = await resolveAddresses(recipientUserIds);

  // Also resolve sender's tezAddress
  const senderAddrs = await resolveAddresses([tezData.senderUserId]);
  const senderAddress = senderAddrs.get(tezData.senderUserId) || `${tezData.senderUserId}@${config.relayHost}`;

  // Filter remote recipients and group by host
  const remoteByHost = new Map<string, string[]>();
  for (const [, addr] of addressMap) {
    if (isRemoteAddress(addr)) {
      const host = extractHost(addr);
      if (host) {
        const existing = remoteByHost.get(host) || [];
        existing.push(addr);
        remoteByHost.set(host, existing);
      }
    }
  }

  if (remoteByHost.size === 0) {
    return { queued: 0, remoteHosts: [] };
  }

  // Load context for the Tez
  const contextRows = await db
    .select()
    .from(tezContextTable)
    .where(eq(tezContextTable.tezId, tezData.id));

  const now = new Date().toISOString();
  let queued = 0;

  for (const [host, addresses] of remoteByHost) {
    const bundle = createBundle(
      tezData,
      contextRows,
      senderAddress,
      addresses,
      identity,
    );

    // Queue in outbox
    await db.insert(federationOutbox).values({
      id: randomUUID(),
      tezId: tezData.id,
      targetHost: host,
      targetAddresses: addresses,
      bundle: bundle as unknown as Record<string, unknown>,
      status: "pending",
      attempts: 0,
      createdAt: now,
    });

    queued++;
  }

  // Process outbox immediately (sync for v1)
  await processOutbox(identity);

  return { queued, remoteHosts: Array.from(remoteByHost.keys()) };
}

/**
 * Process pending items in the federation outbox.
 * Attempts delivery for all pending/retryable items.
 */
export async function processOutbox(identity?: ServerIdentity): Promise<{ delivered: number; failed: number }> {
  const id = identity || loadOrCreateIdentity();
  const now = new Date().toISOString();

  // Get pending items (status=pending OR status=failed with nextRetryAt <= now)
  const pending = await db
    .select()
    .from(federationOutbox)
    .where(
      eq(federationOutbox.status, "pending"),
    );

  const retryable = await db
    .select()
    .from(federationOutbox)
    .where(
      and(
        eq(federationOutbox.status, "failed"),
        lte(federationOutbox.nextRetryAt, now),
      ),
    );

  const items = [...pending, ...retryable];
  let delivered = 0;
  let failed = 0;

  for (const item of items) {
    const bundle = item.bundle as unknown as FederationBundle;

    try {
      // Discover remote server
      const remoteInfo = await discoverServer(item.targetHost);
      if (!remoteInfo) {
        throw new Error(`Could not discover server ${item.targetHost}`);
      }

      // Build the request
      const protocol = item.targetHost.startsWith("localhost") ? "http" : "https";
      const inboxUrl = `${protocol}://${item.targetHost}${remoteInfo.federationInbox}`;
      const bodyStr = JSON.stringify(bundle);

      // Sign the request
      const signedHeaders = signRequest(
        {
          method: "POST",
          path: remoteInfo.federationInbox,
          host: item.targetHost,
          body: bodyStr,
        },
        id.host,
      );

      // Send
      const response = await fetch(inboxUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...signedHeaders,
        },
        body: bodyStr,
        signal: AbortSignal.timeout(30_000),
      });

      if (response.ok || response.status === 207) {
        // Mark delivered
        await db
          .update(federationOutbox)
          .set({
            status: "delivered",
            deliveredAt: new Date().toISOString(),
            lastAttemptAt: new Date().toISOString(),
            attempts: item.attempts + 1,
          })
          .where(eq(federationOutbox.id, item.id));

        // Record in federated_tez
        await db.insert(federatedTez).values({
          id: randomUUID(),
          localTezId: item.tezId,
          remoteTezId: bundle.tez.id,
          remoteHost: item.targetHost,
          direction: "outbound",
          bundleHash: bundle.bundle_hash,
          federatedAt: new Date().toISOString(),
        });

        await recordAudit({
          actorUserId: bundle.from,
          action: "federation.sent",
          targetType: "federation",
          targetId: item.tezId,
          metadata: {
            remoteHost: item.targetHost,
            recipientCount: (item.targetAddresses as string[]).length,
          },
        });

        delivered++;
      } else {
        const errorText = await response.text().catch(() => "Unknown error");
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }
    } catch (error) {
      const newAttempts = item.attempts + 1;
      const isExpired = newAttempts >= MAX_ATTEMPTS;

      const retryDelay = RETRY_DELAYS[Math.min(newAttempts, RETRY_DELAYS.length - 1)];
      const nextRetry = isExpired ? null : new Date(Date.now() + retryDelay).toISOString();

      await db
        .update(federationOutbox)
        .set({
          status: isExpired ? "expired" : "failed",
          attempts: newAttempts,
          lastAttemptAt: new Date().toISOString(),
          nextRetryAt: nextRetry,
          error: String(error),
        })
        .where(eq(federationOutbox.id, item.id));

      if (isExpired) {
        await recordAudit({
          actorUserId: bundle.from,
          action: "federation.failed",
          targetType: "federation",
          targetId: item.tezId,
          metadata: {
            remoteHost: item.targetHost,
            error: String(error),
            attempts: newAttempts,
          },
        });
      }

      failed++;
    }
  }

  return { delivered, failed };
}
