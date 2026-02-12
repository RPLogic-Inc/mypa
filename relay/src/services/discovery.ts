/**
 * Federation discovery — resolve remote servers via .well-known/tezit.json.
 *
 * Caches results in-memory with a configurable TTL.
 * Falls back to the federated_servers DB table if the network is unreachable.
 */

import { promises as dnsPromises } from "dns";
import { eq } from "drizzle-orm";
import { db, federatedServers } from "../db/index.js";

/**
 * SSRF protection — block discovery requests to private/reserved IPs.
 */
function isPrivateIp(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return false;
  const [a, b] = parts;
  if (a === 10) return true;                          // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true;   // 172.16.0.0/12
  if (a === 192 && b === 168) return true;             // 192.168.0.0/16
  if (a === 127) return true;                          // 127.0.0.0/8
  if (a === 169 && b === 254) return true;             // 169.254.0.0/16
  if (a === 0) return true;                            // 0.0.0.0/8
  return false;
}

function isBlockedHost(host: string): boolean {
  const lower = host.toLowerCase();
  if (lower === "localhost" || lower === "::1") return true;
  if (lower.endsWith(".local") || lower.endsWith(".internal")) return true;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(host)) return isPrivateIp(host);
  return false;
}

async function validateHost(host: string): Promise<void> {
  if (isBlockedHost(host)) {
    throw new Error(`SSRF blocked: ${host} is a private/reserved address`);
  }
  try {
    const addresses = await dnsPromises.resolve4(host);
    for (const addr of addresses) {
      if (isPrivateIp(addr)) {
        throw new Error(`SSRF blocked: ${host} resolves to private IP ${addr}`);
      }
    }
  } catch (err) {
    // SSRF blocks are hard errors — rethrow
    if ((err as Error).message.startsWith("SSRF blocked")) throw err;
    // DNS failures (ENOTFOUND, etc.) are soft — let fetchWellKnown return null
  }
}

export interface RemoteServerInfo {
  host: string;
  serverId: string;
  publicKey: string;
  federationInbox: string;
  protocolVersion: string;
  profiles: string[];
  cachedAt: Date;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const cache = new Map<string, RemoteServerInfo>();

/**
 * Fetch a remote server's .well-known/tezit.json and extract federation info.
 */
async function fetchWellKnown(host: string): Promise<RemoteServerInfo | null> {
  await validateHost(host);
  const url = `https://${host}/.well-known/tezit.json`;

  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const data = await res.json() as Record<string, unknown>;

    const federation = data.federation as Record<string, unknown> | undefined;
    if (!federation?.enabled || !federation?.inbox) return null;

    const publicKey = (data.public_key || federation.public_key) as string | undefined;
    const serverId = (data.server_id || federation.server_id) as string | undefined;

    if (!publicKey || !serverId) return null;

    return {
      host,
      serverId: serverId,
      publicKey: publicKey,
      federationInbox: federation.inbox as string,
      protocolVersion: (data.protocol_version as string) || "1.2.4",
      profiles: (data.profiles as string[]) || [],
      cachedAt: new Date(),
    };
  } catch {
    return null;
  }
}

/**
 * Look up server info from the federated_servers DB table.
 */
async function lookupFromDb(host: string): Promise<RemoteServerInfo | null> {
  const rows = await db
    .select()
    .from(federatedServers)
    .where(eq(federatedServers.host, host))
    .limit(1);

  if (rows.length === 0) return null;

  const row = rows[0];
  const meta = (row.metadata || {}) as Record<string, unknown>;

  return {
    host: row.host,
    serverId: row.serverId,
    publicKey: row.publicKey,
    federationInbox: (meta.federationInbox as string) || "/federation/inbox",
    protocolVersion: row.protocolVersion || "1.2.4",
    profiles: (meta.profiles as string[]) || [],
    cachedAt: new Date(row.lastSeenAt || row.firstSeenAt),
  };
}

/**
 * Discover a remote server's federation capabilities.
 * Checks in-memory cache → network → DB fallback.
 */
export async function discoverServer(host: string): Promise<RemoteServerInfo | null> {
  // Check cache first
  const cached = cache.get(host);
  if (cached && Date.now() - cached.cachedAt.getTime() < CACHE_TTL_MS) {
    return cached;
  }

  // Try network
  const fromNetwork = await fetchWellKnown(host);
  if (fromNetwork) {
    cache.set(host, fromNetwork);
    return fromNetwork;
  }

  // Fall back to DB
  const fromDb = await lookupFromDb(host);
  if (fromDb) {
    cache.set(host, fromDb);
    return fromDb;
  }

  return null;
}

/**
 * Clear the in-memory discovery cache (for testing).
 */
export function clearDiscoveryCache(): void {
  cache.clear();
}
