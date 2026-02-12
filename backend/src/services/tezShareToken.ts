/**
 * Tez Share Token Service
 *
 * Manages scoped guest access tokens for TIP interrogation.
 * When a user shares a Tez externally, they create a share token that grants
 * read-only, rate-limited guest access to interrogate that specific Tez's context.
 *
 * The sender controls:
 * - What context is exposed (surface, full, or selected items)
 * - How many interrogations are allowed
 * - When the token expires
 * - Revocation at any time (the "pull back" mechanism)
 */

import { randomBytes, createHash } from "crypto";
import { randomUUID } from "crypto";
import { eq, and, isNull, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { tezShareTokens, cards } from "../db/schema.js";
import { logger } from "../middleware/logging.js";
import {
  TEZ_GUEST_DEFAULT_INTERROGATIONS,
  TEZ_GUEST_MAX_EXPIRY_HOURS,
  TEZ_GUEST_MAX_INTERROGATIONS,
} from "../config/app.js";

/**
 * Hash a raw token for storage (never store raw tokens).
 */
function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

/**
 * Generate a cryptographically random share token.
 * Returns a 64-character hex string.
 */
function generateRawToken(): string {
  return randomBytes(32).toString("hex");
}

function isLikelyRawToken(rawToken: string): boolean {
  return /^[A-Za-z0-9_-]{40,160}$/.test(rawToken);
}

function clampMaxInterrogations(value: number | null | undefined): number | null {
  if (value === undefined) return TEZ_GUEST_DEFAULT_INTERROGATIONS;
  if (value === null) return null;
  return Math.min(Math.max(1, value), TEZ_GUEST_MAX_INTERROGATIONS);
}

function clampExpiryHours(value: number | null | undefined): number | null {
  if (value === null) return null;
  if (value === undefined) return TEZ_GUEST_MAX_EXPIRY_HOURS;
  return Math.min(Math.max(1, value), TEZ_GUEST_MAX_EXPIRY_HOURS);
}

function getRowsAffected(result: unknown): number {
  if (
    typeof result === "object" &&
    result !== null &&
    "rowsAffected" in result &&
    typeof (result as { rowsAffected?: unknown }).rowsAffected === "number"
  ) {
    return (result as { rowsAffected: number }).rowsAffected;
  }
  return 0;
}

export interface CreateShareTokenOptions {
  label?: string;
  contextScope?: "surface" | "full" | "selected";
  contextItemIds?: string[];
  maxInterrogations?: number | null;
  expiresInHours?: number | null;
}

export interface ShareTokenRecord {
  id: string;
  cardId: string;
  createdByUserId: string;
  label: string | null;
  contextScope: string;
  contextItemIds: string[];
  maxInterrogations: number | null;
  interrogationCount: number;
  expiresAt: Date | null;
  revokedAt: Date | null;
  lastUsedAt: Date | null;
  createdAt: Date | null;
}

export interface ValidatedShareToken {
  token: ShareTokenRecord;
  card: { id: string; fromUserId: string; content: string; summary: string | null };
}

/**
 * Create a share token for a specific card.
 * Returns the raw token (shown once to the user) and the token record.
 */
export async function createShareToken(
  cardId: string,
  userId: string,
  options: CreateShareTokenOptions = {},
): Promise<{ rawToken: string; tokenRecord: ShareTokenRecord }> {
  const rawToken = generateRawToken();
  const tokenId = randomUUID();

  const expiresInHours = clampExpiryHours(options.expiresInHours);
  const expiresAt = expiresInHours
    ? new Date(Date.now() + expiresInHours * 60 * 60 * 1000)
    : null;

  const record = {
    id: tokenId,
    cardId,
    createdByUserId: userId,
    tokenHash: hashToken(rawToken),
    label: options.label || null,
    contextScope: options.contextScope || "surface",
    contextItemIds: (options.contextItemIds || []) as string[],
    maxInterrogations: clampMaxInterrogations(options.maxInterrogations),
    interrogationCount: 0,
    expiresAt,
    revokedAt: null,
    lastUsedAt: null,
  };

  await db.insert(tezShareTokens).values(record);

  return {
    rawToken,
    tokenRecord: { ...record, createdAt: new Date() } as ShareTokenRecord,
  };
}

/**
 * Validate a raw share token.
 * Returns token + card metadata if valid, null otherwise.
 * Checks: format, hash lookup, revocation, expiry, card existence.
 */
export async function validateShareToken(rawToken: string): Promise<ValidatedShareToken | null> {
  if (!isLikelyRawToken(rawToken)) {
    return null;
  }

  const tokenHash = hashToken(rawToken);

  const results = await db
    .select()
    .from(tezShareTokens)
    .where(eq(tezShareTokens.tokenHash, tokenHash))
    .limit(1);

  if (results.length === 0) {
    return null;
  }

  const token = results[0];

  // Check revocation
  if (token.revokedAt) {
    logger.warn("Share token used after revocation", { tokenId: token.id });
    return null;
  }

  // Check expiry
  if (token.expiresAt && new Date() > token.expiresAt) {
    logger.warn("Share token used after expiry", { tokenId: token.id });
    return null;
  }

  // Load the associated card
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, token.cardId),
  });

  if (!card) {
    logger.warn("Share token references missing card", { tokenId: token.id, cardId: token.cardId });
    return null;
  }

  // Update lastUsedAt
  await db
    .update(tezShareTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(tezShareTokens.id, token.id));

  return {
    token: token as ShareTokenRecord,
    card: {
      id: card.id,
      fromUserId: card.fromUserId,
      content: card.content,
      summary: card.summary,
    },
  };
}

/**
 * Increment the interrogation count for a share token.
 * Called after a successful guest interrogation.
 */
export async function incrementInterrogationCount(tokenId: string): Promise<void> {
  const token = await db.query.tezShareTokens.findFirst({
    where: eq(tezShareTokens.id, tokenId),
  });

  if (token) {
    await db
      .update(tezShareTokens)
      .set({ interrogationCount: token.interrogationCount + 1 })
      .where(eq(tezShareTokens.id, tokenId));
  }
}

/**
 * Atomically reserve one interrogation slot (prevents race conditions).
 */
export async function reserveInterrogationSlot(tokenId: string): Promise<{
  allowed: boolean;
  remainingInterrogations: number | null;
}> {
  const nowDate = new Date();
  const nowEpochSeconds = Math.floor(nowDate.getTime() / 1000);

  const result = await db
    .update(tezShareTokens)
    .set({
      interrogationCount: sql`${tezShareTokens.interrogationCount} + 1`,
      lastUsedAt: nowDate,
    })
    .where(and(
      eq(tezShareTokens.id, tokenId),
      isNull(tezShareTokens.revokedAt),
      sql`(${tezShareTokens.expiresAt} IS NULL OR ${tezShareTokens.expiresAt} > ${nowEpochSeconds})`,
      sql`(${tezShareTokens.maxInterrogations} IS NULL OR ${tezShareTokens.interrogationCount} < ${tezShareTokens.maxInterrogations})`,
    ));

  if (getRowsAffected(result) === 0) {
    return { allowed: false, remainingInterrogations: 0 };
  }

  const token = await db.query.tezShareTokens.findFirst({
    where: eq(tezShareTokens.id, tokenId),
  });
  if (!token) {
    return { allowed: false, remainingInterrogations: 0 };
  }

  const remainingInterrogations = token.maxInterrogations === null
    ? null
    : Math.max(token.maxInterrogations - token.interrogationCount, 0);

  return { allowed: true, remainingInterrogations };
}

/**
 * Release a previously reserved slot if interrogation fails.
 */
export async function releaseInterrogationSlot(tokenId: string): Promise<void> {
  await db
    .update(tezShareTokens)
    .set({
      interrogationCount: sql`CASE
        WHEN ${tezShareTokens.interrogationCount} > 0 THEN ${tezShareTokens.interrogationCount} - 1
        ELSE 0
      END`,
    })
    .where(eq(tezShareTokens.id, tokenId));
}

/**
 * Revoke a share token (the "pull back" mechanism).
 */
export async function revokeShareToken(tokenId: string, userId: string): Promise<boolean> {
  const token = await db.query.tezShareTokens.findFirst({
    where: eq(tezShareTokens.id, tokenId),
  });

  if (!token || token.createdByUserId !== userId) {
    return false;
  }

  await db
    .update(tezShareTokens)
    .set({ revokedAt: new Date() })
    .where(eq(tezShareTokens.id, tokenId));

  return true;
}

/**
 * Update the context scope of a share token (share more / pull back).
 */
export async function updateTokenScope(
  tokenId: string,
  userId: string,
  updates: {
    contextScope?: "surface" | "full" | "selected";
    contextItemIds?: string[];
    maxInterrogations?: number | null;
  },
): Promise<ShareTokenRecord | null> {
  const token = await db.query.tezShareTokens.findFirst({
    where: eq(tezShareTokens.id, tokenId),
  });

  if (!token || token.createdByUserId !== userId) {
    return null;
  }

  if (token.revokedAt) {
    return null;
  }

  const updateData: Record<string, unknown> = {};
  if (updates.contextScope !== undefined) {
    updateData.contextScope = updates.contextScope;
  }
  if (updates.contextItemIds !== undefined) {
    updateData.contextItemIds = updates.contextItemIds;
  }
  if (updates.maxInterrogations !== undefined) {
    updateData.maxInterrogations = updates.maxInterrogations;
  }

  if (Object.keys(updateData).length === 0) {
    return token as ShareTokenRecord;
  }

  await db
    .update(tezShareTokens)
    .set(updateData)
    .where(eq(tezShareTokens.id, tokenId));

  // Return updated record
  const updated = await db.query.tezShareTokens.findFirst({
    where: eq(tezShareTokens.id, tokenId),
  });

  return updated as ShareTokenRecord | null;
}

/**
 * List all share tokens for a card (for the owner to manage).
 * Never returns raw token values.
 */
export async function listShareTokens(
  cardId: string,
  userId: string,
): Promise<ShareTokenRecord[]> {
  const tokens = await db
    .select()
    .from(tezShareTokens)
    .where(
      and(
        eq(tezShareTokens.cardId, cardId),
        eq(tezShareTokens.createdByUserId, userId),
      ),
    );

  return tokens as ShareTokenRecord[];
}
