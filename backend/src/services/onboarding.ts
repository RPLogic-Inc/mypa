/**
 * Onboarding Service
 * Handles user onboarding flow including OpenClaw assistant setup
 */

import { db, users, teamInvites, userOnboarding, teams, userRoles, userSkills, userTeams } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";
import { logger } from "../middleware/logging.js";
import { OPENCLAW_INTEGRATION_MODE } from "../config/app.js";

/**
 * Generate a random invite code (8 characters, alphanumeric)
 */
export function generateInviteCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed confusing chars (0, O, I, 1)
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Create a team invite
 */
export async function createTeamInvite(data: {
  teamId: string;
  createdByUserId: string;
  email?: string;
  maxUses?: number;
  expiresInDays?: number;
  defaultRoles?: string[];
  defaultSkills?: string[];
  defaultDepartment?: string;
  defaultNotificationPrefs?: { urgentPush: boolean; digestTime?: string };
  openclawConfig?: {
    createAgent: boolean;
    agentTemplate?: string;
    initialMemory?: string[];
    enabledTools?: string[];
    teamContext?: string;
  };
}) {
  // Generate unique invite code
  let code: string;
  let attempts = 0;
  do {
    code = generateInviteCode();
    const existing = await db
      .select()
      .from(teamInvites)
      .where(eq(teamInvites.code, code))
      .limit(1);
    if (existing.length === 0) break;
    attempts++;
  } while (attempts < 10);

  if (attempts >= 10) {
    throw new Error("Failed to generate unique invite code");
  }

  const id = randomUUID();
  const now = new Date();
  const expiresAt = data.expiresInDays
    ? new Date(now.getTime() + data.expiresInDays * 24 * 60 * 60 * 1000)
    : undefined;

  const invite = {
    id,
    code,
    teamId: data.teamId,
    createdByUserId: data.createdByUserId,
    email: data.email?.toLowerCase(),
    maxUses: data.maxUses ?? 1,
    usedCount: 0,
    expiresAt,
    defaultRoles: data.defaultRoles || [],
    defaultSkills: data.defaultSkills || [],
    defaultDepartment: data.defaultDepartment,
    defaultNotificationPrefs: data.defaultNotificationPrefs,
    openclawConfig: data.openclawConfig || { createAgent: false },
    status: "active" as const,
    createdAt: now,
    updatedAt: now,
  };

  await db.insert(teamInvites).values(invite);

  return invite;
}

/**
 * Validate an invite code
 */
export async function validateInviteCode(
  code: string,
  email?: string
): Promise<{ valid: true; invite: typeof teamInvites.$inferSelect; team: typeof teams.$inferSelect } | { valid: false; error: string }> {
  const result = await db
    .select()
    .from(teamInvites)
    .where(eq(teamInvites.code, code.toUpperCase()))
    .limit(1);

  if (result.length === 0) {
    return { valid: false, error: "Invalid invite code" };
  }

  const invite = result[0];

  // Check status
  if (invite.status !== "active") {
    return { valid: false, error: "This invite has been revoked" };
  }

  // Check expiration
  if (invite.expiresAt && new Date(invite.expiresAt) < new Date()) {
    return { valid: false, error: "This invite has expired" };
  }

  // Check usage limit
  if (invite.maxUses && (invite.usedCount ?? 0) >= invite.maxUses) {
    return { valid: false, error: "This invite has reached its usage limit" };
  }

  // Check if invite is for specific email
  if (invite.email && email && invite.email.toLowerCase() !== email.toLowerCase()) {
    return { valid: false, error: "This invite is for a different email address" };
  }

  // Get team info
  const teamResult = await db
    .select()
    .from(teams)
    .where(eq(teams.id, invite.teamId))
    .limit(1);

  if (teamResult.length === 0) {
    return { valid: false, error: "Team not found" };
  }

  return { valid: true, invite, team: teamResult[0] };
}

/**
 * Create a standalone onboarding record for a user who registered without an invite.
 * Marks assistant steps as skipped (OpenClaw handles its own provisioning).
 */
export async function createOnboardingRecord(userId: string) {
  const existing = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  if (existing.length > 0) return existing[0];

  const record = {
    id: randomUUID(),
    userId,
    inviteId: null,
    profileCompleted: false,
    notificationsConfigured: false,
    assistantCreated: true, // skipped — OpenClaw runtime handles this
    assistantConfigured: false,
    teamTourCompleted: false,
    openclawAgentStatus: "skipped" as const,
    startedAt: new Date(),
  };

  await db.insert(userOnboarding).values(record);
  return record;
}

/**
 * Accept an invite and set up user onboarding
 */
export async function acceptInvite(
  inviteCode: string,
  userId: string
): Promise<{ success: true; onboarding: typeof userOnboarding.$inferSelect } | { success: false; error: string }> {
  // Validate invite
  const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (user.length === 0) {
    return { success: false, error: "User not found" };
  }

  const validation = await validateInviteCode(inviteCode, user[0].email);
  if (!validation.valid) {
    return { success: false, error: validation.error };
  }

  const { invite, team } = validation;

  // Update invite usage count
  await db
    .update(teamInvites)
    .set({
      usedCount: (invite.usedCount || 0) + 1,
      updatedAt: new Date(),
    })
    .where(eq(teamInvites.id, invite.id));

  // Apply default settings to user
  const updates: Record<string, unknown> = {
    teamId: team.id,
    updatedAt: new Date(),
  };

  if (invite.defaultDepartment && !user[0].department) {
    updates.department = invite.defaultDepartment;
  }

  if (invite.defaultNotificationPrefs) {
    updates.notificationPrefs = invite.defaultNotificationPrefs;
  }

  await db.update(users).set(updates).where(eq(users.id, userId));

  // Add user_teams junction table entry
  try {
    await db.insert(userTeams).values({
      userId,
      teamId: team.id,
      role: "member",
      joinedAt: new Date(),
    });
  } catch {
    // Ignore duplicate membership errors (user already in team)
  }

  // Add default roles to junction table
  if (invite.defaultRoles && invite.defaultRoles.length > 0) {
    for (const role of invite.defaultRoles) {
      try {
        await db.insert(userRoles).values({ userId, role });
      } catch {
        // Ignore duplicate role errors
      }
    }
  }

  // Add default skills to junction table
  if (invite.defaultSkills && invite.defaultSkills.length > 0) {
    for (const skill of invite.defaultSkills) {
      try {
        await db.insert(userSkills).values({ userId, skill });
      } catch {
        // Ignore duplicate skill errors
      }
    }
  }

  const legacyAgentProvisioning =
    OPENCLAW_INTEGRATION_MODE === "legacy" &&
    !!invite.openclawConfig?.createAgent;
  const initialAgentStatus: "pending" | "skipped" =
    legacyAgentProvisioning ? "pending" : "skipped";

  // Create or update onboarding record.
  // If registration already created a record (via createOnboardingRecord), update it
  // with invite-specific fields instead of inserting a duplicate.
  const existingOnboarding = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  let onboarding: typeof userOnboarding.$inferSelect;

  if (existingOnboarding.length > 0) {
    // Update existing record with invite-specific data
    await db
      .update(userOnboarding)
      .set({
        inviteId: invite.id,
        notificationsConfigured: !!invite.defaultNotificationPrefs || existingOnboarding[0].notificationsConfigured,
        assistantCreated: !legacyAgentProvisioning,
        openclawAgentStatus: initialAgentStatus,
      })
      .where(eq(userOnboarding.userId, userId));
    onboarding = { ...existingOnboarding[0], inviteId: invite.id } as typeof userOnboarding.$inferSelect;
  } else {
    const onboardingId = randomUUID();
    const newRecord = {
      id: onboardingId,
      userId,
      inviteId: invite.id,
      profileCompleted: false,
      notificationsConfigured: !!invite.defaultNotificationPrefs,
      assistantCreated: !legacyAgentProvisioning,
      assistantConfigured: false,
      teamTourCompleted: false,
      openclawAgentStatus: initialAgentStatus,
      startedAt: new Date(),
    };
    await db.insert(userOnboarding).values(newRecord);
    onboarding = newRecord as typeof userOnboarding.$inferSelect;
  }

  // Trigger async OpenClaw agent creation only in explicit legacy mode.
  if (legacyAgentProvisioning) {
    // Don't await - let it run in background
    createOpenClawAgent(userId, invite.openclawConfig || { createAgent: false }, team).catch((error) => {
      logger.error("Failed to create OpenClaw agent", error as Error, { userId });
    });
  }

  return { success: true, onboarding: onboarding as typeof userOnboarding.$inferSelect };
}

/**
 * Create OpenClaw agent for user
 */
export async function createOpenClawAgent(
  userId: string,
  config: {
    createAgent?: boolean;
    agentTemplate?: string;
    initialMemory?: string[];
    enabledTools?: string[];
    teamContext?: string;
  },
  _team: typeof teams.$inferSelect
) {
  logger.warn("createOpenClawAgent is deprecated; backend no longer provisions OpenClaw agents", {
    userId,
    integrationMode: OPENCLAW_INTEGRATION_MODE,
    requestedTemplate: config.agentTemplate,
  });

  await db
    .update(userOnboarding)
    .set({
      openclawAgentStatus: "skipped",
      assistantCreated: true,
      openclawAgentError: "Agent provisioning moved to OpenClaw runtime",
    })
    .where(eq(userOnboarding.userId, userId));
}

/**
 * Get onboarding status for a user
 */
export async function getOnboardingStatus(userId: string) {
  const result = await db
    .select()
    .from(userOnboarding)
    .where(eq(userOnboarding.userId, userId))
    .limit(1);

  if (result.length === 0) {
    return null;
  }

  const onboarding = result[0];

  // Calculate completion percentage - exclude assistant steps in optional/disabled mode
  const steps = [
    onboarding.profileCompleted,
    onboarding.notificationsConfigured,
    // Only include assistant steps in legacy mode
    ...(OPENCLAW_INTEGRATION_MODE === "legacy"
      ? [onboarding.assistantCreated, onboarding.assistantConfigured]
      : []
    ),
    onboarding.teamTourCompleted,
  ];
  const completedSteps = steps.filter(Boolean).length;
  const completionPercentage = Math.round((completedSteps / steps.length) * 100);

  // Determine next step based on integration mode
  let nextStep: string | null = null;
  if (!onboarding.profileCompleted) {
    nextStep = "profile";
  } else if (!onboarding.notificationsConfigured) {
    nextStep = "notifications";
  } else if (OPENCLAW_INTEGRATION_MODE === "legacy") {
    if (!onboarding.assistantCreated || onboarding.openclawAgentStatus === "pending") {
      nextStep = "assistant-setup";
    } else if (!onboarding.assistantConfigured) {
      nextStep = "assistant-config";
    } else if (!onboarding.teamTourCompleted) {
      nextStep = "team-tour";
    }
  } else if (!onboarding.teamTourCompleted) {
    nextStep = "team-tour";
  }

  return {
    ...onboarding,
    completionPercentage,
    isComplete: completedSteps === steps.length,
    nextStep,
  };
}

/**
 * Update onboarding step completion
 */
export async function completeOnboardingStep(
  userId: string,
  step: "profile" | "notifications" | "assistant-created" | "assistant-configured" | "team-tour"
) {
  const updates: Record<string, unknown> = {};

  switch (step) {
    case "profile":
      updates.profileCompleted = true;
      break;
    case "notifications":
      updates.notificationsConfigured = true;
      break;
    case "assistant-created":
      updates.assistantCreated = true;
      break;
    case "assistant-configured":
      updates.assistantConfigured = true;
      break;
    case "team-tour":
      updates.teamTourCompleted = true;
      break;
  }

  await db
    .update(userOnboarding)
    .set(updates)
    .where(eq(userOnboarding.userId, userId));

  // Check if all steps are complete
  const status = await getOnboardingStatus(userId);
  if (status?.isComplete) {
    await db
      .update(userOnboarding)
      .set({ completedAt: new Date() })
      .where(eq(userOnboarding.userId, userId));
  }

  return status;
}
