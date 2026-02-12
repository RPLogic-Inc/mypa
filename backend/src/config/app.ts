/**
 * Central app configuration.
 *
 * Set APP_NAME / APP_SLUG in .env to white-label the backend.
 */

/** Display name (used in notification titles, etc.) */
export const APP_NAME: string = process.env.APP_NAME || "MyPA";

/**
 * Short lowercase slug used for JWT issuer, ntfy topic prefix, DB filename, etc.
 * Changing this on an existing deployment will invalidate existing JWT tokens
 * and notification subscriptions.
 */
export const APP_SLUG: string = process.env.APP_SLUG || "mypa";

/**
 * Instance Mode
 *
 * Controls whether this instance runs as a personal hub (spoke) or a team hub:
 * - "team": Multi-user team instance (default, current behavior)
 * - "personal": Single-user personal instance (enables cross-team aggregation, scheduler)
 */
export type InstanceMode = "personal" | "team";
export const INSTANCE_MODE: InstanceMode =
  (process.env.INSTANCE_MODE as InstanceMode) || "team";

export function isPersonalMode(): boolean {
  return INSTANCE_MODE === "personal";
}

export function isTeamMode(): boolean {
  return INSTANCE_MODE === "team";
}

/**
 * OpenClaw Integration Mode
 *
 * Controls how the backend interacts with OpenClaw for agent lifecycle:
 * - "disabled": No OpenClaw calls (pure data mode)
 * - "optional": OpenClaw calls only if explicitly enabled (default, recommended)
 * - "legacy": Old behavior with backend-driven agent provisioning (deprecated, will be removed)
 *
 * In "optional" mode, agent creation is skipped unless OPENCLAW_TOKEN is configured.
 * Users should configure their PA via OpenClaw desktop app instead.
 */
export const OPENCLAW_INTEGRATION_MODE =
  (process.env.OPENCLAW_INTEGRATION_MODE as "disabled" | "optional" | "legacy") || "optional";

function parsePositiveInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export const TEZ_PUBLIC_BASE_URL: string = process.env.TEZ_PUBLIC_BASE_URL || "http://localhost:5174";
export const TEZ_SHARE_PATH_PREFIX: string = process.env.TEZ_SHARE_PATH_PREFIX || "/tez";
export const TEZ_GUEST_DEFAULT_INTERROGATIONS: number = parsePositiveInt("TEZ_GUEST_DEFAULT_INTERROGATIONS", 3);
export const TEZ_GUEST_MAX_INTERROGATIONS: number = parsePositiveInt("TEZ_GUEST_MAX_INTERROGATIONS", 50);
export const TEZ_GUEST_MAX_EXPIRY_HOURS: number = parsePositiveInt("TEZ_GUEST_MAX_EXPIRY_HOURS", 720);
