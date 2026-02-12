/**
 * PA Data Routes
 *
 * Pure data endpoints for the PA interface. No AI proxy/chat/streaming.
 * OpenClaw is the AI runtime; MyPA is just a data service.
 */

import { Router } from "express";
import { eq, desc, and, or, lt, gte, like, sql, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { users, cards, cardRecipients, cardContext, responses, reactions, userRoles, teamSettings, teams, userSkills, userTeams } from "../db/schema.js";
import { authenticate } from "../middleware/auth.js";
import { standardRateLimit } from "../middleware/rateLimit.js";
import { logger } from "../middleware/logging.js";

const router = Router();

router.use(standardRateLimit);

// PAContext interface (previously in openclawPA.ts)
export interface PAContext {
  user: { id: string; name: string; email: string; role: string; skills: string[] };
  cards: { pending: any[]; active: any[]; recent: any[]; stale: any[] };
  team: { members: any[]; settings: any };
  preferences: any;
}

/**
 * GET /api/pa/context
 * Returns the full PA context for the authenticated user.
 * Used by OpenClaw agent (via SKILL.md) to get user context before answering questions.
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
router.get("/context", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    const search = typeof req.query.search === "string" ? req.query.search.trim() : undefined;
    const context = await buildPAContext(userId, user, search);
    res.json({ data: context });
  } catch (error) {
    logger.error("Error fetching PA context", error as Error, { userId: req.user?.id });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch PA context" } });
  }
});

/**
 * GET /api/pa/briefing
 * Pure data briefing -- no AI call. Returns structured JSON with card stats.
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to request/response structure are breaking changes.
 * See: backend/src/__tests__/skill-contract.test.ts
 */
router.get("/briefing", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User ID required" } });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user) {
      return res.status(404).json({ error: { code: "USER_NOT_FOUND", message: "User not found" } });
    }

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const staleThreshold = new Date(now.getTime() - 48 * 60 * 60 * 1000);
    const weekAhead = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

    // Batch queries for briefing data
    const [pendingCards, activeCards, resolvedToday, staleCards, upcomingDeadlines] = await Promise.all([
      // Pending cards
      db.select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "pending")))
        .orderBy(desc(cards.createdAt)),

      // Active cards
      db.select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "active"))),

      // Resolved today
      db.select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(
          eq(cardRecipients.userId, userId),
          eq(cards.status, "resolved"),
          gte(cards.updatedAt, todayStart),
        )),

      // Stale cards (pending/active, not updated in 48h)
      db.select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(
          eq(cardRecipients.userId, userId),
          or(eq(cards.status, "pending"), eq(cards.status, "active")),
          lt(cards.updatedAt, staleThreshold),
        ))
        .orderBy(desc(cards.createdAt)),

      // Upcoming deadlines (next 7 days)
      db.select()
        .from(cards)
        .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
        .where(and(
          eq(cardRecipients.userId, userId),
          or(eq(cards.status, "pending"), eq(cards.status, "active")),
          gte(cards.dueDate, now),
          lt(cards.dueDate, weekAhead),
        ))
        .orderBy(cards.dueDate),
    ]);

    const formatCard = (row: any) => ({
      id: row.cards.id,
      content: row.cards.content,
      summary: row.cards.summary || row.cards.content.slice(0, 80),
      status: row.cards.status,
      dueDate: row.cards.dueDate?.toISOString() || null,
      createdAt: row.cards.createdAt?.toISOString() || null,
      updatedAt: row.cards.updatedAt?.toISOString() || null,
    });

    res.json({
      data: {
        pendingCount: pendingCards.length,
        activeCount: activeCards.length,
        resolvedToday: resolvedToday.length,
        topPriorityCards: pendingCards.slice(0, 5).map(formatCard),
        staleCards: staleCards.map(formatCard),
        upcomingDeadlines: upcomingDeadlines.map(formatCard),
      },
    });
  } catch (error) {
    logger.error("PA briefing error", error as Error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to generate briefing" } });
  }
});

// ── Helper functions ──

async function buildPAContext(
  userId: string,
  user: { name: string; teamId: string | null; notificationPrefs?: { urgentPush?: boolean } | null; paPreferences?: Record<string, unknown> | null },
  search?: string,
): Promise<PAContext> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const searchFilter = search
    ? or(like(cards.content, `%${search}%`), like(cards.summary, `%${search}%`))
    : undefined;

  const [roles, teamResult, settingsResult, pendingCards, topPriority, recent, teamMemberRows, teamMemberSkills] = await Promise.all([
    db.select().from(userRoles).where(eq(userRoles.userId, userId)),

    user.teamId
      ? db.query.teams.findFirst({ where: eq(teams.id, user.teamId) })
      : Promise.resolve(null),

    user.teamId
      ? db.query.teamSettings?.findFirst({ where: eq(teamSettings.teamId, user.teamId) })
      : Promise.resolve(null),

    db.select()
      .from(cards)
      .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
      .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "pending"), searchFilter)),

    db.select()
      .from(cards)
      .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
      .where(and(eq(cardRecipients.userId, userId), eq(cards.status, "pending"), searchFilter))
      .orderBy(desc(cards.createdAt))
      .limit(1),

    db.select()
      .from(cards)
      .innerJoin(cardRecipients, eq(cards.id, cardRecipients.cardId))
      .where(and(eq(cardRecipients.userId, userId), gte(cards.createdAt, thirtyDaysAgo), searchFilter))
      .orderBy(desc(cards.createdAt)),

    // Active team members via user_teams junction table
    user.teamId
      ? db.select({ user: users }).from(userTeams).innerJoin(users, eq(userTeams.userId, users.id)).where(eq(userTeams.teamId, user.teamId)).then((rows) => rows.map((r) => r.user))
      : Promise.resolve([]),

    // Active team member skills via user_teams junction table
    user.teamId
      ? db.select().from(userSkills).innerJoin(userTeams, eq(userSkills.userId, userTeams.userId)).where(eq(userTeams.teamId, user.teamId))
      : Promise.resolve([]),
  ]);

  // Fetch response counts for recent cards
  const recentCardIds = recent.map((r) => r.cards.id);
  const recentResponses = recentCardIds.length > 0
    ? await db.select().from(responses).where(or(...recentCardIds.map((id) => eq(responses.cardId, id))))
    : [];

  const responseCountByCard: Record<string, number> = {};
  const responseSummaryByCard: Record<string, string[]> = {};
  for (const resp of recentResponses) {
    responseCountByCard[resp.cardId] = (responseCountByCard[resp.cardId] || 0) + 1;
    if (!responseSummaryByCard[resp.cardId]) {
      responseSummaryByCard[resp.cardId] = [];
    }
    if (responseSummaryByCard[resp.cardId].length < 2) {
      responseSummaryByCard[resp.cardId].push(resp.content.slice(0, 80));
    }
  }

  const roleNames = roles.map((r) => r.role);
  const teamName = teamResult?.name || "Team";

  // Integration status - tokens are env-only now (never from DB)
  const integrations = {
    openclawConfigured: !!process.env.OPENCLAW_TOKEN, // Only env, never DB
    twentyConfigured: !!process.env.TWENTY_API_URL && !!process.env.TWENTY_API_KEY,
    notificationsEnabled: !!user.notificationPrefs?.urgentPush,
  };

  // Build team member directory with roles and skills
  const skillsByUser: Record<string, string[]> = {};
  for (const row of teamMemberSkills as any[]) {
    const uid = row.user_skills?.userId || row.user_teams?.userId;
    const skill = row.user_skills?.skill;
    if (uid && skill) {
      if (!skillsByUser[uid]) skillsByUser[uid] = [];
      skillsByUser[uid].push(skill);
    }
  }

  const teamMemberRoles: Record<string, string[]> = {};
  if (teamMemberRows.length > 0) {
    const memberIds = teamMemberRows.map((m) => m.id);
    const allRoles = await db.select().from(userRoles).where(or(...memberIds.map((id) => eq(userRoles.userId, id))));
    for (const r of allRoles) {
      if (!teamMemberRoles[r.userId]) teamMemberRoles[r.userId] = [];
      teamMemberRoles[r.userId].push(r.role);
    }
  }

  const teamMembers = teamMemberRows.map((m) => ({
    id: m.id,
    name: m.name,
    roles: teamMemberRoles[m.id] || [],
    skills: skillsByUser[m.id] || [],
    department: m.department || undefined,
  }));

  // Fetch all user's teams for multi-team context
  const allUserTeams = await db
    .select({ teamId: userTeams.teamId, role: userTeams.role, teamName: teams.name })
    .from(userTeams)
    .innerJoin(teams, eq(userTeams.teamId, teams.id))
    .where(eq(userTeams.userId, userId));

  // Get member counts for all user's teams
  const allTeamIds = allUserTeams.map((t) => t.teamId);
  const teamMemberCounts: Record<string, number> = {};
  if (allTeamIds.length > 0) {
    const counts = await db
      .select({ teamId: userTeams.teamId, count: sql<number>`count(*)` })
      .from(userTeams)
      .where(inArray(userTeams.teamId, allTeamIds))
      .groupBy(userTeams.teamId);
    for (const row of counts) {
      teamMemberCounts[row.teamId] = row.count;
    }
  }

  return {
    userId,
    userName: user.name,
    teamId: user.teamId || "",
    teamName,
    userRoles: roleNames,
    // Multi-team data
    teams: allUserTeams.map((t) => ({
      id: t.teamId,
      name: t.teamName,
      role: t.role,
      isActive: t.teamId === user.teamId,
      memberCount: teamMemberCounts[t.teamId] || 0,
    })),
    pendingCardCount: pendingCards.length,
    topPriorityCard: topPriority[0]
      ? {
          id: topPriority[0].cards.id,
          summary: topPriority[0].cards.summary || topPriority[0].cards.content.slice(0, 60),
          dueDate: topPriority[0].cards.dueDate?.toISOString(),
          responseCount: responseCountByCard[topPriority[0].cards.id] || 0,
        }
      : undefined,
    recentCards: recent.map((r) => ({
      id: r.cards.id,
      summary: r.cards.summary || r.cards.content.slice(0, 60),
      status: r.cards.status,
      dueDate: r.cards.dueDate?.toISOString(),
      createdAt: r.cards.createdAt?.toISOString(),
      responseCount: responseCountByCard[r.cards.id] || 0,
      responsePreviews: responseSummaryByCard[r.cards.id] || [],
    })),
    teamMembers,
    integrations,
    paPreferences: user.paPreferences || undefined,
  } as any;
}

/**
 * Load full card data including context, responses, and reactions for PA reference.
 */
async function loadFullCardData(cardId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  });

  if (!card) return null;

  const [contextItems, cardResponses, cardReactions, sender] = await Promise.all([
    db.select().from(cardContext).where(eq(cardContext.cardId, cardId)).orderBy(desc(cardContext.capturedAt)).limit(10),
    db.select().from(responses).where(eq(responses.cardId, cardId)).orderBy(desc(responses.createdAt)).limit(20),
    db.select().from(reactions).where(eq(reactions.cardId, cardId)),
    db.query.users.findFirst({ where: eq(users.id, card.fromUserId) }),
  ]);

  return {
    id: card.id,
    content: card.content,
    summary: card.summary,
    status: card.status,
    dueDate: card.dueDate?.toISOString(),
    createdAt: card.createdAt?.toISOString(),
    fromUser: sender ? { id: sender.id, name: sender.name } : null,
    sourceType: card.sourceType,
    contextItems: contextItems.map((ctx) => ({
      type: ctx.originalType,
      text: ctx.originalRawText.slice(0, 500),
      userName: ctx.userName,
      capturedAt: ctx.capturedAt?.toISOString(),
      assistantQuery: ctx.assistantData?.query,
    })),
    responses: cardResponses.map((r) => ({
      userId: r.userId,
      content: r.content.slice(0, 300),
      createdAt: r.createdAt?.toISOString(),
    })),
    reactionSummary: summarizeReactions(cardReactions),
    responseCount: cardResponses.length,
  };
}

function summarizeReactions(reactionList: Array<{ emoji: string; userId: string }>) {
  const counts: Record<string, number> = {};
  for (const r of reactionList) {
    counts[r.emoji] = (counts[r.emoji] || 0) + 1;
  }
  return Object.entries(counts).map(([emoji, count]) => ({ emoji, count }));
}

/**
 * Verify that a user has access to a card (is a recipient or the sender).
 */
async function verifyCardAccess(cardId: string, userId: string) {
  const card = await db.query.cards.findFirst({
    where: eq(cards.id, cardId),
  });
  if (!card) return null;

  if (card.fromUserId === userId) return card;

  const recipient = await db.query.cardRecipients.findFirst({
    where: and(eq(cardRecipients.cardId, cardId), eq(cardRecipients.userId, userId)),
  });
  return recipient ? card : null;
}

// Export helpers for use by other modules (e.g. tez routes)
export { buildPAContext, loadFullCardData, verifyCardAccess, summarizeReactions };

export default router;
