import { Router } from "express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, productEvents, users } from "../db/index.js";
import { authenticate, requireRole, standardRateLimit, logger } from "../middleware/index.js";

const router = Router();

router.use(authenticate);
router.use(requireRole("admin", "team_lead"));
router.use(standardRateLimit);

/**
 * GET /api/metrics/usage?days=7
 * Metadata-only product usage metrics for team utility validation.
 */
router.get("/usage", async (req: any, res) => {
  try {
    const userId = req.user?.id as string | undefined;
    if (!userId) {
      return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } });
    }

    const daysInput = Number(req.query.days || 7);
    const windowDays = Number.isFinite(daysInput) ? Math.min(Math.max(Math.floor(daysInput), 1), 90) : 7;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
    });

    if (!user?.teamId) {
      return res.status(400).json({ error: { code: "NO_TEAM", message: "User is not assigned to an active team" } });
    }

    const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);

    const rows = await db
      .select({
        eventName: productEvents.eventName,
        count: sql<number>`count(*)`,
      })
      .from(productEvents)
      .where(and(eq(productEvents.teamId, user.teamId), gte(productEvents.createdAt, since)))
      .groupBy(productEvents.eventName);

    const events: Record<string, number> = {};
    for (const row of rows) {
      events[row.eventName] = Number(row.count || 0);
    }

    const shared = events.tez_shared || 0;
    const opened = events.tez_opened || 0;
    const replied = events.tez_replied || 0;
    const interrogated = events.tez_interrogated || 0;
    const hintClicked = events.proactive_hint_clicked || 0;

    const safeRate = (numerator: number, denominator: number) =>
      denominator > 0 ? Number((numerator / denominator).toFixed(3)) : 0;

    res.json({
      data: {
        teamId: user.teamId,
        windowDays,
        since: since.toISOString(),
        events,
        metrics: {
          shareToOpenRate: safeRate(opened, shared),
          shareToReplyRate: safeRate(replied, shared),
          hintClickPerOpen: safeRate(hintClicked, opened),
          interrogationsPerOpen: safeRate(interrogated, opened),
        },
      },
    });
  } catch (error) {
    logger.error("Usage metrics error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch usage metrics" } });
  }
});

export default router;
