/**
 * Cross-Team Aggregation Routes
 *
 * Used by personal instances (spoke mode) to aggregate data from all
 * connected team hubs. Only active when INSTANCE_MODE=personal.
 *
 * Endpoints:
 * - GET /briefing — Aggregated briefing from local data + all connected hubs
 * - GET /search   — Federated search across local library + all hub libraries
 */

import { Router, type Request, type Response } from "express";
import { authenticate, standardRateLimit, logger } from "../middleware/index.js";
import { isPersonalMode } from "../config/app.js";
import { searchFTS, countFTSResults } from "../db/fts.js";
import { getClient, db, cards, cardContext, cardRecipients } from "../db/index.js";
import { eq, and, desc, gte, inArray, or } from "drizzle-orm";

// ── Types ──

interface ConnectedHub {
  hubHost: string;
  teamId: string;
  teamName: string | null;
  federationToken: string | null;
  tokenExpiresAt: string | null;
}

interface HubBriefingResult {
  hubHost: string;
  teamId: string;
  teamName: string | null;
  recentTeamTez: unknown[];
  directTez: unknown[];
  error: string | null;
}

interface HubSearchResult {
  hubHost: string;
  teamId: string;
  teamName: string | null;
  results: unknown[];
  count: number;
  error: string | null;
}

// ── Helpers ──

const HUB_REQUEST_TIMEOUT_MS = 10_000;
const RELAY_REQUEST_TIMEOUT_MS = 5_000;

/**
 * Fetch the list of connected hubs from the relay service.
 * Passes the user's auth token through so the relay can identify the caller.
 */
async function getConnectedHubs(authToken: string): Promise<ConnectedHub[]> {
  const relayUrl = process.env.RELAY_URL || "http://localhost:3002";
  try {
    const response = await fetch(`${relayUrl}/federation/my-hubs`, {
      headers: { Authorization: authToken },
      signal: AbortSignal.timeout(RELAY_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) {
      logger.warn("Failed to fetch connected hubs from relay", {
        status: response.status,
      });
      return [];
    }
    const body = (await response.json()) as { data: ConnectedHub[] };
    return body.data ?? [];
  } catch (error) {
    logger.error("Error fetching connected hubs", error as Error);
    return [];
  }
}

/**
 * Fetch a team briefing from a single hub.
 */
async function fetchHubBriefing(hub: ConnectedHub): Promise<HubBriefingResult> {
  if (!hub.federationToken) {
    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      recentTeamTez: [],
      directTez: [],
      error: "No federation token available",
    };
  }

  try {
    const url = `https://${hub.hubHost}/federation/team-briefing`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${hub.federationToken}` },
      signal: AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        hubHost: hub.hubHost,
        teamId: hub.teamId,
        teamName: hub.teamName,
        recentTeamTez: [],
        directTez: [],
        error: `Hub returned ${response.status}`,
      };
    }

    const body = (await response.json()) as {
      data: {
        teamId: string;
        userId: string;
        recentTeamTez: unknown[];
        directTez: unknown[];
        generatedAt: string;
      };
    };

    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      recentTeamTez: body.data?.recentTeamTez ?? [],
      directTez: body.data?.directTez ?? [],
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      recentTeamTez: [],
      directTez: [],
      error: message,
    };
  }
}

/**
 * Search a single hub's library via federation.
 */
async function fetchHubSearch(
  hub: ConnectedHub,
  query: string,
): Promise<HubSearchResult> {
  if (!hub.federationToken) {
    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      results: [],
      count: 0,
      error: "No federation token available",
    };
  }

  try {
    const url = `https://${hub.hubHost}/federation/team-search?q=${encodeURIComponent(query)}`;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${hub.federationToken}` },
      signal: AbortSignal.timeout(HUB_REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      return {
        hubHost: hub.hubHost,
        teamId: hub.teamId,
        teamName: hub.teamName,
        results: [],
        count: 0,
        error: `Hub returned ${response.status}`,
      };
    }

    const body = (await response.json()) as {
      data: {
        teamId: string;
        query: string;
        results: unknown[];
        count: number;
      };
    };

    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      results: body.data?.results ?? [],
      count: body.data?.count ?? 0,
      error: null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown error";
    return {
      hubHost: hub.hubHost,
      teamId: hub.teamId,
      teamName: hub.teamName,
      results: [],
      count: 0,
      error: message,
    };
  }
}

/**
 * Build local briefing data for the personal instance.
 * Lightweight version — recent cards and pending counts scoped to the user.
 */
async function buildLocalBriefing(userId: string) {
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const [pendingCards, activeCards, resolvedToday, staleCards, upcomingDeadlines] =
    await Promise.all([
      db
        .select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "pending")))
        .orderBy(desc(cards.createdAt)),

      db
        .select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "active"))),

      db
        .select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(
          and(
            eq(cardRecipients.userId, userId),
            eq(cards.status, "resolved"),
            gte(cards.updatedAt, todayStart),
          ),
        ),

      db
        .select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(
          and(
            eq(cardRecipients.userId, userId),
            or(eq(cards.status, "pending"), eq(cards.status, "active")),
            // lt imported below but not needed: staleThreshold filter uses gte negation
          ),
        )
        .orderBy(desc(cards.createdAt)),

      db
        .select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(
          and(
            eq(cardRecipients.userId, userId),
            or(eq(cards.status, "pending"), eq(cards.status, "active")),
            gte(cards.dueDate, now),
          ),
        )
        .orderBy(cards.dueDate),
    ]);

  const formatCard = (row: { cards: typeof cards.$inferSelect }) => ({
    id: row.cards.id,
    content: row.cards.content,
    summary: row.cards.summary || row.cards.content.slice(0, 80),
    status: row.cards.status,
    dueDate: row.cards.dueDate?.toISOString() || null,
    createdAt: row.cards.createdAt?.toISOString() || null,
    updatedAt: row.cards.updatedAt?.toISOString() || null,
  });

  // Filter stale cards (pending/active, not updated in 48h)
  const staleFiltered = staleCards.filter(
    (row) => row.cards.updatedAt && row.cards.updatedAt < staleThreshold,
  );

  // Filter upcoming deadlines (next 7 days)
  const upcomingFiltered = upcomingDeadlines.filter(
    (row) => row.cards.dueDate && row.cards.dueDate < weekAhead,
  );

  return {
    pendingCount: pendingCards.length,
    activeCount: activeCards.length,
    resolvedToday: resolvedToday.length,
    topPriorityCards: pendingCards.slice(0, 5).map(formatCard),
    staleCards: staleFiltered.map(formatCard),
    upcomingDeadlines: upcomingFiltered.map(formatCard),
  };
}

/**
 * Run a local FTS search scoped to the authenticated user.
 */
async function searchLocal(userId: string, query: string, limit: number) {
  const client = getClient();

  const ftsResults = await searchFTS(client, {
    query,
    userId,
    limit,
    offset: 0,
  });

  const total = await countFTSResults(client, { query, userId });

  if (ftsResults.length === 0) {
    return { results: [], count: 0 };
  }

  // Fetch card data for the results
  const cardIds = [...new Set(ftsResults.map((r) => r.card_id))];
  const cardEntries = await db
    .select()
    .from(cards)
    .where(inArray(cards.id, cardIds));

  const cardMap = new Map(cardEntries.map((c) => [c.id, c]));

  const results = ftsResults.map((ftsResult) => {
    const card = cardMap.get(ftsResult.card_id);
    return {
      contextId: ftsResult.context_id,
      cardId: ftsResult.card_id,
      snippet: ftsResult.snippet,
      rank: ftsResult.rank,
      type: ftsResult.original_type,
      card: card
        ? {
            id: card.id,
            summary: card.summary,
            content: card.content,
            status: card.status,
            createdAt: card.createdAt?.toISOString(),
          }
        : null,
    };
  });

  return { results, count: total };
}

// ── Middleware: personal mode guard ──

function requirePersonalMode(_req: Request, res: Response, next: () => void) {
  if (!isPersonalMode()) {
    return res.status(400).json({
      error: {
        code: "TEAM_MODE_ONLY",
        message: "Only available on personal instances",
      },
    });
  }
  next();
}

// ── Router ──

export const crossTeamRoutes = Router();

crossTeamRoutes.use(standardRateLimit);
crossTeamRoutes.use(authenticate);
crossTeamRoutes.use(requirePersonalMode);

/**
 * GET /api/cross-team/briefing
 *
 * Aggregated briefing from local data + all connected team hubs.
 * Uses Promise.allSettled so one unreachable hub doesn't fail the whole request.
 */
crossTeamRoutes.get("/briefing", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const authHeader = req.headers.authorization || "";

    // Fetch local briefing and connected hubs in parallel
    const [localBriefing, hubs] = await Promise.all([
      buildLocalBriefing(userId),
      getConnectedHubs(authHeader),
    ]);

    // Fetch briefings from all connected hubs concurrently
    const hubResults = await Promise.allSettled(
      hubs.map((hub) => fetchHubBriefing(hub)),
    );

    const teams: HubBriefingResult[] = hubResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      // Rejected — create error entry
      const hub = hubs[index];
      return {
        hubHost: hub.hubHost,
        teamId: hub.teamId,
        teamName: hub.teamName,
        recentTeamTez: [],
        directTez: [],
        error: result.reason instanceof Error
          ? result.reason.message
          : "Hub request failed",
      };
    });

    res.json({
      data: {
        personal: localBriefing,
        teams,
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    logger.error("Cross-team briefing error", error as Error, {
      requestId: req.requestId,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to generate cross-team briefing",
      },
    });
  }
});

/**
 * GET /api/cross-team/search?q={query}
 *
 * Federated search across local library + all connected hub libraries.
 * Uses Promise.allSettled so one unreachable hub doesn't fail the whole request.
 */
crossTeamRoutes.get("/search", async (req: Request, res: Response) => {
  try {
    const userId = req.user!.id;
    const authHeader = req.headers.authorization || "";
    const query = (req.query.q as string | undefined)?.trim();

    if (!query) {
      return res.status(400).json({
        error: {
          code: "MISSING_QUERY",
          message: "Query parameter 'q' is required",
        },
      });
    }

    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    // Fetch local results and connected hubs in parallel
    const [localResults, hubs] = await Promise.all([
      searchLocal(userId, query, limit),
      getConnectedHubs(authHeader),
    ]);

    // Search all connected hubs concurrently
    const hubResults = await Promise.allSettled(
      hubs.map((hub) => fetchHubSearch(hub, query)),
    );

    const teams: HubSearchResult[] = hubResults.map((result, index) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const hub = hubs[index];
      return {
        hubHost: hub.hubHost,
        teamId: hub.teamId,
        teamName: hub.teamName,
        results: [],
        count: 0,
        error: result.reason instanceof Error
          ? result.reason.message
          : "Hub search request failed",
      };
    });

    const teamTotalCount = teams.reduce((sum, t) => sum + t.count, 0);

    res.json({
      data: {
        query,
        personal: {
          results: localResults.results,
          count: localResults.count,
        },
        teams,
        totalCount: localResults.count + teamTotalCount,
      },
    });
  } catch (error) {
    logger.error("Federated search error", error as Error, {
      requestId: req.requestId,
      userId: req.user?.id,
    });
    res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Failed to perform federated search",
      },
    });
  }
});
