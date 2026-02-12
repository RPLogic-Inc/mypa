/**
 * Onboarding Routes
 * Handles team invites and user onboarding flow
 */

import { Router } from "express";
import { z } from "zod";
import { db, teamInvites, teams, userOnboarding, users } from "../db/index.js";
import { eq, desc } from "drizzle-orm";
import {
  createTeamInvite,
  validateInviteCode,
  acceptInvite,
  getOnboardingStatus,
  completeOnboardingStep,
  createOpenClawAgent,
} from "../services/onboarding.js";
import { recordProductEvent } from "../services/tezOps.js";
import { authenticate, requireRole, logger, strictRateLimit } from "../middleware/index.js";

export const onboardingRoutes = Router();

// ═══════════════════════════════════════════════════════════════════════════
// INVITE MANAGEMENT (requires authentication)
// ═══════════════════════════════════════════════════════════════════════════

// Validation schemas
const createInviteSchema = z.object({
  teamId: z.string().uuid(),
  email: z.string().email().optional(),
  maxUses: z.number().int().min(1).optional(),
  expiresInDays: z.number().int().min(1).max(365).optional(),
  defaultRoles: z.array(z.string()).optional(),
  defaultSkills: z.array(z.string()).optional(),
  defaultDepartment: z.string().optional(),
  defaultNotificationPrefs: z.object({
    urgentPush: z.boolean(),
    digestTime: z.string().optional(),
  }).optional(),
  openclawConfig: z.object({
    createAgent: z.boolean(),
    agentTemplate: z.string().optional(),
    initialMemory: z.array(z.string()).optional(),
    enabledTools: z.array(z.string()).optional(),
    teamContext: z.string().optional(),
  }).optional(),
});

/**
 * POST /api/onboarding/invites
 * Create a new team invite (requires team lead/admin role)
 */
onboardingRoutes.post("/invites", authenticate, requireRole("team_lead", "admin"), strictRateLimit, async (req, res) => {
  try {
    const parseResult = createInviteSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const data = parseResult.data;

    // Verify team exists and user has access
    const team = await db.select().from(teams).where(eq(teams.id, data.teamId)).limit(1);
    if (team.length === 0) {
      return res.status(404).json({
        error: { code: "TEAM_NOT_FOUND", message: "Team not found" },
      });
    }

    // Check user is part of the team
    if (req.user!.id !== team[0].leads?.[0]) {
      // Simplified check - in production, check team membership properly
      logger.warn("User creating invite for team they may not lead", {
        userId: req.user!.id,
        teamId: data.teamId,
      });
    }

    const invite = await createTeamInvite({
      ...data,
      createdByUserId: req.user!.id,
    });

    await recordProductEvent({
      userId: req.user!.id,
      teamId: data.teamId,
      eventName: "team_invite_sent",
      metadata: {
        hasEmailRestriction: !!data.email,
        maxUses: data.maxUses || 1,
      },
    });

    logger.info("Team invite created", {
      requestId: req.requestId,
      inviteId: invite.id,
      teamId: data.teamId,
      createdBy: req.user!.id,
    });

    res.status(201).json({
      invite: {
        id: invite.id,
        code: invite.code,
        teamId: invite.teamId,
        email: invite.email,
        maxUses: invite.maxUses,
        expiresAt: invite.expiresAt,
        status: invite.status,
        createdAt: invite.createdAt,
      },
      shareUrl: `${process.env.APP_URL || "http://localhost:5173"}/join/${invite.code}`,
    });
  } catch (error) {
    logger.error("Failed to create invite", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "CREATE_INVITE_ERROR", message: "Failed to create invite" },
    });
  }
});

/**
 * GET /api/onboarding/invites
 * List team invites (for teams user leads)
 */
onboardingRoutes.get("/invites", authenticate, async (req, res) => {
  try {
    const invites = await db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.createdByUserId, req.user!.id))
      .orderBy(desc(teamInvites.createdAt))
      .limit(50);

    res.json({ invites });
  } catch (error) {
    logger.error("Failed to fetch invites", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "FETCH_INVITES_ERROR", message: "Failed to fetch invites" },
    });
  }
});

/**
 * DELETE /api/onboarding/invites/:id
 * Revoke an invite
 */
onboardingRoutes.delete("/invites/:id", authenticate, async (req, res) => {
  try {
    const id = req.params.id as string;

    // Verify ownership
    const invite = await db.select().from(teamInvites).where(eq(teamInvites.id, id)).limit(1);
    if (invite.length === 0) {
      return res.status(404).json({
        error: { code: "INVITE_NOT_FOUND", message: "Invite not found" },
      });
    }

    if (invite[0].createdByUserId !== req.user!.id) {
      return res.status(403).json({
        error: { code: "FORBIDDEN", message: "You cannot revoke this invite" },
      });
    }

    await db
      .update(teamInvites)
      .set({ status: "revoked" as const, updatedAt: new Date() })
      .where(eq(teamInvites.id, id));

    res.json({ success: true });
  } catch (error) {
    logger.error("Failed to revoke invite", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "REVOKE_INVITE_ERROR", message: "Failed to revoke invite" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// INVITE ACCEPTANCE (public with rate limiting)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/onboarding/invites/validate/:code
 * Validate an invite code (public endpoint)
 */
onboardingRoutes.get("/invites/validate/:code", strictRateLimit, async (req, res) => {
  try {
    const code = req.params.code as string;
    const email = req.query.email as string | undefined;

    const result = await validateInviteCode(code, email);

    if (!result.valid) {
      return res.status(400).json({
        error: { code: "INVALID_INVITE", message: result.error },
      });
    }

    res.json({
      valid: true,
      team: {
        id: result.team.id,
        name: result.team.name,
      },
      invite: {
        email: result.invite.email,
        defaultDepartment: result.invite.defaultDepartment,
        defaultRoles: result.invite.defaultRoles,
        openclawConfig: result.invite.openclawConfig ? {
          createAgent: result.invite.openclawConfig.createAgent,
        } : undefined,
      },
    });
  } catch (error) {
    logger.error("Failed to validate invite", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "VALIDATION_ERROR", message: "Failed to validate invite" },
    });
  }
});

/**
 * POST /api/onboarding/invites/accept
 * Accept an invite (requires authentication)
 */
onboardingRoutes.post("/invites/accept", authenticate, strictRateLimit, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || typeof code !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invite code is required" },
      });
    }

    const invite = await db.query.teamInvites.findFirst({
      where: eq(teamInvites.code, code),
    });

    const result = await acceptInvite(code, req.user!.id);

    if (!result.success) {
      return res.status(400).json({
        error: { code: "ACCEPT_INVITE_ERROR", message: result.error },
      });
    }

    logger.info("Invite accepted", {
      requestId: req.requestId,
      userId: req.user!.id,
      inviteCode: code,
    });

    await recordProductEvent({
      userId: req.user!.id,
      teamId: invite?.teamId || null,
      eventName: "team_invite_accepted",
      metadata: {
        inviteCodePrefix: code.slice(0, 4),
      },
    });

    res.json({
      success: true,
      onboarding: result.onboarding,
    });
  } catch (error) {
    logger.error("Failed to accept invite", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "ACCEPT_INVITE_ERROR", message: "Failed to accept invite" },
    });
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// ONBOARDING FLOW
// ═══════════════════════════════════════════════════════════════════════════

/**
 * GET /api/onboarding/status
 * Get current user's onboarding status
 */
onboardingRoutes.get("/status", authenticate, async (req, res) => {
  try {
    const status = await getOnboardingStatus(req.user!.id);

    if (!status) {
      return res.json({
        hasOnboarding: false,
        message: "No onboarding in progress",
      });
    }

    res.json({
      hasOnboarding: true,
      ...status,
    });
  } catch (error) {
    logger.error("Failed to get onboarding status", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "STATUS_ERROR", message: "Failed to get onboarding status" },
    });
  }
});

/**
 * POST /api/onboarding/complete-step
 * Mark an onboarding step as complete
 */
onboardingRoutes.post("/complete-step", authenticate, async (req, res) => {
  try {
    const { step } = req.body;

    const validSteps = ["profile", "notifications", "assistant-created", "assistant-configured", "team-tour"];
    if (!step || !validSteps.includes(step)) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid step. Must be one of: ${validSteps.join(", ")}`,
        },
      });
    }

    const status = await completeOnboardingStep(req.user!.id, step);

    if (!status) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "No onboarding found for user" },
      });
    }

    logger.info("Onboarding step completed", {
      requestId: req.requestId,
      userId: req.user!.id,
      step,
    });

    res.json({ success: true, status });
  } catch (error) {
    logger.error("Failed to complete onboarding step", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "COMPLETE_STEP_ERROR", message: "Failed to complete step" },
    });
  }
});

/**
 * POST /api/onboarding/retry-assistant
 * DEPRECATED: OpenClaw agent creation is now handled externally.
 * Users should configure their PA via OpenClaw desktop app.
 */
onboardingRoutes.post("/retry-assistant", authenticate, (req, res) => {
  res.status(410).json({
    error: {
      code: "ENDPOINT_DEPRECATED",
      message: "Agent provisioning is now handled by OpenClaw directly. Please use OpenClaw desktop to configure your PA.",
    },
  });
});
