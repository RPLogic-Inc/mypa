/**
 * Public Discovery Routes
 *
 * Provides public/semi-public endpoints for the Tez social network:
 * - GET /trending - Highest-engagement tezits from a configurable time window
 * - GET /stats    - Aggregate platform statistics
 * - GET /profile/:userId - Public Tez profile for a user
 *
 * These endpoints do NOT require authentication. They intentionally expose
 * only summaries and engagement metrics — never full content, email addresses,
 * or internal routing data.
 */

import { Router } from "express";
import { db, cards, users, responses, tezInterrogations, tezCitations, reactions, mirrorAuditLog } from "../db/index.js";
import { eq, and, ne, sql, gte, desc, inArray, or } from "drizzle-orm";
import { logger, rateLimit } from "../middleware/index.js";

export const discoverRoutes = Router();

/**
 * IP-based rate limit for public endpoints: 30 requests per minute per IP.
 * Tighter than the authenticated standardRateLimit (100/min per user) because
 * these are unauthenticated and could be abused by bots.
 */
const publicRateLimit = rateLimit({
  windowMs: 60 * 1000,
  maxRequests: 30,
  keyGenerator: (req) => {
    const ip = req.ip || req.socket.remoteAddress || "unknown";
    return `discover:${ip}`;
  },
  message: "Too many discovery requests. Please try again later.",
});

discoverRoutes.use(publicRateLimit);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert a period string ("24h", "7d", "30d") to a millisecond cutoff timestamp.
 */
function periodToMs(period: string): number {
  switch (period) {
    case "24h":
      return 24 * 60 * 60 * 1000;
    case "7d":
      return 7 * 24 * 60 * 60 * 1000;
    case "30d":
      return 30 * 24 * 60 * 60 * 1000;
    default:
      return 7 * 24 * 60 * 60 * 1000; // default 7d
  }
}

/**
 * Compute engagement scores for a set of card IDs.
 * Score = responses * 3 + interrogations * 5 + citations * 4 + reactions * 1 + mirrors * 2
 *
 * Mirrors the function in library.ts but is scoped here to avoid circular imports.
 */
async function computeEngagementScores(
  cardIds: string[]
): Promise<Map<string, {
  responseCount: number;
  interrogationCount: number;
  citationCount: number;
  reactionCount: number;
  mirrorShareCount: number;
  score: number;
}>> {
  if (cardIds.length === 0) {
    return new Map();
  }

  const responseCounts = await db
    .select({
      cardId: responses.cardId,
      count: sql<number>`count(*)`,
    })
    .from(responses)
    .where(inArray(responses.cardId, cardIds))
    .groupBy(responses.cardId);

  const interrogationCounts = await db
    .select({
      cardId: tezInterrogations.cardId,
      count: sql<number>`count(*)`,
    })
    .from(tezInterrogations)
    .where(inArray(tezInterrogations.cardId, cardIds))
    .groupBy(tezInterrogations.cardId);

  const citationCounts = await db
    .select({
      cardId: tezInterrogations.cardId,
      count: sql<number>`count(*)`,
    })
    .from(tezCitations)
    .innerJoin(tezInterrogations, eq(tezCitations.interrogationId, tezInterrogations.id))
    .where(inArray(tezInterrogations.cardId, cardIds))
    .groupBy(tezInterrogations.cardId);

  const reactionCounts = await db
    .select({
      cardId: reactions.cardId,
      count: sql<number>`count(*)`,
    })
    .from(reactions)
    .where(inArray(reactions.cardId, cardIds))
    .groupBy(reactions.cardId);

  const mirrorCounts = await db
    .select({
      cardId: mirrorAuditLog.cardId,
      count: sql<number>`count(*)`,
    })
    .from(mirrorAuditLog)
    .where(inArray(mirrorAuditLog.cardId, cardIds))
    .groupBy(mirrorAuditLog.cardId);

  const engagementMap = new Map<string, {
    responseCount: number;
    interrogationCount: number;
    citationCount: number;
    reactionCount: number;
    mirrorShareCount: number;
    score: number;
  }>();

  for (const cardId of cardIds) {
    const responseCount = responseCounts.find((r) => r.cardId === cardId)?.count || 0;
    const interrogationCount = interrogationCounts.find((r) => r.cardId === cardId)?.count || 0;
    const citationCount = citationCounts.find((r) => r.cardId === cardId)?.count || 0;
    const reactionCount = reactionCounts.find((r) => r.cardId === cardId)?.count || 0;
    const mirrorShareCount = mirrorCounts.find((r) => r.cardId === cardId)?.count || 0;

    const score =
      responseCount * 3 +
      interrogationCount * 5 +
      citationCount * 4 +
      reactionCount * 1 +
      mirrorShareCount * 2;

    engagementMap.set(cardId, {
      responseCount,
      interrogationCount,
      citationCount,
      reactionCount,
      mirrorShareCount,
      score,
    });
  }

  return engagementMap;
}

// ---------------------------------------------------------------------------
// GET /discover/trending
// ---------------------------------------------------------------------------

/**
 * GET /discover/trending
 *
 * Public endpoint. Returns the highest-engagement tezits within the given time
 * window, sorted by engagement score descending.
 *
 * Query params:
 *   limit  — number of results (default 10, max 50)
 *   period — "24h" | "7d" | "30d" (default "7d")
 */
discoverRoutes.get("/trending", async (req, res) => {
  try {
    const limit = Math.min(Math.max(parseInt(req.query.limit as string) || 10, 1), 50);
    const period = (req.query.period as string) || "7d";
    const cutoff = Date.now() - periodToMs(period);

    // Fetch only PUBLIC, non-deleted cards created within the period.
    // Private and team-scoped cards are never exposed via discovery.
    const recentCards = await db
      .select({
        id: cards.id,
        summary: cards.summary,
        fromUserId: cards.fromUserId,
        createdAt: cards.createdAt,
      })
      .from(cards)
      .where(
        and(
          eq(cards.visibility, "public"),
          ne(cards.status, "deleted"),
          gte(cards.createdAt, new Date(cutoff))
        )
      )
      .orderBy(desc(cards.createdAt));

    if (recentCards.length === 0) {
      return res.json({ data: [] });
    }

    const cardIds = recentCards.map((c) => c.id);

    // Compute engagement scores
    const engagementData = await computeEngagementScores(cardIds);

    // Look up sender names (only expose display name, not email)
    const senderIds = [...new Set(recentCards.map((c) => c.fromUserId))];
    const senderRows = await db
      .select({ id: users.id, name: users.name })
      .from(users)
      .where(inArray(users.id, senderIds));
    const senderMap = new Map(senderRows.map((u) => [u.id, u.name]));

    // Sort by engagement score descending, then slice to limit
    const sorted = recentCards
      .map((card) => {
        const engagement = engagementData.get(card.id) || {
          responseCount: 0,
          interrogationCount: 0,
          citationCount: 0,
          reactionCount: 0,
          mirrorShareCount: 0,
          score: 0,
        };
        return {
          cardId: card.id,
          summary: card.summary || null,
          senderName: senderMap.get(card.fromUserId) || "Unknown",
          engagementScore: engagement.score,
          interrogationCount: engagement.interrogationCount,
          citationCount: engagement.citationCount,
          createdAt: card.createdAt?.toISOString() || null,
        };
      })
      .sort((a, b) => b.engagementScore - a.engagementScore)
      .slice(0, limit);

    res.json({ data: sorted });
  } catch (error) {
    logger.error("Discover trending error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch trending tezits" } });
  }
});

// ---------------------------------------------------------------------------
// GET /discover/stats
// ---------------------------------------------------------------------------

/**
 * GET /discover/stats
 *
 * Public endpoint. Returns aggregate platform statistics.
 */
discoverRoutes.get("/stats", async (req, res) => {
  try {
    // Total public, non-deleted tezits (never count private/team cards)
    const totalTezitsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(cards)
      .where(and(eq(cards.visibility, "public"), ne(cards.status, "deleted")));
    const totalTezits = totalTezitsResult[0]?.count || 0;

    // Total interrogations
    const totalInterrogationsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tezInterrogations);
    const totalInterrogations = totalInterrogationsResult[0]?.count || 0;

    // Total citations
    const totalCitationsResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(tezCitations);
    const totalCitations = totalCitationsResult[0]?.count || 0;

    // Active users in last 7 days (only count users with public cards)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const activeUsersResult = await db
      .selectDistinct({ userId: cards.fromUserId })
      .from(cards)
      .where(and(eq(cards.visibility, "public"), gte(cards.createdAt, new Date(sevenDaysAgo))));
    const activeUsers = activeUsersResult.length;

    // Top contributors: users ranked by total engagement on their PUBLIC tezits
    // Never expose private/team card metadata in public rankings
    const cardsByUser = await db
      .select({
        fromUserId: cards.fromUserId,
        cardId: cards.id,
      })
      .from(cards)
      .where(and(eq(cards.visibility, "public"), ne(cards.status, "deleted")));

    // Group card IDs by user
    const userCardMap = new Map<string, string[]>();
    for (const row of cardsByUser) {
      const existing = userCardMap.get(row.fromUserId) || [];
      existing.push(row.cardId);
      userCardMap.set(row.fromUserId, existing);
    }

    // Compute engagement for ALL card IDs at once
    const allCardIds = cardsByUser.map((r) => r.cardId);
    const allEngagement = await computeEngagementScores(allCardIds);

    // Aggregate per user
    const userScores: { userId: string; tezCount: number; engagementScore: number }[] = [];
    for (const [userId, cardIds] of userCardMap.entries()) {
      let totalScore = 0;
      for (const cardId of cardIds) {
        totalScore += allEngagement.get(cardId)?.score || 0;
      }
      userScores.push({ userId, tezCount: cardIds.length, engagementScore: totalScore });
    }

    // Sort by engagement, take top 10
    userScores.sort((a, b) => b.engagementScore - a.engagementScore);
    const topContributorEntries = userScores.slice(0, 10);

    // Look up names
    const contributorIds = topContributorEntries.map((c) => c.userId);
    const contributorRows = contributorIds.length > 0
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, contributorIds))
      : [];
    const nameMap = new Map(contributorRows.map((u) => [u.id, u.name]));

    const topContributors = topContributorEntries.map((c) => ({
      name: nameMap.get(c.userId) || "Unknown",
      tezCount: c.tezCount,
      engagementScore: c.engagementScore,
    }));

    res.json({
      data: {
        totalTezits,
        totalInterrogations,
        totalCitations,
        activeUsers,
        topContributors,
      },
    });
  } catch (error) {
    logger.error("Discover stats error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch platform stats" } });
  }
});

// ---------------------------------------------------------------------------
// GET /discover/profile/:userId
// ---------------------------------------------------------------------------

/**
 * GET /discover/profile/:userId
 *
 * Semi-public endpoint. Returns a user's public Tez profile — display name,
 * membership date, tez count, total engagement, and top tezits by score.
 *
 * Does NOT expose email, internal settings, or full tez content.
 */
discoverRoutes.get("/profile/:userId", async (req, res) => {
  try {
    const { userId } = req.params;

    // Find user (only expose name + createdAt)
    const userRows = await db
      .select({ id: users.id, name: users.name, createdAt: users.createdAt })
      .from(users)
      .where(eq(users.id, userId));

    if (userRows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "User not found" },
      });
    }

    const user = userRows[0];

    // Get only PUBLIC, non-deleted cards by this user — never expose private/team cards
    const userCards = await db
      .select({ id: cards.id, summary: cards.summary, createdAt: cards.createdAt })
      .from(cards)
      .where(
        and(
          eq(cards.fromUserId, userId),
          eq(cards.visibility, "public"),
          ne(cards.status, "deleted")
        )
      );

    const tezCount = userCards.length;
    const cardIds = userCards.map((c) => c.id);

    // Compute engagement
    const engagementData = await computeEngagementScores(cardIds);

    let totalEngagement = 0;
    for (const eng of engagementData.values()) {
      totalEngagement += eng.score;
    }

    // Top tezits by engagement score (top 5)
    const topTezits = userCards
      .map((card) => ({
        cardId: card.id,
        summary: card.summary || null,
        score: engagementData.get(card.id)?.score || 0,
        createdAt: card.createdAt?.toISOString() || null,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    res.json({
      data: {
        displayName: user.name,
        memberSince: user.createdAt?.toISOString() || null,
        tezCount,
        totalEngagement,
        topTezits,
      },
    });
  } catch (error) {
    logger.error("Discover profile error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch user profile" } });
  }
});

export default discoverRoutes;
