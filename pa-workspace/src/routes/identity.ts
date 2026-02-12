import { Router, Request, Response } from "express";
import { db, paIdentities } from "../db/index.js";
import { eq } from "drizzle-orm";
import { authenticate } from "../middleware/index.js";
import { logger } from "../middleware/logging.js";
import { provisionPaAccount, suspendPaAccount, reactivatePaAccount, deletePaAccount } from "../services/googleAdmin.js";

/** Extract userId param as string (Express 5 types it as string | string[]). */
function getParam(req: Request, name: string): string {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : val;
}

/**
 * Privacy: only allow access to your own PA identity.
 * Service-auth (backend service token) bypasses for provisioning/workflows.
 */
function assertIdentityOwnership(req: Request, targetUserId: string): string | null {
  if (req.isServiceAuth) return null;
  if (!req.user) return "Authentication required";
  if (req.user.id !== targetUserId) return "You can only access your own PA identity";
  return null;
}

const router = Router();

router.use(authenticate);

/**
 * GET /api/identity/by-user/:userId
 * Get PA identity for a user (own identity only, unless service-auth)
 */
router.get("/by-user/:userId", async (req: Request, res: Response) => {
  const userId = getParam(req, "userId");

  const ownershipError = assertIdentityOwnership(req, userId);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No PA identity found for this user" },
    });
  }

  res.json({ data: identity });
});

/**
 * POST /api/identity/provision
 * Create a PA Google Workspace account for one user.
 */
router.post("/provision", async (req: Request, res: Response) => {
  const { userId, teamId, clientName, clientEmail } = req.body;

  if (!userId || !teamId || !clientName) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "userId, teamId, and clientName are required" },
    });
  }

  // Check if identity already exists
  const existing = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (existing) {
    return res.status(409).json({
      error: { code: "ALREADY_EXISTS", message: "PA identity already exists for this user" },
      data: existing,
    });
  }

  // Get workspace config for this team
  const { workspaceConfig } = await import("../db/schema.js");
  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, teamId),
  });

  if (!config || config.setupStatus !== "ready") {
    return res.status(400).json({
      error: { code: "WORKSPACE_NOT_READY", message: "Google Workspace is not configured for this team" },
    });
  }

  // Generate PA email from client name
  const slug = clientName.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 20);
  const paEmail = `${slug}-pa@${config.googleDomain}`;
  const displayName = `${clientName}'s PA`;

  const now = new Date();

  // Insert identity with pending status
  await db.insert(paIdentities).values({
    userId,
    teamId,
    paEmail,
    displayName,
    clientEmail: clientEmail || null,
    clientName,
    provisionStatus: "provisioning",
    createdAt: now,
    updatedAt: now,
  });

  logger.info("PA identity provisioning started", { userId, paEmail });

  // Provision the Google Workspace account (async)
  try {
    const result = await provisionPaAccount({
      serviceAccountJson: config.googleServiceAccountJson!,
      adminEmail: config.googleAdminEmail!,
      domain: config.googleDomain!,
      paEmail,
      displayName,
      clientName,
    });

    await db
      .update(paIdentities)
      .set({
        googleUserId: result.googleUserId,
        provisionStatus: "active",
        updatedAt: new Date(),
      })
      .where(eq(paIdentities.userId, userId));

    logger.info("PA account provisioned", { userId, paEmail, googleUserId: result.googleUserId });

    const identity = await db.query.paIdentities.findFirst({
      where: eq(paIdentities.userId, userId),
    });

    res.status(201).json({ data: identity });
  } catch (error) {
    // Revert to pending on failure
    await db
      .update(paIdentities)
      .set({ provisionStatus: "pending", updatedAt: new Date() })
      .where(eq(paIdentities.userId, userId));

    logger.error("PA provisioning failed", error as Error, { userId, paEmail });

    res.status(500).json({
      error: { code: "PROVISION_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * GET /api/identity/:userId
 * Get PA identity details for a user (own identity only, unless service-auth).
 */
router.get("/:userId", async (req: Request, res: Response) => {
  const userId = getParam(req, "userId");

  const ownershipError = assertIdentityOwnership(req, userId);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No PA identity for this user" },
    });
  }

  res.json({ data: identity });
});

/**
 * POST /api/identity/:userId/suspend
 * Suspend a PA Google Workspace account.
 */
router.post("/:userId/suspend", async (req: Request, res: Response) => {
  const userId = getParam(req, "userId");

  const ownershipError = assertIdentityOwnership(req, userId);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No PA identity for this user" },
    });
  }

  if (identity.provisionStatus !== "active") {
    return res.status(400).json({
      error: { code: "INVALID_STATUS", message: `Cannot suspend PA in status: ${identity.provisionStatus}` },
    });
  }

  const { workspaceConfig } = await import("../db/schema.js");
  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });

  if (!config) {
    return res.status(500).json({
      error: { code: "CONFIG_MISSING", message: "Workspace config not found" },
    });
  }

  try {
    await suspendPaAccount({
      serviceAccountJson: config.googleServiceAccountJson!,
      adminEmail: config.googleAdminEmail!,
      googleUserId: identity.googleUserId!,
    });

    await db
      .update(paIdentities)
      .set({ provisionStatus: "suspended", updatedAt: new Date() })
      .where(eq(paIdentities.userId, userId));

    logger.info("PA account suspended", { userId, paEmail: identity.paEmail });

    res.json({ data: { userId, status: "suspended" } });
  } catch (error) {
    logger.error("PA suspension failed", error as Error, { userId });
    res.status(500).json({
      error: { code: "SUSPEND_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * POST /api/identity/:userId/reactivate
 * Reactivate a suspended PA Google Workspace account.
 */
router.post("/:userId/reactivate", async (req: Request, res: Response) => {
  const userId = getParam(req, "userId");

  const ownershipError = assertIdentityOwnership(req, userId);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No PA identity for this user" },
    });
  }

  if (identity.provisionStatus !== "suspended") {
    return res.status(400).json({
      error: { code: "INVALID_STATUS", message: `Cannot reactivate PA in status: ${identity.provisionStatus}` },
    });
  }

  const { workspaceConfig } = await import("../db/schema.js");
  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });

  if (!config) {
    return res.status(500).json({
      error: { code: "CONFIG_MISSING", message: "Workspace config not found" },
    });
  }

  try {
    await reactivatePaAccount({
      serviceAccountJson: config.googleServiceAccountJson!,
      adminEmail: config.googleAdminEmail!,
      googleUserId: identity.googleUserId!,
    });

    await db
      .update(paIdentities)
      .set({ provisionStatus: "active", updatedAt: new Date() })
      .where(eq(paIdentities.userId, userId));

    logger.info("PA account reactivated", { userId, paEmail: identity.paEmail });

    res.json({ data: { userId, status: "active" } });
  } catch (error) {
    logger.error("PA reactivation failed", error as Error, { userId });
    res.status(500).json({
      error: { code: "REACTIVATE_FAILED", message: (error as Error).message },
    });
  }
});

/**
 * DELETE /api/identity/:userId
 * Delete a PA Google Workspace account permanently.
 */
router.delete("/:userId", async (req: Request, res: Response) => {
  const userId = getParam(req, "userId");

  const ownershipError = assertIdentityOwnership(req, userId);
  if (ownershipError) {
    return res.status(403).json({ error: { code: "FORBIDDEN", message: ownershipError } });
  }

  const identity = await db.query.paIdentities.findFirst({
    where: eq(paIdentities.userId, userId),
  });

  if (!identity) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "No PA identity for this user" },
    });
  }

  const { workspaceConfig } = await import("../db/schema.js");
  const config = await db.query.workspaceConfig.findFirst({
    where: eq(workspaceConfig.teamId, identity.teamId),
  });

  if (config && identity.googleUserId) {
    try {
      await deletePaAccount({
        serviceAccountJson: config.googleServiceAccountJson!,
        adminEmail: config.googleAdminEmail!,
        googleUserId: identity.googleUserId,
      });
    } catch (error) {
      logger.warn("Google account deletion failed (continuing with local cleanup)", {
        userId,
        error: (error as Error).message,
      });
    }
  }

  await db
    .update(paIdentities)
    .set({ provisionStatus: "deleted", updatedAt: new Date() })
    .where(eq(paIdentities.userId, userId));

  logger.info("PA identity deleted", { userId, paEmail: identity.paEmail });

  res.json({ data: { userId, status: "deleted" } });
});

export const identityRoutes = router;
