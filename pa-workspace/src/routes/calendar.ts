import { Router, Request, Response } from "express";
import { db, paActionLog } from "../db/index.js";
import { eq, and, gte, lte, desc } from "drizzle-orm";
import { authenticate } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { logAction, ACTION_COLORS } from "../services/actionLogger.js";

const router = Router();
router.use(authenticate);

/**
 * POST /api/calendar/log-action
 * Log a PA action (local DB + Google Calendar sync).
 */
router.post("/log-action", async (req: Request, res: Response) => {
  const { paEmail, actionType, summary, durationMs, cardId, emailMessageId, calendarEventId } = req.body;

  if (!paEmail || !actionType || !summary) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail, actionType, and summary are required" },
    });
  }

  // Privacy: verify PA ownership before logging actions
  let serviceAccountJson: string | undefined;
  try {
    const { paIdentities, workspaceConfig } = await import("../db/schema.js");
    const identity = await db.query.paIdentities.findFirst({
      where: eq(paIdentities.paEmail, paEmail),
    });

    if (identity) {
      // Ownership check: only the PA's owner (or service-auth) can log actions
      if (!req.isServiceAuth && req.user && identity.userId !== req.user.id) {
        return res.status(403).json({
          error: { code: "FORBIDDEN", message: "You can only access your own PA" },
        });
      }

      const config = await db.query.workspaceConfig.findFirst({
        where: eq(workspaceConfig.teamId, identity.teamId),
      });
      if (config?.googleServiceAccountJson && config.setupStatus === "ready") {
        serviceAccountJson = config.googleServiceAccountJson;
      }
    }
  } catch (error) {
    logger.warn("Failed to look up workspace config for calendar sync", {
      paEmail,
      error: (error as Error).message,
    });
  }

  const id = await logAction({
    paEmail,
    actionType,
    summary,
    durationMs,
    cardId,
    emailMessageId,
    calendarEventId,
    serviceAccountJson,
  });

  res.status(201).json({
    data: { id, paEmail, actionType, summary, timestamp: new Date().toISOString() },
  });
});

/**
 * GET /api/calendar/timesheet
 * Query PA action log entries.
 */
router.get("/timesheet", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;
  const from = req.query.from as string;
  const to = req.query.to as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  // Privacy: verify PA ownership
  const creds = await getCredentialsForPa(paEmail);
  if (creds) {
    const ownershipError = assertPaOwnership(req, creds);
    if (ownershipError) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
    }
  } else if (!req.isServiceAuth) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "PA not found" } });
  }

  const conditions = [eq(paActionLog.paEmail, paEmail)];

  if (from) {
    conditions.push(gte(paActionLog.timestamp, new Date(from)));
  }
  if (to) {
    conditions.push(lte(paActionLog.timestamp, new Date(to)));
  }

  const entries = await db
    .select()
    .from(paActionLog)
    .where(and(...conditions))
    .orderBy(desc(paActionLog.timestamp));

  res.json({ data: entries, meta: { total: entries.length } });
});

/**
 * GET /api/calendar/timesheet/summary
 * Aggregated stats by action type.
 */
router.get("/timesheet/summary", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  // Privacy: verify PA ownership
  const creds = await getCredentialsForPa(paEmail);
  if (creds) {
    const ownershipError = assertPaOwnership(req, creds);
    if (ownershipError) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
    }
  } else if (!req.isServiceAuth) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "PA not found" } });
  }

  const entries = await db
    .select()
    .from(paActionLog)
    .where(eq(paActionLog.paEmail, paEmail));

  // Group by action type
  const summary: Record<string, { count: number; totalDurationMs: number }> = {};
  for (const entry of entries) {
    if (!summary[entry.actionType]) {
      summary[entry.actionType] = { count: 0, totalDurationMs: 0 };
    }
    summary[entry.actionType].count++;
    if (entry.durationMs) {
      summary[entry.actionType].totalDurationMs += entry.durationMs;
    }
  }

  res.json({ data: summary, meta: { totalActions: entries.length } });
});

/**
 * POST /api/calendar/timesheet/export
 * Export timesheet as CSV.
 */
router.post("/timesheet/export", async (req: Request, res: Response) => {
  const { paEmail, from, to, format } = req.body;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail is required" },
    });
  }

  // Privacy: verify PA ownership
  const paCreds = await getCredentialsForPa(paEmail);
  if (paCreds) {
    const ownershipError = assertPaOwnership(req, paCreds);
    if (ownershipError) {
      return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
    }
  } else if (!req.isServiceAuth) {
    return res.status(404).json({ error: { code: "NOT_FOUND", message: "PA not found" } });
  }

  const conditions = [eq(paActionLog.paEmail, paEmail)];
  if (from) conditions.push(gte(paActionLog.timestamp, new Date(from)));
  if (to) conditions.push(lte(paActionLog.timestamp, new Date(to)));

  const entries = await db
    .select()
    .from(paActionLog)
    .where(and(...conditions))
    .orderBy(desc(paActionLog.timestamp));

  if (entries.length === 0) {
    return res.status(404).json({
      error: { code: "NO_DATA", message: "No timesheet entries found for this PA and date range" },
    });
  }

  if (format === "ics") {
    // ICS (iCalendar) format
    const icsLines = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//PA Workspace//Timesheet//EN",
      "CALSCALE:GREGORIAN",
    ];

    for (const entry of entries) {
      const start = entry.timestamp;
      const durationMs = entry.durationMs || 5 * 60 * 1000;
      const end = new Date(start.getTime() + durationMs);
      const colorId = ACTION_COLORS[entry.actionType] || ACTION_COLORS.general;

      icsLines.push(
        "BEGIN:VEVENT",
        `UID:${entry.id}@pa-workspace`,
        `DTSTART:${toIcsDate(start)}`,
        `DTEND:${toIcsDate(end)}`,
        `SUMMARY:[${entry.actionType}] ${entry.summary}`,
        `DESCRIPTION:Color ID: ${colorId}`,
        `CATEGORIES:${entry.actionType}`,
        "END:VEVENT",
      );
    }

    icsLines.push("END:VCALENDAR");

    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="timesheet-${paEmail}.ics"`);
    return res.send(icsLines.join("\r\n"));
  }

  // Default: CSV format
  const csvLines = ["timestamp,actionType,summary,durationMs,cardId,emailMessageId,calendarSyncStatus"];

  for (const entry of entries) {
    csvLines.push([
      entry.timestamp.toISOString(),
      entry.actionType,
      `"${(entry.summary || "").replace(/"/g, '""')}"`,
      entry.durationMs || "",
      entry.cardId || "",
      entry.emailMessageId || "",
      entry.calendarSyncStatus || "",
    ].join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="timesheet-${paEmail}.csv"`);
  res.send(csvLines.join("\n"));
});

/** Format a Date as ICS timestamp (YYYYMMDDTHHMMSSZ). */
function toIcsDate(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Look up workspace credentials for a PA email.
 */
async function getCredentialsForPa(paEmail: string): Promise<{
  serviceAccountJson: string;
  teamId: string;
  userId: string;
} | null> {
  const { paIdentities, workspaceConfig } = await import("../db/schema.js");

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.paEmail, paEmail),
  });
  if (!identity) return null;

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });
  if (!config?.googleServiceAccountJson || config.setupStatus !== "ready") return null;

  return {
    serviceAccountJson: config.googleServiceAccountJson,
    teamId: identity.teamId,
    userId: identity.userId,
  };
}

/**
 * Privacy: verify the authenticated user owns the PA email being accessed.
 * Service-auth bypasses this check.
 */
function assertPaOwnership(req: Request, creds: { userId: string }): string | null {
  if (req.isServiceAuth) return null;
  if (!req.user) return "Authentication required";
  if (creds.userId !== req.user.id) return "You can only access your own PA";
  return null;
}

/**
 * GET /api/calendar/shared-calendars
 * List calendars shared with the PA.
 */
router.get("/shared-calendars", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  const ownershipErr1 = assertPaOwnership(req, creds);
  if (ownershipErr1) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipErr1 } });
  }

  try {
    const { listSharedCalendars } = await import("../services/googleCalendar.js");
    const calendars = await listSharedCalendars({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
    });
    res.json({ data: calendars, meta: { total: calendars.length } });
  } catch (error) {
    logger.error("Failed to list shared calendars", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "CALENDAR_ERROR", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/calendar/shared-events
 * Read events from calendars shared with the PA.
 */
router.get("/shared-events", async (req: Request, res: Response) => {
  const paEmail = req.query.paEmail as string;
  const from = req.query.from as string;
  const to = req.query.to as string;
  const maxResults = req.query.maxResults ? parseInt(req.query.maxResults as string) : undefined;

  if (!paEmail) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "paEmail query parameter is required" },
    });
  }

  const creds = await getCredentialsForPa(paEmail);
  if (!creds) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "No workspace credentials for this PA" },
    });
  }

  const ownershipErr2 = assertPaOwnership(req, creds);
  if (ownershipErr2) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipErr2 } });
  }

  try {
    const { readSharedCalendarEvents } = await import("../services/googleCalendar.js");
    const events = await readSharedCalendarEvents({
      serviceAccountJson: creds.serviceAccountJson,
      paEmail,
      timeMin: from ? new Date(from) : undefined,
      timeMax: to ? new Date(to) : undefined,
      maxResults,
    });
    res.json({ data: events, meta: { total: events.length } });
  } catch (error) {
    logger.error("Failed to read shared events", error as Error, { paEmail });
    res.status(500).json({
      error: { code: "CALENDAR_ERROR", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/calendar/team-availability
 * Aggregate team availability from shared calendars.
 */
router.get("/team-availability", async (req: Request, res: Response) => {
  const teamId = req.query.teamId as string;
  const from = req.query.from as string;
  const to = req.query.to as string;

  if (!teamId || !from || !to) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId, from, and to query parameters are required" },
    });
  }

  try {
    const { paIdentities, workspaceConfig } = await import("../db/schema.js");
    const config = await db.query.workspaceConfig.findFirst({
      where: eq(workspaceConfig.teamId, teamId),
    });
    if (!config?.googleServiceAccountJson || config.setupStatus !== "ready") {
      return res.status(400).json({
        error: { code: "WORKSPACE_NOT_READY", message: "Workspace not configured for this team" },
      });
    }

    // Get all active PA emails for the team
    const identities = await db
      .select({ paEmail: paIdentities.paEmail })
      .from(paIdentities)
      .where(and(eq(paIdentities.teamId, teamId), eq(paIdentities.provisionStatus, "active")));

    const paEmails = identities.map((i) => i.paEmail);

    const { getTeamAvailability } = await import("../services/googleCalendar.js");
    const availability = await getTeamAvailability({
      serviceAccountJson: config.googleServiceAccountJson,
      paEmails,
      timeMin: new Date(from),
      timeMax: new Date(to),
    });

    res.json({
      data: availability,
      meta: { teamId, paCount: paEmails.length, busyPaCount: Object.keys(availability).length },
    });
  } catch (error) {
    logger.error("Failed to get team availability", error as Error, { teamId });
    res.status(500).json({
      error: { code: "CALENDAR_ERROR", message: (error as Error).message },
    });
  }
});

export const calendarRoutes = router;
