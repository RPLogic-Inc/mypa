/**
 * Library of Context Routes
 *
 * Provides discovery and search endpoints for the Library of Context:
 * - GET /search - FTS5-powered full-text search with facets and pagination
 * - GET /browse - Cold start browsing with engagement-ranked content
 * - GET /facets - Available filter metadata (users, date range, type counts)
 */

import { Router } from "express";
import { db, cards, cardContext, cardRecipients, responses, tezInterrogations, tezCitations, reactions, mirrorAuditLog } from "../db/index.js";
import { eq, and, inArray, or, desc, sql, gte, lte } from "drizzle-orm";
import { logger, validate, schemas, authenticate, standardRateLimit } from "../middleware/index.js";
import { searchFTS, countFTSResults } from "../db/fts.js";
import { getClient } from "../db/index.js";

export const libraryRoutes = Router();

libraryRoutes.use(authenticate);
libraryRoutes.use(standardRateLimit);

/**
 * GET /library/search
 * FTS5-powered full-text search with faceting and pagination
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
libraryRoutes.get("/search", validate({ query: schemas.librarySearchQueryV2 }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const query = req.query.q as string;
    const type = req.query.type as string | undefined;
    // Privacy: always scope FTS to the authenticated user — ignore any `from` param
    const after = req.query.after as string | undefined;
    const before = req.query.before as string | undefined;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = parseInt(req.query.offset as string) || 0;

    // Convert date strings to timestamps
    const afterDate = after ? new Date(after).getTime() : undefined;
    const beforeDate = before ? new Date(before).getTime() : undefined;

    // Perform FTS search — always scoped to authenticated user
    const client = getClient();
    const ftsResults = await searchFTS(client, {
      query,
      type,
      userId,
      afterDate,
      beforeDate,
      limit,
      offset,
    });

    if (ftsResults.length === 0) {
      return res.json({ results: [], total: 0 });
    }

    // Get total count for pagination
    const total = await countFTSResults(client, {
      query,
      type,
      userId,
      afterDate,
      beforeDate,
    });

    // Extract context IDs and card IDs for access check + JOIN
    const contextIds = ftsResults.map((r) => r.context_id);
    const cardIds = [...new Set(ftsResults.map((r) => r.card_id))];

    // Access control: Get cards the user can see
    const accessibleCards = await db
      .selectDistinct({ id: cards.id })
      .from(cards)
      .where(
        and(
          inArray(cards.id, cardIds),
          or(
            eq(cards.fromUserId, userId),
            inArray(
              cards.id,
              db.select({ cardId: cardRecipients.cardId }).from(cardRecipients).where(eq(cardRecipients.userId, userId))
            )
          )
        )
      );

    const accessibleCardIds = new Set(accessibleCards.map((c) => c.id));

    // Filter FTS results to only accessible cards
    const accessibleFTSResults = ftsResults.filter((r) => accessibleCardIds.has(r.card_id));

    if (accessibleFTSResults.length === 0) {
      return res.json({ results: [], total: 0 });
    }

    // Fetch full context and card data
    const accessibleContextIds = accessibleFTSResults.map((r) => r.context_id);
    const contextEntries = await db
      .select()
      .from(cardContext)
      .where(inArray(cardContext.id, accessibleContextIds));

    const contextMap = new Map(contextEntries.map((c) => [c.id, c]));

    const cardEntries = await db
      .select()
      .from(cards)
      .where(inArray(cards.id, [...accessibleCardIds]));

    const cardMap = new Map(cardEntries.map((c) => [c.id, c]));

    // Compute engagement scores for each card
    const engagementData = await computeEngagementScores(cardIds);

    // Build results with FTS snippets
    const results = accessibleFTSResults.map((ftsResult) => {
      const context = contextMap.get(ftsResult.context_id);
      const card = cardMap.get(ftsResult.card_id);

      return {
        context: {
          ...context,
          snippet: ftsResult.snippet, // FTS5-generated snippet with <mark> tags
          rank: ftsResult.rank,
        },
        card: {
          id: card?.id,
          summary: card?.summary,
          content: card?.content,
          status: card?.status,
          createdAt: card?.createdAt?.toISOString(),
        },
        engagement: engagementData.get(ftsResult.card_id) || {
          responseCount: 0,
          interrogationCount: 0,
          citationCount: 0,
          reactionCount: 0,
          mirrorShareCount: 0,
          score: 0,
        },
      };
    });

    res.json({
      results,
      total,
      limit,
      offset,
    });
  } catch (error) {
    logger.error("Library search error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to search library" } });
  }
});

/**
 * GET /library/browse
 * Cold start browsing - recent content with engagement ranking
 */
libraryRoutes.get("/browse", async (req, res) => {
  try {
    const userId = req.user!.id;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Get accessible cards
    const accessibleCardIds = await db
      .selectDistinct({ cardId: cardRecipients.cardId })
      .from(cardRecipients)
      .where(eq(cardRecipients.userId, userId))
      .then((rows) => rows.map((r) => r.cardId));

    const ownCardIds = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.fromUserId, userId))
      .then((rows) => rows.map((r) => r.id));

    const allAccessibleCardIds = [...new Set([...accessibleCardIds, ...ownCardIds])];

    if (allAccessibleCardIds.length === 0) {
      return res.json({ recent: [], trending: [], facets: { typeCount: {}, totalEntries: 0 } });
    }

    // Get recent context entries (last 30 days)
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    const recentContext = await db
      .select()
      .from(cardContext)
      .where(
        and(
          inArray(cardContext.cardId, allAccessibleCardIds),
          gte(cardContext.capturedAt, new Date(thirtyDaysAgo))
        )
      )
      .orderBy(desc(cardContext.capturedAt))
      .limit(limit);

    // Fetch associated cards
    const cardIds = [...new Set(recentContext.map((c) => c.cardId))];
    const cardEntries = await db
      .select()
      .from(cards)
      .where(inArray(cards.id, cardIds));

    const cardMap = new Map(cardEntries.map((c) => [c.id, c]));

    // Compute engagement scores
    const engagementData = await computeEngagementScores(cardIds);

    // Build recent results
    const recent = recentContext.map((context) => {
      const card = cardMap.get(context.cardId);
      return {
        context,
        card: {
          id: card?.id,
          summary: card?.summary,
          content: card?.content,
          status: card?.status,
          createdAt: card?.createdAt?.toISOString(),
        },
        engagement: engagementData.get(context.cardId) || {
          responseCount: 0,
          interrogationCount: 0,
          citationCount: 0,
          reactionCount: 0,
          mirrorShareCount: 0,
          score: 0,
        },
      };
    });

    // Get trending (high-engagement items from last 7 days)
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const recentCardIds = cardEntries
      .filter((c) => c.createdAt && c.createdAt.getTime() >= sevenDaysAgo)
      .map((c) => c.id);

    const trendingWithScores = recentCardIds
      .map((cardId) => ({
        cardId,
        engagement: engagementData.get(cardId) || {
          responseCount: 0,
          interrogationCount: 0,
          citationCount: 0,
          reactionCount: 0,
          mirrorShareCount: 0,
          score: 0,
        },
      }))
      .filter((item) => item.engagement.score > 0)
      .sort((a, b) => b.engagement.score - a.engagement.score)
      .slice(0, 5);

    // Fetch context for trending cards
    const trendingCardIds = trendingWithScores.map((t) => t.cardId);
    const trendingContextEntries = trendingCardIds.length > 0
      ? await db
          .select()
          .from(cardContext)
          .where(inArray(cardContext.cardId, trendingCardIds))
          .orderBy(desc(cardContext.capturedAt))
      : [];

    const trendingContextByCard = new Map<string, typeof cardContext.$inferSelect>();
    for (const ctx of trendingContextEntries) {
      if (!trendingContextByCard.has(ctx.cardId)) {
        trendingContextByCard.set(ctx.cardId, ctx);
      }
    }

    const trending = trendingWithScores
      .map((item) => {
        const context = trendingContextByCard.get(item.cardId);
        const card = cardMap.get(item.cardId);
        if (!context) return null;
        return {
          context,
          card: {
            id: card?.id,
            summary: card?.summary,
            content: card?.content,
            status: card?.status,
            createdAt: card?.createdAt?.toISOString(),
          },
          engagement: item.engagement,
        };
      })
      .filter((item) => item !== null);

    // Compute facets
    const typeCount = await db
      .select({
        type: cardContext.originalType,
        count: sql<number>`count(*)`,
      })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .groupBy(cardContext.originalType);

    const totalEntries = await db
      .select({ count: sql<number>`count(*)` })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .then((rows) => rows[0]?.count || 0);

    res.json({
      recent,
      trending,
      facets: {
        typeCount: Object.fromEntries(typeCount.map((t) => [t.type, t.count])),
        totalEntries,
      },
    });
  } catch (error) {
    logger.error("Library browse error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to browse library" } });
  }
});

/**
 * GET /library/facets
 * Get available filter metadata (contributors, date range, type counts)
 */
libraryRoutes.get("/facets", async (req, res) => {
  try {
    const userId = req.user!.id;

    // Get accessible cards
    const accessibleCardIds = await db
      .selectDistinct({ cardId: cardRecipients.cardId })
      .from(cardRecipients)
      .where(eq(cardRecipients.userId, userId))
      .then((rows) => rows.map((r) => r.cardId));

    const ownCardIds = await db
      .select({ id: cards.id })
      .from(cards)
      .where(eq(cards.fromUserId, userId))
      .then((rows) => rows.map((r) => r.id));

    const allAccessibleCardIds = [...new Set([...accessibleCardIds, ...ownCardIds])];

    if (allAccessibleCardIds.length === 0) {
      return res.json({
        contributors: [],
        typeCount: {},
        dateRange: { earliest: null, latest: null },
        totalEntries: 0,
      });
    }

    // Get contributors (users who have added context)
    const contributors = await db
      .selectDistinct({
        userId: cardContext.userId,
        userName: cardContext.userName,
        count: sql<number>`count(*)`,
      })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .groupBy(cardContext.userId, cardContext.userName)
      .orderBy(desc(sql<number>`count(*)`));

    // Get type counts
    const typeCount = await db
      .select({
        type: cardContext.originalType,
        count: sql<number>`count(*)`,
      })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .groupBy(cardContext.originalType);

    // Get date range
    const dateRange = await db
      .select({
        earliest: sql<number>`MIN(${cardContext.capturedAt})`,
        latest: sql<number>`MAX(${cardContext.capturedAt})`,
      })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .then((rows) => rows[0]);

    const totalEntries = await db
      .select({ count: sql<number>`count(*)` })
      .from(cardContext)
      .where(inArray(cardContext.cardId, allAccessibleCardIds))
      .then((rows) => rows[0]?.count || 0);

    res.json({
      contributors: contributors.map((c) => ({
        userId: c.userId,
        userName: c.userName,
        count: c.count,
      })),
      typeCount: Object.fromEntries(typeCount.map((t) => [t.type, t.count])),
      dateRange: {
        earliest: dateRange?.earliest ? new Date(dateRange.earliest as number).toISOString() : null,
        latest: dateRange?.latest ? new Date(dateRange.latest as number).toISOString() : null,
      },
      totalEntries,
    });
  } catch (error) {
    logger.error("Library facets error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get library facets" } });
  }
});

/**
 * Compute engagement scores for cards
 * Score = responses * 3 + interrogations * 5 + citations * 4 + reactions * 1 + mirrors * 2
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

  // Get response counts
  const responseCounts = await db
    .select({
      cardId: responses.cardId,
      count: sql<number>`count(*)`,
    })
    .from(responses)
    .where(inArray(responses.cardId, cardIds))
    .groupBy(responses.cardId);

  // Get interrogation counts
  const interrogationCounts = await db
    .select({
      cardId: tezInterrogations.cardId,
      count: sql<number>`count(*)`,
    })
    .from(tezInterrogations)
    .where(inArray(tezInterrogations.cardId, cardIds))
    .groupBy(tezInterrogations.cardId);

  // Get citation counts (join through interrogations)
  const citationCounts = await db
    .select({
      cardId: tezInterrogations.cardId,
      count: sql<number>`count(*)`,
    })
    .from(tezCitations)
    .innerJoin(tezInterrogations, eq(tezCitations.interrogationId, tezInterrogations.id))
    .where(inArray(tezInterrogations.cardId, cardIds))
    .groupBy(tezInterrogations.cardId);

  // Get reaction counts
  const reactionCounts = await db
    .select({
      cardId: reactions.cardId,
      count: sql<number>`count(*)`,
    })
    .from(reactions)
    .where(inArray(reactions.cardId, cardIds))
    .groupBy(reactions.cardId);

  // Get mirror share counts
  const mirrorCounts = await db
    .select({
      cardId: mirrorAuditLog.cardId,
      count: sql<number>`count(*)`,
    })
    .from(mirrorAuditLog)
    .where(inArray(mirrorAuditLog.cardId, cardIds))
    .groupBy(mirrorAuditLog.cardId);

  // Build engagement map
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

export default libraryRoutes;
