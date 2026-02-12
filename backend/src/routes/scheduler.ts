/**
 * Scheduler Routes — personal instance cron job management
 *
 * CRUD endpoints for user-owned scheduled jobs (reminders, weekly summaries,
 * periodic team queries). Only available when INSTANCE_MODE=personal.
 */

import { Router } from "express";
import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { scheduledJobs } from "../db/schema.js";
import { isPersonalMode } from "../config/app.js";
import { authenticate, standardRateLimit, logger } from "../middleware/index.js";
import { computeNextRun } from "../services/schedulerEngine.js";

const router = Router();

// Apply rate limiting and auth to all scheduler routes
router.use(standardRateLimit);
router.use(authenticate);

// Guard: all scheduler endpoints require personal mode
router.use((_req, res, next) => {
  if (!isPersonalMode()) {
    return res.status(400).json({
      error: {
        code: "PERSONAL_MODE_ONLY",
        message: "Only available on personal instances",
      },
    });
  }
  next();
});

// --- Validation schemas ---

const VALID_ACTIONS = ["reminder", "cross-team-summary", "check-inbox", "custom"] as const;

// Basic cron expression validation: 5 or 6 space-separated fields
const cronRegex = /^(\S+\s+){4,5}\S+$/;

const CreateJobSchema = z.object({
  name: z.string().min(1).max(200),
  schedule: z.string().regex(cronRegex, "Invalid cron expression (expected 5 or 6 fields)"),
  action: z.enum(VALID_ACTIONS),
  scope: z.string().min(1).max(200).optional(),
  payload: z.record(z.unknown()).optional(),
});

const UpdateJobSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  schedule: z.string().regex(cronRegex, "Invalid cron expression (expected 5 or 6 fields)").optional(),
  action: z.enum(VALID_ACTIONS).optional(),
  scope: z.string().min(1).max(200).optional(),
  payload: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
});

// --- Helpers ---

/** Verify the job belongs to the authenticated user, return it or null. */
async function getOwnedJob(jobId: string, userId: string) {
  const job = await db.query.scheduledJobs.findFirst({
    where: and(eq(scheduledJobs.id, jobId), eq(scheduledJobs.userId, userId)),
  });
  return job ?? null;
}

// --- Routes ---

/**
 * GET /api/scheduler/jobs
 * List all scheduled jobs for the authenticated user.
 */
router.get("/jobs", async (req: any, res) => {
  try {
    const userId: string = req.user!.id;

    const jobs = await db
      .select()
      .from(scheduledJobs)
      .where(eq(scheduledJobs.userId, userId));

    res.json({ data: jobs });
  } catch (error) {
    logger.error("List scheduler jobs error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to list scheduled jobs" },
    });
  }
});

/**
 * POST /api/scheduler/jobs
 * Create a new scheduled job.
 */
router.post("/jobs", async (req: any, res) => {
  try {
    const parsed = CreateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid job definition",
          details: parsed.error.issues,
        },
      });
    }

    const body = parsed.data;
    const id = randomUUID();
    const now = new Date();
    const nextRun = computeNextRun(body.schedule);

    await db.insert(scheduledJobs).values({
      id,
      userId: req.user!.id,
      name: body.name,
      schedule: body.schedule,
      action: body.action,
      scope: body.scope || "personal",
      payload: body.payload || {},
      enabled: true,
      nextRunAt: nextRun,
      createdAt: now,
      updatedAt: now,
    });

    const created = await db.query.scheduledJobs.findFirst({
      where: eq(scheduledJobs.id, id),
    });

    logger.info("Scheduler job created", { jobId: id, action: body.action, schedule: body.schedule });

    res.status(201).json({ data: created });
  } catch (error) {
    logger.error("Create scheduler job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create scheduled job" },
    });
  }
});

/**
 * PATCH /api/scheduler/jobs/:id
 * Update an existing scheduled job (enable/disable, change schedule, etc.).
 */
router.patch("/jobs/:id", async (req: any, res) => {
  try {
    const job = await getOwnedJob(req.params.id, req.user!.id);
    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Scheduled job not found" },
      });
    }

    const parsed = UpdateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid update data",
          details: parsed.error.issues,
        },
      });
    }

    const data = parsed.data;
    const now = new Date();

    const updates: Record<string, unknown> = { updatedAt: now };

    if (data.name !== undefined) updates.name = data.name;
    if (data.action !== undefined) updates.action = data.action;
    if (data.scope !== undefined) updates.scope = data.scope;
    if (data.payload !== undefined) updates.payload = data.payload;
    if (data.enabled !== undefined) updates.enabled = data.enabled;

    // If schedule changed, recompute nextRunAt
    if (data.schedule !== undefined) {
      updates.schedule = data.schedule;
      updates.nextRunAt = computeNextRun(data.schedule);
    }

    await db
      .update(scheduledJobs)
      .set(updates)
      .where(eq(scheduledJobs.id, job.id));

    const updated = await db.query.scheduledJobs.findFirst({
      where: eq(scheduledJobs.id, job.id),
    });

    logger.info("Scheduler job updated", { jobId: job.id });

    res.json({ data: updated });
  } catch (error) {
    logger.error("Update scheduler job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to update scheduled job" },
    });
  }
});

/**
 * DELETE /api/scheduler/jobs/:id
 * Delete a scheduled job.
 */
router.delete("/jobs/:id", async (req: any, res) => {
  try {
    const job = await getOwnedJob(req.params.id, req.user!.id);
    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Scheduled job not found" },
      });
    }

    await db.delete(scheduledJobs).where(eq(scheduledJobs.id, job.id));

    logger.info("Scheduler job deleted", { jobId: job.id });

    res.json({ data: { deleted: true } });
  } catch (error) {
    logger.error("Delete scheduler job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to delete scheduled job" },
    });
  }
});

/**
 * POST /api/scheduler/jobs/:id/run
 * Manually trigger a scheduled job (runs it immediately).
 */
router.post("/jobs/:id/run", async (req: any, res) => {
  try {
    const job = await getOwnedJob(req.params.id, req.user!.id);
    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Scheduled job not found" },
      });
    }

    // Import executeJob dynamically to avoid circular dependency at module level
    const { executeJob } = await import("../services/schedulerEngine.js");

    const now = new Date();

    try {
      await executeJob(job);

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

      logger.info("Scheduler job manually triggered", { jobId: job.id, action: job.action });

      const updated = await db.query.scheduledJobs.findFirst({
        where: eq(scheduledJobs.id, job.id),
      });

      res.json({ data: { triggered: true, result: "success", job: updated } });
    } catch (execErr) {
      const errorMessage = execErr instanceof Error ? execErr.message : String(execErr);
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

      logger.error("Scheduler manual run failed", new Error(errorMessage), { jobId: job.id });

      const updated = await db.query.scheduledJobs.findFirst({
        where: eq(scheduledJobs.id, job.id),
      });

      res.json({ data: { triggered: true, result: "error", error: errorMessage, job: updated } });
    }
  } catch (error) {
    logger.error("Manual trigger scheduler job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to trigger scheduled job" },
    });
  }
});

export { router as schedulerRoutes };
