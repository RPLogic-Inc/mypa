/**
 * Team Provisioning Routes
 *
 * Admin-only endpoints for provisioning new team deployments.
 * Each team gets a dedicated DigitalOcean droplet with the full stack:
 * Backend, Relay, PA Workspace, OpenClaw Gateway, Twenty CRM, Canvas.
 */

import { Router } from "express";
import { z } from "zod";
import { eq, desc, and, or } from "drizzle-orm";
import { spawn } from "child_process";
import { resolve } from "path";
import { db } from "../db/index.js";
import { provisioningJobs, users } from "../db/schema.js";
import { randomUUID } from "crypto";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logger } from "../middleware/logging.js";

const router = Router();

// Reserved subdomains that cannot be used for team deployments
const RESERVED_SUBDOMAINS = new Set([
  "api", "app", "oc", "www", "admin", "relay", "mail", "smtp",
  "imap", "pop", "ftp", "ssh", "ns1", "ns2", "cdn", "static",
  "assets", "dev", "staging", "test", "demo", "docs", "status",
  "blog", "support", "help",
]);

// Validation schemas
const provisionTeamSchema = z.object({
  teamName: z.string().min(2).max(100),
  subdomain: z.string()
    .min(3).max(20)
    .regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, "Subdomain must be lowercase alphanumeric with hyphens, cannot start or end with hyphen")
    .refine(s => !RESERVED_SUBDOMAINS.has(s), "This subdomain is reserved"),
  adminEmail: z.string().email(),
  adminPassword: z.string().min(8).max(128),
  dropletSize: z.enum(["s-1vcpu-2gb", "s-2vcpu-4gb", "s-4vcpu-8gb"]).default("s-2vcpu-4gb"),
  region: z.enum(["nyc3", "sfo3", "lon1", "ams3"]).default("nyc3"),
});

const updateJobSchema = z.object({
  status: z.string().optional(),
  currentStep: z.string().optional(),
  progress: z.number().int().min(0).max(100).optional(),
  dropletId: z.string().optional(),
  dropletIp: z.string().optional(),
  appUrl: z.string().optional(),
  error: z.string().optional(),
  appendLog: z.string().optional(),
});

/**
 * POST /api/admin/provision-team
 * Start provisioning a new team deployment
 */
router.post("/provision-team", authenticate, requireRole("admin"), async (req: any, res) => {
  try {
    const parsed = provisionTeamSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid request", details: parsed.error.issues },
      });
    }

    const { teamName, subdomain, adminEmail, adminPassword, dropletSize, region } = parsed.data;

    // Check for existing job with same subdomain
    const existing = await db.query.provisioningJobs.findFirst({
      where: and(
        eq(provisioningJobs.subdomain, subdomain),
        or(
          eq(provisioningJobs.status, "pending"),
          eq(provisioningJobs.status, "creating_droplet"),
          eq(provisioningJobs.status, "installing_base"),
          eq(provisioningJobs.status, "installing_services"),
          eq(provisioningJobs.status, "deploying_code"),
          eq(provisioningJobs.status, "configuring_dns"),
          eq(provisioningJobs.status, "ready"),
        ),
      ),
    });

    if (existing) {
      return res.status(409).json({
        error: {
          code: "SUBDOMAIN_IN_USE",
          message: `Subdomain "${subdomain}" already has a provisioning job (status: ${existing.status})`,
        },
      });
    }

    // Check for any in-progress provisioning jobs (max 1 concurrent)
    const inProgress = await db.query.provisioningJobs.findFirst({
      where: or(
        eq(provisioningJobs.status, "creating_droplet"),
        eq(provisioningJobs.status, "installing_base"),
        eq(provisioningJobs.status, "installing_services"),
        eq(provisioningJobs.status, "deploying_code"),
        eq(provisioningJobs.status, "configuring_dns"),
      ),
    });

    if (inProgress) {
      return res.status(429).json({
        error: {
          code: "PROVISIONING_IN_PROGRESS",
          message: `Another provisioning job is in progress (${inProgress.teamName}). Wait for it to complete.`,
        },
      });
    }

    // Create provisioning job
    const jobId = randomUUID();
    await db.insert(provisioningJobs).values({
      id: jobId,
      teamName,
      subdomain,
      adminEmail,
      dropletSize,
      region,
      status: "pending",
      currentStep: "Queued",
      progress: 0,
      createdByUserId: req.user!.id,
    });

    // Spawn the provisioning script as a detached background process
    const scriptPath = resolve(process.cwd(), "../deploy/provision-team.sh");
    const callbackUrl = `http://127.0.0.1:${process.env.PORT || 3001}/api/admin/provision-jobs/${jobId}/update`;

    const child = spawn("bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        TEAM_NAME: teamName,
        SUBDOMAIN: subdomain,
        ADMIN_EMAIL: adminEmail,
        ADMIN_PASSWORD: adminPassword,
        DROPLET_SIZE: dropletSize,
        REGION: region,
        JOB_ID: jobId,
        CALLBACK_URL: callbackUrl,
        BASE_DOMAIN: process.env.BASE_DOMAIN || "localhost",
        APP_NAME: process.env.APP_NAME || "MyPA",
        APP_SLUG: process.env.APP_SLUG || "mypa",
      },
    });

    child.unref(); // Allow the parent to exit without waiting

    child.on("error", (err) => {
      logger.error("Provisioning script spawn failed", err, { jobId });
      db.update(provisioningJobs)
        .set({ status: "failed", error: `Script spawn failed: ${err.message}` })
        .where(eq(provisioningJobs.id, jobId))
        .then(() => {})
        .catch(() => {});
    });

    logger.info("Provisioning job started", { jobId, teamName, subdomain, region });

    res.status(201).json({
      data: { jobId, status: "pending" },
    });
  } catch (error) {
    logger.error("Provision team error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to start provisioning" },
    });
  }
});

/**
 * GET /api/admin/provision-jobs
 * List all provisioning jobs
 */
router.get("/provision-jobs", authenticate, requireRole("admin"), async (_req: any, res) => {
  try {
    const jobs = await db.query.provisioningJobs.findMany({
      orderBy: [desc(provisioningJobs.createdAt)],
    });

    // Strip logs from list view for performance
    const summary = jobs.map(({ log, ...rest }) => rest);

    res.json({ data: { jobs: summary } });
  } catch (error) {
    logger.error("List provision jobs error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to list provisioning jobs" },
    });
  }
});

/**
 * GET /api/admin/provision-jobs/:id
 * Get detailed status of a provisioning job
 */
router.get("/provision-jobs/:id", authenticate, requireRole("admin"), async (req: any, res) => {
  try {
    const job = await db.query.provisioningJobs.findFirst({
      where: eq(provisioningJobs.id, req.params.id),
    });

    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Provisioning job not found" },
      });
    }

    res.json({ data: { job } });
  } catch (error) {
    logger.error("Get provision job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get provisioning job" },
    });
  }
});

/**
 * POST /api/admin/provision-jobs/:id/retry
 * Retry a failed provisioning job
 */
router.post("/provision-jobs/:id/retry", authenticate, requireRole("admin"), async (req: any, res) => {
  try {
    const job = await db.query.provisioningJobs.findFirst({
      where: eq(provisioningJobs.id, req.params.id),
    });

    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Provisioning job not found" },
      });
    }

    if (job.status !== "failed") {
      return res.status(400).json({
        error: { code: "INVALID_STATE", message: `Cannot retry a job with status "${job.status}"` },
      });
    }

    // Reset status and re-spawn
    await db.update(provisioningJobs)
      .set({
        status: "pending",
        currentStep: "Retrying...",
        progress: 0,
        error: null,
        completedAt: null,
      })
      .where(eq(provisioningJobs.id, job.id));

    const scriptPath = resolve(process.cwd(), "../deploy/provision-team.sh");
    const callbackUrl = `http://127.0.0.1:${process.env.PORT || 3001}/api/admin/provision-jobs/${job.id}/update`;

    const child = spawn("bash", [scriptPath], {
      detached: true,
      stdio: "ignore",
      env: {
        ...process.env,
        TEAM_NAME: job.teamName,
        SUBDOMAIN: job.subdomain,
        ADMIN_EMAIL: job.adminEmail,
        ADMIN_PASSWORD: "", // Won't be available on retry — script should handle
        DROPLET_SIZE: job.dropletSize,
        REGION: job.region,
        JOB_ID: job.id,
        CALLBACK_URL: callbackUrl,
        RETRY: "true",
        EXISTING_DROPLET_ID: job.dropletId || "",
        EXISTING_DROPLET_IP: job.dropletIp || "",
        BASE_DOMAIN: process.env.BASE_DOMAIN || "localhost",
        APP_NAME: process.env.APP_NAME || "MyPA",
        APP_SLUG: process.env.APP_SLUG || "mypa",
      },
    });

    child.unref();

    logger.info("Provisioning job retried", { jobId: job.id, teamName: job.teamName });

    res.json({ data: { jobId: job.id, status: "pending" } });
  } catch (error) {
    logger.error("Retry provision job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to retry provisioning job" },
    });
  }
});

/**
 * POST /api/admin/provision-jobs/:id/update
 * Internal callback from the provisioning script (localhost only)
 */
router.post("/provision-jobs/:id/update", async (req: any, res) => {
  try {
    // Restrict to localhost only
    const ip = req.ip || req.connection?.remoteAddress;
    if (ip !== "127.0.0.1" && ip !== "::1" && ip !== "::ffff:127.0.0.1") {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "Internal endpoint — localhost only" },
      });
    }

    const parsed = updateJobSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid update", details: parsed.error.issues },
      });
    }

    const job = await db.query.provisioningJobs.findFirst({
      where: eq(provisioningJobs.id, req.params.id),
    });

    if (!job) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Job not found" },
      });
    }

    const updates: Record<string, unknown> = {};
    const data = parsed.data;

    if (data.status !== undefined) updates.status = data.status;
    if (data.currentStep !== undefined) updates.currentStep = data.currentStep;
    if (data.progress !== undefined) updates.progress = data.progress;
    if (data.dropletId !== undefined) updates.dropletId = data.dropletId;
    if (data.dropletIp !== undefined) updates.dropletIp = data.dropletIp;
    if (data.appUrl !== undefined) updates.appUrl = data.appUrl;
    if (data.error !== undefined) updates.error = data.error;

    // Append to log if provided
    if (data.appendLog) {
      const currentLog = job.log || "";
      updates.log = currentLog ? `${currentLog}\n${data.appendLog}` : data.appendLog;
    }

    // Set completedAt if status is ready or failed
    if (data.status === "ready" || data.status === "failed") {
      updates.completedAt = new Date();
    }

    // Set appUrl automatically if status is ready
    if (data.status === "ready" && !data.appUrl) {
      updates.appUrl = `https://${job.subdomain}.${process.env.BASE_DOMAIN || "mypa.chat"}`;
    }

    await db.update(provisioningJobs)
      .set(updates)
      .where(eq(provisioningJobs.id, job.id));

    res.json({ data: { updated: true } });
  } catch (error) {
    logger.error("Update provision job error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to update job" },
    });
  }
});

export { router as provisioningRoutes };
