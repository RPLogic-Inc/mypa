/**
 * Scheduler Engine — personal instance job execution
 *
 * Polls the scheduled_jobs table every 60 seconds and executes due jobs.
 * Only active when INSTANCE_MODE=personal. No external cron library needed;
 * the engine uses setInterval + a pure-TypeScript cron matcher.
 */

import { db } from "../db/index.js";
import { scheduledJobs } from "../db/schema.js";
import type { ScheduledJob } from "../db/schema.js";
import { eq, and, lte } from "drizzle-orm";
import { isPersonalMode } from "../config/app.js";
import { logger } from "../middleware/logging.js";

let tickInterval: NodeJS.Timeout | null = null;

/**
 * Start the scheduler engine. Checks for due jobs every 60 seconds.
 * Only runs on personal instances.
 */
export function startScheduler(): void {
  if (!isPersonalMode()) {
    logger.info("Scheduler not started (team mode)");
    return;
  }

  logger.info("Starting personal scheduler engine");

  // Check for due jobs every 60 seconds
  tickInterval = setInterval(async () => {
    try {
      await processDueJobs();
    } catch (err) {
      logger.error("Scheduler tick error", err as Error);
    }
  }, 60_000);

  // Also run immediately on startup
  processDueJobs().catch((err) => {
    logger.error("Scheduler initial tick error", err as Error);
  });
}

/**
 * Stop the scheduler engine.
 */
export function stopScheduler(): void {
  if (tickInterval) {
    clearInterval(tickInterval);
    tickInterval = null;
    logger.info("Scheduler engine stopped");
  }
}

/**
 * Process all due jobs (nextRunAt <= now, enabled = true).
 */
async function processDueJobs(): Promise<void> {
  const now = new Date();

  const dueJobs = await db
    .select()
    .from(scheduledJobs)
    .where(
      and(
        eq(scheduledJobs.enabled, true),
        lte(scheduledJobs.nextRunAt, now),
      )
    );

  for (const job of dueJobs) {
    try {
      await executeJob(job);

      // Compute next run time
      const nextRun = computeNextRun(job.schedule);

      await db
        .update(scheduledJobs)
        .set({
          lastRunAt: now,
          lastRunResult: "success",
          lastRunError: null,
          nextRunAt: nextRun,
          runCount: job.runCount + 1,
          updatedAt: now,
        })
        .where(eq(scheduledJobs.id, job.id));

      logger.info("Scheduler job completed", { jobId: job.id, action: job.action });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);

      // Compute next run even on failure
      const nextRun = computeNextRun(job.schedule);

      await db
        .update(scheduledJobs)
        .set({
          lastRunAt: now,
          lastRunResult: "error",
          lastRunError: errorMessage,
          nextRunAt: nextRun,
          runCount: job.runCount + 1,
          updatedAt: now,
        })
        .where(eq(scheduledJobs.id, job.id));

      logger.error("Scheduler job failed", new Error(errorMessage), { jobId: job.id, action: job.action });
    }
  }
}

/**
 * Execute a single scheduled job based on its action type.
 * Exported so the manual-trigger route can call it directly.
 */
export async function executeJob(job: ScheduledJob): Promise<void> {
  switch (job.action) {
    case "reminder": {
      // Create a personal card/tez with the reminder content
      const payload = job.payload as Record<string, unknown> | null;
      const reminderMessage = typeof payload?.message === "string" ? payload.message : job.name;
      logger.info("Reminder triggered", { jobId: job.id, reminderMessage });
      // Future: create a personal Tez via the cards API
      break;
    }

    case "cross-team-summary": {
      // Call the cross-team briefing endpoint internally
      logger.info("Cross-team summary triggered", { jobId: job.id });
      // Future: call /api/cross-team/briefing and create a summary Tez
      break;
    }

    case "check-inbox": {
      // Check all team hubs for new messages
      logger.info("Inbox check triggered", { jobId: job.id });
      // Future: poll each hub for new tezits
      break;
    }

    case "custom": {
      logger.info("Custom job triggered", { jobId: job.id, payload: job.payload });
      // Future: extensible action system
      break;
    }

    default:
      logger.warn("Unknown scheduler action", { jobId: job.id, action: job.action });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure-TypeScript cron matcher
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Compute the next run time from a cron expression.
 * Uses a brute-force minute walk for correctness across all standard cron patterns.
 * Exported for use by the scheduler routes when creating/updating jobs.
 */
export function computeNextRun(cronExpression: string): Date {
  // Parse cron: minute hour dayOfMonth month dayOfWeek
  const parts = cronExpression.trim().split(/\s+/);
  if (parts.length < 5) {
    // Invalid cron, default to 1 hour from now
    return new Date(Date.now() + 3600_000);
  }

  const now = new Date();

  // Simple approach: try each minute for the next 7 days
  // This handles most common cron patterns correctly
  const maxIterations = 7 * 24 * 60; // 7 days of minutes
  const candidate = new Date(now.getTime() + 60_000); // Start from next minute
  candidate.setSeconds(0, 0);

  for (let i = 0; i < maxIterations; i++) {
    if (cronMatches(parts, candidate)) {
      return candidate;
    }
    candidate.setTime(candidate.getTime() + 60_000);
  }

  // Fallback: 24 hours from now
  return new Date(now.getTime() + 86400_000);
}

/**
 * Check if a date matches a cron expression (minute hour dom month dow).
 */
function cronMatches(parts: string[], date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dom = date.getDate();
  const month = date.getMonth() + 1;
  const dow = date.getDay(); // 0=Sun

  return (
    fieldMatches(parts[0], minute) &&
    fieldMatches(parts[1], hour) &&
    fieldMatches(parts[2], dom) &&
    fieldMatches(parts[3], month) &&
    fieldMatches(parts[4], dow)
  );
}

/**
 * Check if a cron field matches a value.
 * Supports: *, N, N-M, *\/N, N/M, comma-separated values.
 */
function fieldMatches(field: string, value: number): boolean {
  if (field === "*") return true;

  // Handle comma-separated values
  const alternatives = field.split(",");

  for (const alt of alternatives) {
    // Handle step: */N or N/M or N-M/S
    if (alt.includes("/")) {
      const [range, stepStr] = alt.split("/");
      const step = parseInt(stepStr, 10);
      if (isNaN(step) || step <= 0) continue;

      if (range === "*") {
        if (value % step === 0) return true;
      } else if (range.includes("-")) {
        const [startStr, endStr] = range.split("-");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        if (!isNaN(start) && !isNaN(end) && value >= start && value <= end && (value - start) % step === 0) return true;
      } else {
        const start = parseInt(range, 10);
        if (!isNaN(start) && value >= start && (value - start) % step === 0) return true;
      }
      continue;
    }

    // Handle range: N-M
    if (alt.includes("-")) {
      const [startStr, endStr] = alt.split("-");
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (!isNaN(start) && !isNaN(end) && value >= start && value <= end) return true;
      continue;
    }

    // Handle single value
    const num = parseInt(alt, 10);
    if (!isNaN(num) && num === value) return true;
  }

  return false;
}
