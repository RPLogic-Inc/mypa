/**
 * tezit-relay configuration
 *
 * All settings from environment. No hardcoded product names.
 * dotenv must load here (not in index.ts) because ESM import hoisting
 * evaluates this module before any code in index.ts runs.
 */

import { config as dotenvConfig } from "dotenv";
import { randomBytes } from "node:crypto";
dotenvConfig();

const nodeEnv = process.env.NODE_ENV || "development";
const configuredSecret = process.env.JWT_SECRET?.trim();

function resolveJwtSecret(): string {
  if (configuredSecret) return configuredSecret;
  if (nodeEnv === "production") {
    throw new Error("JWT_SECRET environment variable is required in production");
  }
  const generated = randomBytes(32).toString("hex");
  // eslint-disable-next-line no-console
  console.warn("JWT_SECRET not set for relay; using ephemeral development secret");
  return generated;
}

const jwtIssuer = (process.env.JWT_ISSUER || process.env.APP_SLUG || "mypa").trim();
const jwtAudience = (process.env.JWT_AUDIENCE || `${jwtIssuer}-api`).trim();

export const config = {
  port: parseInt(process.env.PORT || "3002", 10),
  nodeEnv,

  // Auth — pluggable JWT verification
  jwtSecret: resolveJwtSecret(),
  jwtIssuer,
  jwtAudience,
  relaySyncToken: process.env.RELAY_SYNC_TOKEN || process.env.TEZIT_RELAY_SYNC_TOKEN || "",

  // Relay identity
  relayHost: process.env.RELAY_HOST || "localhost",

  // Data directory (keys, local state)
  dataDir: process.env.DATA_DIR || "./data",

  // Federation
  federationEnabled: process.env.FEDERATION_ENABLED === "true",
  federationMode: (process.env.FEDERATION_MODE || "allowlist") as "allowlist" | "open",
  adminUserIds: (process.env.ADMIN_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean),

  // Instance mode (personal spoke vs team hub)
  instanceMode: (process.env.INSTANCE_MODE || "team") as "personal" | "team",

  // Limits
  maxTezSizeBytes: parseInt(process.env.MAX_TEZ_SIZE_BYTES || "1048576", 10),
  maxContextItems: parseInt(process.env.MAX_CONTEXT_ITEMS || "50", 10),
  maxRecipients: parseInt(process.env.MAX_RECIPIENTS || "100", 10),
} as const;
