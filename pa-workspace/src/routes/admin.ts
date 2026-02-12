import { Router, Request, Response } from "express";
import { db, workspaceConfig } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { testWorkspaceConnectivity, listDomainUsers } from "../services/googleAdmin.js";
import { provisionPaAccount } from "../services/googleAdmin.js";
import { getTeamMembers } from "../services/appClient.js";

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate, requireRole("admin"));

/**
 * POST /api/admin/setup
 * Initialize workspace config for a team.
 */
router.post("/setup", async (req: Request, res: Response) => {
  const { teamId, appApiUrl, serviceToken } = req.body;

  if (!teamId || !appApiUrl) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId and appApiUrl are required" },
    });
  }

  // Check if config already exists for this team
  const existing = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (existing) {
    return res.status(409).json({
      error: { code: "ALREADY_EXISTS", message: "Workspace config already exists for this team" },
    });
  }

  const now = new Date();
  await db.insert(workspaceConfig).values({
    teamId,
    appApiUrl,
    serviceToken: serviceToken || null,
    setupStatus: "pending",
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Workspace config created", { teamId });

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  res.status(201).json({ data: maskSensitiveFields(config!) });
});

/**
 * GET /api/admin/config
 * Get workspace config for the authenticated user's team.
 */
router.get("/config", async (req: Request, res: Response) => {
  const teamId = req.query.teamId as string;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId query parameter is required" },
    });
  }

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!config) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No workspace config for this team" },
    });
  }

  res.json({ data: maskSensitiveFields(config) });
});

/**
 * PATCH /api/admin/config
 * Update workspace config (service account key, domain, admin email).
 */
router.patch("/config", async (req: Request, res: Response) => {
  const { teamId, googleDomain, googleServiceAccountJson, googleAdminEmail, serviceToken } = req.body;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId is required" },
    });
  }

  const existing = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!existing) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No workspace config for this team" },
    });
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() };

  if (googleDomain !== undefined) updates.googleDomain = googleDomain;
  if (googleServiceAccountJson !== undefined) updates.googleServiceAccountJson = googleServiceAccountJson;
  if (googleAdminEmail !== undefined) updates.googleAdminEmail = googleAdminEmail;
  if (serviceToken !== undefined) updates.serviceToken = serviceToken;

  // Update setup status based on what's configured
  const domain = googleDomain ?? existing.googleDomain;
  const saJson = googleServiceAccountJson ?? existing.googleServiceAccountJson;
  const adminEmail = googleAdminEmail ?? existing.googleAdminEmail;

  if (domain && saJson && adminEmail) {
    updates.setupStatus = "workspace_configured";
  }

  await db
    .update(workspaceConfig)
    .set(updates)
    .where(eq(workspaceConfig.teamId, teamId));

  const updated = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  logger.info("Workspace config updated", { teamId });

  res.json({ data: maskSensitiveFields(updated!) });
});

/**
 * POST /api/admin/config/test-workspace
 * Test Google Workspace connectivity via Admin SDK.
 */
router.post("/config/test-workspace", async (req: Request, res: Response) => {
  const { teamId } = req.body;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId is required" },
    });
  }

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!config) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No workspace config for this team" },
    });
  }

  if (!config.googleServiceAccountJson || !config.googleAdminEmail || !config.googleDomain) {
    return res.status(400).json({
      error: {
        code: "INCOMPLETE_CONFIG",
        message: "Google Workspace config is incomplete. Need: domain, service account JSON, admin email.",
      },
    });
  }

  try {
    const result = await testWorkspaceConnectivity({
      serviceAccountJson: config.googleServiceAccountJson,
      adminEmail: config.googleAdminEmail,
      domain: config.googleDomain,
    });

    // If test passes, mark as ready
    if (result.success) {
      await db
        .update(workspaceConfig)
        .set({ setupStatus: "ready", updatedAt: new Date() })
        .where(eq(workspaceConfig.teamId, teamId));
    }

    res.json({ data: result });
  } catch (error) {
    logger.error("Workspace connectivity test failed", error as Error, { teamId });
    res.status(500).json({
      error: { code: "CONNECTIVITY_TEST_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/admin/identities
 * List all PA identities for a team.
 */
router.get("/identities", async (req: Request, res: Response) => {
  const teamId = req.query.teamId as string;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId query parameter is required" },
    });
  }

  const { paIdentities } = await import("../db/schema.js");
  const identities = await db
    .select()
    .from(paIdentities)
    .where(eq(paIdentities.teamId, teamId));

  res.json({ data: identities, meta: { total: identities.length } });
});

/**
 * POST /api/admin/provision-all
 * Batch-provision PA accounts for all team members.
 * Fetches members from the app backend, then creates a Google Workspace account for each.
 */
router.post("/provision-all", async (req: Request, res: Response) => {
  const { teamId } = req.body;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId is required" },
    });
  }

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!config || config.setupStatus !== "ready") {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "Google Workspace is not configured/ready for this team" },
    });
  }

  // Fetch team members from the parent app backend
  const members = await getTeamMembers(teamId);
  if (members.length === 0) {
    return res.status(400).json({
      error: { code: "NO_MEMBERS", message: "No team members found (is the app backend reachable?)" },
    });
  }

  const { paIdentities } = await import("../db/schema.js");
  const results: Array<{ userId: string; name: string; paEmail: string; status: string; error?: string }> = [];

  for (const member of members) {
    // Check if already provisioned
    const existing = await db.query.paIdentities.findFirst({
      where: eq(paIdentities.userId, member.id),
    });

    if (existing) {
      results.push({
        userId: member.id,
        name: member.name,
        paEmail: existing.paEmail,
        status: "skipped",
      });
      continue;
    }

    // Generate PA email
    const slug = member.name.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
    const paEmail = `${slug}-pa@${config.googleDomain}`;
    const displayName = `${member.name}'s PA`;

    const now = new Date();

    try {
      // Insert identity
      await db.insert(paIdentities).values({
        userId: member.id,
        teamId,
        paEmail,
        displayName,
        clientEmail: member.email,
        clientName: member.name,
        provisionStatus: "provisioning",
        createdAt: now,
        updatedAt: now,
      });

      // Provision Google Workspace account
      const result = await provisionPaAccount({
        serviceAccountJson: config.googleServiceAccountJson!,
        adminEmail: config.googleAdminEmail!,
        domain: config.googleDomain!,
        paEmail,
        displayName,
        clientName: member.name,
      });

      await db
        .update(paIdentities)
        .set({ googleUserId: result.googleUserId, provisionStatus: "active", updatedAt: new Date() })
        .where(eq(paIdentities.userId, member.id));

      results.push({ userId: member.id, name: member.name, paEmail, status: "active" });
    } catch (error) {
      // Mark as failed but don't stop the batch
      await db
        .update(paIdentities)
        .set({ provisionStatus: "pending", updatedAt: new Date() })
        .where(eq(paIdentities.userId, member.id));

      results.push({
        userId: member.id,
        name: member.name,
        paEmail,
        status: "failed",
        error: (error as Error).message,
      });

      logger.error("Batch provision failed for member", error as Error, { userId: member.id, paEmail });
    }
  }

  const succeeded = results.filter((r) => r.status === "active").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;

  logger.info("Batch provisioning complete", { teamId, succeeded, failed, skipped });

  res.json({
    data: results,
    meta: { total: results.length, succeeded, failed, skipped },
  });
});

/**
 * GET /api/admin/domain-users
 * List all users in the Google Workspace domain (for debugging/admin).
 */
router.get("/domain-users", async (req: Request, res: Response) => {
  const teamId = req.query.teamId as string;

  if (!teamId) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "teamId query parameter is required" },
    });
  }

  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!config || !config.googleServiceAccountJson || !config.googleAdminEmail || !config.googleDomain) {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_CONFIGURED", message: "Google Workspace is not configured for this team" },
    });
  }

  try {
    const users = await listDomainUsers({
      serviceAccountJson: config.googleServiceAccountJson,
      adminEmail: config.googleAdminEmail,
      domain: config.googleDomain,
    });

    res.json({ data: users, meta: { total: users.length } });
  } catch (error) {
    logger.error("Failed to list domain users", error as Error, { teamId });
    res.status(500).json({
      error: { code: "LIST_FAILED", message: (error as Error).message },
    });
  }
});

/** Mask sensitive fields before returning config to clients. */
function maskSensitiveFields(config: typeof workspaceConfig.$inferSelect) {
  return {
    ...config,
    googleServiceAccountJson: config.googleServiceAccountJson ? "[CONFIGURED]" : null,
    serviceToken: config.serviceToken ? "[CONFIGURED]" : null,
  };
}

export const adminRoutes = router;
