/**
 * Relay Client — fire-and-forget HTTP calls to the tezit-relay.
 *
 * All methods are non-throwing: they log warnings on failure and return
 * a success/failure result.  Callers should never await-and-block on
 * relay calls in the critical path (registration, login).
 */

import { logger } from "../middleware/index.js";

function getRelayUrl(): string {
  return process.env.RELAY_URL || process.env.TEZIT_RELAY_URL || "http://localhost:3002";
}

function getSyncToken(): string | undefined {
  return process.env.RELAY_SYNC_TOKEN || process.env.TEZIT_RELAY_SYNC_TOKEN || undefined;
}

function isRelayEnabled(): boolean {
  return process.env.RELAY_ENABLED === "true";
}

export interface RelayResult {
  ok: boolean;
  status?: number;
  error?: string;
}

/**
 * Register (or update) a contact on the relay via the admin upsert endpoint.
 * Uses the sync token — no JWT required.
 */
export async function registerRelayContact(opts: {
  userId: string;
  displayName: string;
  email?: string;
}): Promise<RelayResult> {
  if (!isRelayEnabled()) return { ok: true };

  const syncToken = getSyncToken();
  if (!syncToken) {
    logger.warn("Relay contact registration skipped: no sync token configured");
    return { ok: false, error: "No sync token" };
  }

  try {
    const res = await fetch(`${getRelayUrl()}/contacts/admin/upsert`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-relay-sync-token": syncToken,
      },
      body: JSON.stringify({
        id: opts.userId,
        displayName: opts.displayName,
        email: opts.email,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok) {
      logger.info("Relay contact registered", { userId: opts.userId });
      return { ok: true, status: res.status };
    }

    const body = await res.text().catch(() => "");
    logger.warn("Relay contact registration failed", {
      userId: opts.userId,
      status: res.status,
      body: body.slice(0, 200),
    });
    return { ok: false, status: res.status, error: body.slice(0, 200) };
  } catch (error) {
    logger.warn("Relay contact registration error", {
      userId: opts.userId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Create a team on the relay.
 * Requires a valid JWT — we forward the user's access token.
 */
export async function createRelayTeam(opts: {
  teamId: string;
  name: string;
  accessToken: string;
}): Promise<RelayResult> {
  if (!isRelayEnabled()) return { ok: true };

  try {
    const res = await fetch(`${getRelayUrl()}/teams`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${opts.accessToken}`,
      },
      body: JSON.stringify({
        id: opts.teamId,
        name: opts.name,
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (res.ok || res.status === 409) {
      // 409 = team already exists, that's fine
      logger.info("Relay team created/exists", { teamId: opts.teamId });
      return { ok: true, status: res.status };
    }

    const body = await res.text().catch(() => "");
    logger.warn("Relay team creation failed", {
      teamId: opts.teamId,
      status: res.status,
      body: body.slice(0, 200),
    });
    return { ok: false, status: res.status, error: body.slice(0, 200) };
  } catch (error) {
    logger.warn("Relay team creation error", {
      teamId: opts.teamId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
