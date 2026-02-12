import { Router } from "express";
import { db, users, teams, userTeams, userRoles } from "../db/index.js";
import { eq, inArray, and, ne, sql } from "drizzle-orm";
import { randomUUID } from "crypto";
import { notificationService } from "../services/notifications.js";
import { authenticate, requireRole, validate, schemas, standardRateLimit, strictRateLimit, logger } from "../middleware/index.js";

export const userRoutes = Router();

// Apply standard rate limiting to all user routes
userRoutes.use(standardRateLimit);

/**
 * Strip sensitive fields (passwordHash, etc.) from user objects before returning to clients.
 */
function sanitizeUser(user: Record<string, unknown>): Record<string, unknown> {
  const { passwordHash, ...safe } = user;
  return safe;
}

// Get current user profile
userRoutes.get("/me", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(sanitizeUser(user[0] as unknown as Record<string, unknown>));
  } catch (error) {
    logger.error("Error fetching user", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Update current user profile
userRoutes.patch("/me", authenticate, validate({ body: schemas.updateUser }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { name, avatarUrl, notificationPrefs } = req.body;

    const updates: Record<string, unknown> = { updatedAt: new Date() };
    if (name) updates.name = name;
    if (avatarUrl) updates.avatarUrl = avatarUrl;
    if (notificationPrefs) updates.notificationPrefs = notificationPrefs;

    await db.update(users).set(updates).where(eq(users.id, userId));

    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    // Fire-and-forget: sync profile changes to relay contacts
    if (name || avatarUrl) {
      const relayBaseUrl = process.env.TEZIT_RELAY_URL || "http://localhost:3002";
      const relaySyncToken = process.env.TEZIT_RELAY_SYNC_TOKEN || process.env.RELAY_SYNC_TOKEN;
      if (relaySyncToken) {
        fetch(`${relayBaseUrl}/contacts/admin/upsert`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-relay-sync-token": relaySyncToken },
          body: JSON.stringify({
            id: userId,
            displayName: updated[0].name,
            email: updated[0].email,
            ...(updated[0].avatarUrl && { avatarUrl: updated[0].avatarUrl }),
          }),
        }).catch((err) => logger.error("Relay contact sync failed", err as Error));
      }
    }

    res.json(sanitizeUser(updated[0] as unknown as Record<string, unknown>));
  } catch (error) {
    logger.error("Error updating user", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to update user" });
  }
});

// Update notification preferences specifically
userRoutes.patch("/me/notifications", authenticate, validate({ body: schemas.updateNotificationPrefs }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const { urgentPush, digestTime } = req.body;

    // Get current user to merge notification prefs
    const currentUser = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (currentUser.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Merge existing prefs with new values
    const existingPrefs = currentUser[0].notificationPrefs || { urgentPush: true };
    const newPrefs: { urgentPush: boolean; digestTime?: string } = {
      urgentPush: urgentPush !== undefined ? urgentPush : existingPrefs.urgentPush,
      ...(digestTime !== undefined && { digestTime }),
      ...(existingPrefs.digestTime !== undefined && digestTime === undefined && { digestTime: existingPrefs.digestTime }),
    };

    await db
      .update(users)
      .set({
        notificationPrefs: newPrefs,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    res.json({
      notificationPrefs: updated[0].notificationPrefs,
      ntfyTopic: notificationService.getNtfyTopic(userId),
      ntfyUrl: notificationService.getNtfyUrl(userId),
    });
  } catch (error) {
    logger.error("Error updating notification preferences", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to update notification preferences" });
  }
});

// Grant or revoke AI consent (for external AI API calls like OpenAI)
userRoutes.post("/me/consent", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { granted } = req.body;

    if (typeof granted !== 'boolean') {
      return res.status(400).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'granted must be a boolean'
        }
      });
    }

    await db
      .update(users)
      .set({
        aiConsentGiven: granted,
        aiConsentDate: granted ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(users.id, userId));

    const updated = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    logger.info(`User ${granted ? 'granted' : 'revoked'} AI consent`, { userId });

    res.json({
      aiConsentGiven: updated[0].aiConsentGiven,
      aiConsentDate: updated[0].aiConsentDate,
    });
  } catch (error) {
    logger.error("Error updating AI consent", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: 'Failed to update AI consent'
      }
    });
  }
});

// Get notification setup info (topic, URL, etc.)
userRoutes.get("/me/notifications", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db
      .select()
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json({
      notificationPrefs: user[0].notificationPrefs || { urgentPush: true },
      ntfyTopic: notificationService.getNtfyTopic(userId),
      ntfyUrl: notificationService.getNtfyUrl(userId),
      subscribeInstructions: {
        web: `Visit ${notificationService.getNtfyUrl(userId)} and click "Subscribe"`,
        android: `Install ntfy app, add topic: ${notificationService.getNtfyTopic(userId)}`,
        ios: `Install ntfy app, add topic: ${notificationService.getNtfyTopic(userId)}`,
        cli: `ntfy subscribe ${notificationService.getNtfyTopic(userId)}`,
      },
    });
  } catch (error) {
    logger.error("Error fetching notification info", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch notification info" });
  }
});

// Send a test notification
userRoutes.post("/me/notifications/test", authenticate, strictRateLimit, async (req, res) => {
  try {
    const userId = req.user!.id;

    const result = await notificationService.sendTestNotification(userId);

    if (result.success) {
      res.json({
        success: true,
        message: "Test notification sent! Check your ntfy app or browser.",
        topic: notificationService.getNtfyTopic(userId),
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || "Failed to send test notification",
      });
    }
  } catch (error) {
    logger.error("Error sending test notification", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to send test notification" });
  }
});

// PA Preferences defaults
const PA_PREF_DEFAULTS = {
  model: "auto",
  thinkingLevel: "balanced",
  temperature: 0.7,
  responseStyle: "balanced",
  tone: "friendly",
  autoReadResponses: false,
  webSearchEnabled: true,
  proactiveSuggestions: true,
  paDisplayName: "Personal Assistant",
  autoSendDMs: false,
};

// Available model options — update here when models change; frontend reads from API.
const MODEL_OPTIONS = [
  { value: "auto", label: "Auto", description: "Let OpenClaw choose the best model" },
  { value: "claude-sonnet", label: "Claude Sonnet 4.5", description: "Fast, balanced intelligence" },
  { value: "claude-opus", label: "Claude Opus 4.6", description: "Most capable, thorough" },
  { value: "gpt-5.2", label: "GPT-5.2", description: "OpenAI's flagship model" },
];

// Get PA preferences
userRoutes.get("/me/pa-preferences", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const prefs = { ...PA_PREF_DEFAULTS, ...(user[0].paPreferences || {}) };
    res.json({ data: prefs, meta: { modelOptions: MODEL_OPTIONS } });
  } catch (error) {
    logger.error("Error fetching PA preferences", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch PA preferences" });
  }
});

// Update PA preferences (selective merge)
userRoutes.patch("/me/pa-preferences", authenticate, validate({ body: schemas.updatePAPreferences }), async (req, res) => {
  try {
    const userId = req.user!.id;

    const currentUser = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (currentUser.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    // Merge existing prefs with new values
    const existingPrefs = currentUser[0].paPreferences || {};
    const newPrefs = { ...existingPrefs, ...req.body };

    await db
      .update(users)
      .set({ paPreferences: newPrefs, updatedAt: new Date() })
      .where(eq(users.id, userId));

    res.json({ data: { ...PA_PREF_DEFAULTS, ...newPrefs } });
  } catch (error) {
    logger.error("Error updating PA preferences", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to update PA preferences" });
  }
});

// Get user by ID
userRoutes.get("/:id", authenticate, validate({ params: schemas.userIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;

    const user = await db.select().from(users).where(eq(users.id, id)).limit(1);

    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    res.json(sanitizeUser(user[0] as unknown as Record<string, unknown>));
  } catch (error) {
    logger.error("Error fetching user", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch user" });
  }
});

// Get team details
userRoutes.get("/teams/:id", authenticate, validate({ params: schemas.teamIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;

    const team = await db.select().from(teams).where(eq(teams.id, id)).limit(1);

    if (team.length === 0) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.json(team[0]);
  } catch (error) {
    logger.error("Error fetching team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch team" });
  }
});

// Get team members (uses user_teams junction table)
userRoutes.get("/teams/:id/members", authenticate, validate({ params: schemas.teamIdParam }), async (req, res) => {
  try {
    const id = req.params.id as string;

    const team = await db.select().from(teams).where(eq(teams.id, id)).limit(1);

    if (team.length === 0) {
      return res.status(404).json({ error: "Team not found" });
    }

    const memberRows = await db
      .select({
        user: users,
        role: userTeams.role,
        joinedAt: userTeams.joinedAt,
      })
      .from(userTeams)
      .innerJoin(users, eq(userTeams.userId, users.id))
      .where(eq(userTeams.teamId, id));

    res.json(memberRows.map((row) => ({
      ...sanitizeUser(row.user as unknown as Record<string, unknown>),
      teamRole: row.role,
      joinedAt: row.joinedAt?.toISOString() || null,
    })));
  } catch (error) {
    logger.error("Error fetching team members", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch team members" });
  }
});

// Update team member role (admin-only)
userRoutes.patch("/teams/:id/members/:userId/role", authenticate, requireRole("admin"), async (req: any, res) => {
  try {
    const teamId = req.params.id as string;
    const targetUserId = req.params.userId as string;
    const { role } = req.body;

    // Validate role
    if (!role || !["admin", "lead", "member"].includes(role)) {
      return res.status(400).json({
        error: { code: "INVALID_ROLE", message: "Role must be admin, lead, or member" },
      });
    }

    // Verify caller is admin of this team
    const callerMembership = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, req.user!.id), eq(userTeams.teamId, teamId)))
      .limit(1);
    if (!callerMembership.length || callerMembership[0].role !== "admin") {
      return res.status(403).json({
        error: { code: "NOT_TEAM_ADMIN", message: "Only team admins can change roles" },
      });
    }

    // Verify target is a member of this team
    const targetMembership = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, targetUserId), eq(userTeams.teamId, teamId)))
      .limit(1);
    if (!targetMembership.length) {
      return res.status(404).json({
        error: { code: "NOT_MEMBER", message: "User is not a member of this team" },
      });
    }

    // Can't demote self if only admin
    if (targetUserId === req.user!.id && role !== "admin") {
      const otherAdmins = await db
        .select()
        .from(userTeams)
        .where(and(eq(userTeams.teamId, teamId), eq(userTeams.role, "admin"), ne(userTeams.userId, req.user!.id)));
      if (otherAdmins.length === 0) {
        return res.status(400).json({
          error: { code: "LAST_ADMIN", message: "Cannot demote yourself as the only admin" },
        });
      }
    }

    // Update team role
    await db
      .update(userTeams)
      .set({ role })
      .where(and(eq(userTeams.userId, targetUserId), eq(userTeams.teamId, teamId)));

    // Sync global roles: promoting to admin grants global admin role,
    // demoting removes it (unless admin of another team)
    if (role === "admin") {
      try {
        await db.insert(userRoles).values({ userId: targetUserId, role: "admin" });
      } catch {
        // Already has admin role — ignore
      }
    } else {
      // Check if still admin on any other team
      const otherAdminTeams = await db
        .select()
        .from(userTeams)
        .where(and(eq(userTeams.userId, targetUserId), eq(userTeams.role, "admin")));
      if (otherAdminTeams.length === 0) {
        await db
          .delete(userRoles)
          .where(and(eq(userRoles.userId, targetUserId), eq(userRoles.role, "admin")));
      }
    }

    logger.info("Team member role updated", {
      callerId: req.user!.id,
      targetUserId,
      teamId,
      newRole: role,
    });

    res.json({ data: { userId: targetUserId, teamId, role } });
  } catch (error) {
    logger.error("Error updating team member role", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to update team member role" });
  }
});

// Create user (admin-only, authenticated)
userRoutes.post("/", authenticate, requireRole("admin"), strictRateLimit, validate({ body: schemas.createUser }), async (req, res) => {
  try {
    const { name, email, department, teamId, roles, skills } = req.body;

    const id = randomUUID();
    const newUser = {
      id,
      name,
      email,
      department,
      teamId,
      roles: roles || [],
      skills: skills || [],
      notificationPrefs: { urgentPush: true },
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    await db.insert(users).values(newUser);

    res.status(201).json(newUser);
  } catch (error) {
    logger.error("Error creating user", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to create user" });
  }
});

// Create team (admin-only, authenticated)
userRoutes.post("/teams", authenticate, requireRole("admin"), strictRateLimit, validate({ body: schemas.createTeam }), async (req, res) => {
  try {
    const { name, members, leads } = req.body;
    const creatorId = req.user!.id;

    const id = randomUUID();
    const memberSet = new Set<string>([...(members || []), ...(leads || []), creatorId]);
    const leadSet = new Set<string>([...(leads || []), creatorId]);

    const newTeam = {
      id,
      name,
      members: Array.from(memberSet),
      leads: Array.from(leadSet),
      createdAt: new Date(),
    };

    // Insert the team, set active teamId, and populate user_teams junction table.
    await db.transaction(async (tx) => {
      await tx.insert(teams).values(newTeam);
      await tx
        .update(users)
        .set({ teamId: id, updatedAt: new Date() })
        .where(inArray(users.id, newTeam.members));

      // Populate user_teams junction table
      const junctionRows = Array.from(memberSet).map((userId) => ({
        userId,
        teamId: id,
        role: userId === creatorId ? "admin" : leadSet.has(userId) ? "lead" : "member",
        joinedAt: new Date(),
      }));
      if (junctionRows.length > 0) {
        await tx.insert(userTeams).values(junctionRows);
      }
    });

    res.status(201).json(newTeam);
  } catch (error) {
    logger.error("Error creating team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to create team" });
  }
});

// Register a relay-created team in the backend (any authenticated user)
// Called by Canvas after creating a team on the relay, so the backend
// knows about the user's team membership for PA context / briefing / CRM scoping.
userRoutes.post("/me/register-team", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;
    const { teamId, teamName } = req.body;

    if (!teamId || !teamName) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "teamId and teamName are required" } });
    }

    await db.transaction(async (tx) => {
      // Create team if it doesn't exist
      const existing = await tx.select().from(teams).where(eq(teams.id, teamId)).limit(1);
      if (existing.length === 0) {
        await tx.insert(teams).values({
          id: teamId,
          name: teamName,
          members: [userId],
          leads: [userId],
          createdAt: new Date(),
        });
      }

      // Add to user_teams junction if not already a member
      const membership = await tx.select().from(userTeams)
        .where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, teamId)))
        .limit(1);
      if (membership.length === 0) {
        await tx.insert(userTeams).values({ userId, teamId, role: "admin", joinedAt: new Date() });
      }

      // Set as active team if user has none
      const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length > 0 && !user[0].teamId) {
        await tx.update(users).set({ teamId, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    });

    logger.info("Team registered from relay", { userId, teamId });
    res.json({ data: { teamId, synced: true } });
  } catch (error) {
    logger.error("Error registering team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to register team" });
  }
});

// Get current user's teams
userRoutes.get("/me/teams", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const memberships = await db
      .select({
        teamId: userTeams.teamId,
        role: userTeams.role,
        joinedAt: userTeams.joinedAt,
        teamName: teams.name,
      })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(eq(userTeams.userId, userId));

    // Get member counts per team
    const teamIds = memberships.map((m) => m.teamId);
    const memberCounts: Record<string, number> = {};
    if (teamIds.length > 0) {
      const counts = await db
        .select({ teamId: userTeams.teamId, count: sql<number>`count(*)` })
        .from(userTeams)
        .where(inArray(userTeams.teamId, teamIds))
        .groupBy(userTeams.teamId);
      for (const row of counts) {
        memberCounts[row.teamId] = row.count;
      }
    }

    const activeTeamId = user[0].teamId;

    res.json({
      data: memberships.map((m) => ({
        id: m.teamId,
        name: m.teamName,
        role: m.role,
        isActive: m.teamId === activeTeamId,
        memberCount: memberCounts[m.teamId] || 0,
        joinedAt: m.joinedAt?.toISOString() || null,
      })),
    });
  } catch (error) {
    logger.error("Error fetching user teams", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to fetch teams" });
  }
});

// Join a team
userRoutes.post("/teams/:id/join", authenticate, validate({ params: schemas.teamIdParam, body: schemas.joinTeam }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const teamId = req.params.id as string;
    const role = req.body.role || "member";

    // Verify team exists
    const team = await db.select().from(teams).where(eq(teams.id, teamId)).limit(1);
    if (team.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Team not found" } });
    }

    // Check max 5 teams
    const existingMemberships = await db
      .select()
      .from(userTeams)
      .where(eq(userTeams.userId, userId));
    if (existingMemberships.length >= 5) {
      return res.status(400).json({ error: { code: "MAX_TEAMS", message: "Cannot join more than 5 teams" } });
    }

    // Check not already a member
    const existing = existingMemberships.find((m) => m.teamId === teamId);
    if (existing) {
      return res.status(400).json({ error: { code: "ALREADY_MEMBER", message: "Already a member of this team" } });
    }

    await db.transaction(async (tx) => {
      await tx.insert(userTeams).values({ userId, teamId, role, joinedAt: new Date() });

      // If user has no active team, set this as active
      const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length > 0 && !user[0].teamId) {
        await tx.update(users).set({ teamId, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    });

    res.status(201).json({ data: { teamId, role, message: "Joined team successfully" } });
  } catch (error) {
    logger.error("Error joining team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to join team" });
  }
});

// Leave a team
userRoutes.delete("/teams/:id/leave", authenticate, validate({ params: schemas.teamIdParam }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const teamId = req.params.id as string;

    // Check membership exists
    const membership = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, teamId)))
      .limit(1);
    if (membership.length === 0) {
      return res.status(404).json({ error: { code: "NOT_MEMBER", message: "Not a member of this team" } });
    }

    // Cannot leave if only admin
    if (membership[0].role === "admin") {
      const otherAdmins = await db
        .select()
        .from(userTeams)
        .where(and(eq(userTeams.teamId, teamId), eq(userTeams.role, "admin"), ne(userTeams.userId, userId)));
      if (otherAdmins.length === 0) {
        return res.status(400).json({ error: { code: "LAST_ADMIN", message: "Cannot leave team as the only admin. Transfer admin role first." } });
      }
    }

    await db.transaction(async (tx) => {
      await tx.delete(userTeams).where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, teamId)));

      // If this was the active team, switch to next team or null
      const user = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (user.length > 0 && user[0].teamId === teamId) {
        const remaining = await tx.select().from(userTeams).where(eq(userTeams.userId, userId)).limit(1);
        const newActiveTeamId = remaining.length > 0 ? remaining[0].teamId : null;
        await tx.update(users).set({ teamId: newActiveTeamId, updatedAt: new Date() }).where(eq(users.id, userId));
      }
    });

    res.json({ data: { message: "Left team successfully" } });
  } catch (error) {
    logger.error("Error leaving team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to leave team" });
  }
});

// Switch active team
userRoutes.patch("/teams/:id/active", authenticate, validate({ params: schemas.teamIdParam }), async (req, res) => {
  try {
    const userId = req.user!.id;
    const teamId = req.params.id as string;

    // Verify membership
    const membership = await db
      .select()
      .from(userTeams)
      .where(and(eq(userTeams.userId, userId), eq(userTeams.teamId, teamId)))
      .limit(1);
    if (membership.length === 0) {
      return res.status(403).json({ error: { code: "NOT_MEMBER", message: "Not a member of this team" } });
    }

    await db.update(users).set({ teamId, updatedAt: new Date() }).where(eq(users.id, userId));

    res.json({ data: { activeTeamId: teamId, message: "Active team switched" } });
  } catch (error) {
    logger.error("Error switching active team", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: "Failed to switch active team" });
  }
});

/**
 * POST /api/users/sync-to-relay
 * Sync team users to tezit-relay as contacts.
 * Admin-only: reads team members from MyPA DB and registers them as
 * contacts on the local tezit-relay instance.
 */
userRoutes.post("/sync-to-relay", authenticate, requireRole("admin", "team_lead"), strictRateLimit, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    // Get the caller's active team
    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user[0]?.teamId) {
      return res.status(400).json({ error: { code: "NO_TEAM", message: "User is not assigned to a team" } });
    }

    // Get all team members
    const memberRows = await db
      .select({ user: users })
      .from(userTeams)
      .innerJoin(users, eq(userTeams.userId, users.id))
      .where(eq(userTeams.teamId, user[0].teamId));

    const relayBaseUrl = process.env.TEZIT_RELAY_URL || "http://localhost:3002";
    const relaySyncToken = process.env.TEZIT_RELAY_SYNC_TOKEN || process.env.RELAY_SYNC_TOKEN;
    if (!relaySyncToken) {
      return res.status(503).json({
        error: {
          code: "SYNC_NOT_CONFIGURED",
          message: "Relay sync token is not configured on the backend",
        },
      });
    }
    const results: Array<{ userId: string; name: string; success: boolean; error?: string }> = [];

    for (const row of memberRows) {
      const member = row.user;
      try {
        const response = await fetch(`${relayBaseUrl}/contacts/admin/upsert`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-relay-sync-token": relaySyncToken,
          },
          body: JSON.stringify({
            id: member.id,
            displayName: member.name,
            email: member.email,
          }),
        });

        if (response.ok) {
          results.push({ userId: member.id, name: member.name, success: true });
        } else {
          const errBody = await response.text().catch(() => "");
          results.push({ userId: member.id, name: member.name, success: false, error: `HTTP ${response.status}: ${errBody.slice(0, 200)}` });
        }
      } catch (error) {
        results.push({
          userId: member.id,
          name: member.name,
          success: false,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    logger.info("Contact sync completed", { total: results.length, successful: successCount });

    res.json({
      data: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
        results,
      },
    });
  } catch (error) {
    logger.error("Error syncing contacts to relay", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to sync contacts" } });
  }
});
