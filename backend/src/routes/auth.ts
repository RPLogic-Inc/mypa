/**
 * Authentication Routes
 * Handles user registration, login, and token refresh
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { registerUser, loginUser, refreshTokens, verifyToken, revokeRefreshToken, hashPassword, verifyPassword, generatePasswordResetToken, verifyPasswordResetToken, revokeAllUserTokens, generateEmailVerificationToken, verifyEmailVerificationToken } from "../services/jwt.js";
import { acceptInvite, validateInviteCode, createOnboardingRecord } from "../services/onboarding.js";
import { logger, authRateLimit, authenticate } from "../middleware/index.js";
import { db, users, userRoles, userSkills, userTeams, teams } from "../db/index.js";
import { sql, inArray } from "drizzle-orm";
import { registerRelayContact } from "../services/relayClient.js";
import { APP_NAME, INSTANCE_MODE } from "../config/app.js";

export const authRoutes = Router();

// Apply strict rate limiting only to sensitive auth endpoints (login/register/refresh).
// Do not apply it globally, since some endpoints (like /verify) may be called by
// server-side auth_request checks (nginx) and would otherwise be rate-limited
// as a single IP (127.0.0.1) behind the reverse proxy.

// Validation schemas
const registerSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(8, "Password must be at least 8 characters"),
  name: z.string().min(1, "Name is required").max(200),
  // Optional: frontend registration UI doesn't collect department yet.
  department: z.string().min(1, "Department is required").max(100).optional(),
  // Optional invite for team onboarding.
  inviteCode: z.string().min(1, "Invite code is required").max(50).optional(),
});

const loginSchema = z.object({
  email: z.string().email("Invalid email format"),
  password: z.string().min(1, "Password is required"),
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * POST /api/auth/register
 * Register a new user
 */
authRoutes.post("/register", authRateLimit, async (req, res) => {
  try {
    // Validate request body
    const parseResult = registerSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { email, password, name, department, inviteCode } = parseResult.data;

    // If an inviteCode is provided, validate it up front so we fail fast.
    let inviteDefaultDepartment: string | undefined;
    if (inviteCode) {
      const validation = await validateInviteCode(inviteCode, email.toLowerCase());
      if (!validation.valid) {
        return res.status(400).json({
          error: {
            code: "INVALID_INVITE",
            message: validation.error,
          },
        });
      }
      inviteDefaultDepartment = validation.invite.defaultDepartment || undefined;
    }

    // department is required in DB schema; if not provided, fall back to invite default or a sane default.
    const resolvedDepartment = department || inviteDefaultDepartment || "General";

    // Register user
    const result = await registerUser({ email, password, name, department: resolvedDepartment });

    if ("error" in result) {
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message: result.error,
        },
      });
    }

    logger.info("User registered", {
      requestId: req.requestId,
      userId: result.user.id,
      email: result.user.email,
    });

    // If an inviteCode is present, accept it to attach the user to a team and apply defaults.
    // acceptInvite also creates the onboarding record.
    if (inviteCode) {
      const accepted = await acceptInvite(inviteCode, result.user.id);
      if (!accepted.success) {
        return res.status(400).json({
          error: {
            code: "ACCEPT_INVITE_ERROR",
            message: accepted.error,
          },
        });
      }
    } else {
      // No invite — create a standalone onboarding record so Canvas can track setup progress.
      try {
        await createOnboardingRecord(result.user.id);
      } catch (err) {
        logger.warn("Failed to create onboarding record", { userId: result.user.id, error: err as Error });
      }
    }

    // Fire-and-forget: register as relay contact so Comms works immediately
    registerRelayContact({
      userId: result.user.id,
      displayName: name,
      email,
    }).catch(() => {}); // never block registration

    // Fire-and-forget: send email verification
    sendVerificationEmail(result.user.id, email.toLowerCase(), name).catch(() => {});

    // Re-load user from DB after invite acceptance to include updated fields (teamId, dept overrides, etc.).
    const userRow = await db.select().from(users).where(eq(users.id, result.user.id)).limit(1);
    if (userRow.length === 0) {
      return res.status(500).json({
        error: {
          code: "REGISTRATION_ERROR",
          message: "Failed to load user after registration",
        },
      });
    }

    const u = userRow[0];
    const rolesFromJson = typeof u.roles === "string" ? JSON.parse(u.roles) : (u.roles || []);
    const skillsFromJson = typeof u.skills === "string" ? JSON.parse(u.skills) : (u.skills || []);
    const [roleRows, skillRows] = await Promise.all([
      db.select().from(userRoles).where(eq(userRoles.userId, u.id)),
      db.select().from(userSkills).where(eq(userSkills.userId, u.id)),
    ]);
    const roles = Array.from(new Set([
      ...(Array.isArray(rolesFromJson) ? rolesFromJson : []),
      ...roleRows.map((r) => r.role),
    ]));
    const skills = Array.from(new Set([
      ...(Array.isArray(skillsFromJson) ? skillsFromJson : []),
      ...skillRows.map((s) => s.skill),
    ]));

    res.status(201).json({
      data: {
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          department: u.department,
          teamId: u.teamId || undefined,
          roles,
          skills,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    logger.error("Registration error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: {
        code: "REGISTRATION_ERROR",
        message: "Failed to register user",
      },
    });
  }
});

/**
 * POST /api/auth/login
 * Login with email and password
 */
authRoutes.post("/login", authRateLimit, async (req, res) => {
  try {
    // Validate request body
    const parseResult = loginSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { email, password } = parseResult.data;

    // Login user
    const result = await loginUser(email, password);

    if ("error" in result) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: result.error,
        },
      });
    }

    logger.info("User logged in", {
      requestId: req.requestId,
      userId: result.user.id,
    });

    const rolesFromJson = typeof result.user.roles === "string"
      ? JSON.parse(result.user.roles)
      : (result.user.roles || []);
    const skillsFromJson = typeof result.user.skills === "string"
      ? JSON.parse(result.user.skills)
      : (result.user.skills || []);

    const [roleRows, skillRows] = await Promise.all([
      db.select().from(userRoles).where(eq(userRoles.userId, result.user.id)),
      db.select().from(userSkills).where(eq(userSkills.userId, result.user.id)),
    ]);

    const roles = Array.from(new Set([
      ...(Array.isArray(rolesFromJson) ? rolesFromJson : []),
      ...roleRows.map((r) => r.role),
    ]));
    const skills = Array.from(new Set([
      ...(Array.isArray(skillsFromJson) ? skillsFromJson : []),
      ...skillRows.map((s) => s.skill),
    ]));

    res.json({
      data: {
        user: {
          id: result.user.id,
          email: result.user.email,
          name: result.user.name,
          department: result.user.department,
          teamId: result.user.teamId || undefined,
          roles,
          skills,
        },
        tokens: result.tokens,
      },
    });
  } catch (error) {
    logger.error("Login error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: {
        code: "LOGIN_ERROR",
        message: "Failed to login",
      },
    });
  }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
authRoutes.post("/refresh", authRateLimit, async (req, res) => {
  try {
    // Validate request body
    const parseResult = refreshSchema.safeParse(req.body);
    if (!parseResult.success) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid request data",
          details: parseResult.error.flatten().fieldErrors,
        },
      });
    }

    const { refreshToken } = parseResult.data;

    // Refresh tokens
    const result = await refreshTokens(refreshToken);

    if ("error" in result) {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: result.error,
        },
      });
    }

    res.json({
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn,
      },
    });
  } catch (error) {
    logger.error("Token refresh error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: {
        code: "REFRESH_ERROR",
        message: "Failed to refresh token",
      },
    });
  }
});

const logoutSchema = z.object({
  refreshToken: z.string().min(1, "Refresh token is required"),
});

/**
 * POST /api/auth/logout
 * Revoke the refresh token so it can't be reused
 */
authRoutes.post("/logout", async (req, res) => {
  try {
    const parseResult = logoutSchema.safeParse(req.body);
    if (!parseResult.success) {
      // Still allow logout without a token (client may have lost it)
      logger.info("User logged out (no token to revoke)", { requestId: req.requestId });
      return res.json({ success: true, message: "Logged out successfully" });
    }

    const { refreshToken } = parseResult.data;
    await revokeRefreshToken(refreshToken);

    logger.info("User logged out, refresh token revoked", { requestId: req.requestId });
    res.json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    logger.error("Logout error", error as Error, { requestId: req.requestId });
    // Still return success - client should discard tokens regardless
    res.json({ success: true, message: "Logged out successfully" });
  }
});

/**
 * POST /api/auth/change-password
 * Change password for authenticated user
 */
authRoutes.post("/change-password", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "No token provided" } });
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload || payload.type !== "access") {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } });
    }

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword || newPassword.length < 8) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "currentPassword required, newPassword must be at least 8 characters" },
      });
    }

    const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }

    const valid = user[0].passwordHash ? await verifyPassword(currentPassword, user[0].passwordHash) : false;
    if (!valid) {
      return res.status(401).json({ error: { code: "WRONG_PASSWORD", message: "Current password is incorrect" } });
    }

    const newHash = await hashPassword(newPassword);
    await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, payload.sub));

    logger.info("Password changed", { userId: payload.sub });
    res.json({ success: true, message: "Password changed successfully" });
  } catch (error) {
    logger.error("Change password error", error as Error, { requestId: req.requestId });
    res.status(500).json({ error: { code: "CHANGE_PASSWORD_ERROR", message: "Failed to change password" } });
  }
});

/**
 * POST /api/auth/forgot-password
 * Request a password reset. Always returns 200 to prevent email enumeration.
 */
authRoutes.post("/forgot-password", authRateLimit, async (req, res) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Email is required" },
      });
    }

    const user = await db
      .select()
      .from(users)
      .where(eq(users.email, email.toLowerCase().trim()))
      .limit(1);

    if (user.length > 0) {
      const resetToken = await generatePasswordResetToken({
        id: user[0].id,
        email: user[0].email,
      });

      const appUrl = process.env.APP_URL || "https://app.mypa.chat";
      const resetUrl = `${appUrl}?reset=${resetToken}`;

      logger.info("Password reset requested", { userId: user[0].id });

      // If PA Workspace is configured, send reset email
      const paWorkspaceUrl = process.env.PA_WORKSPACE_API_URL;
      if (paWorkspaceUrl) {
        try {
          await fetch(`${paWorkspaceUrl}/api/email/send`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.PA_WORKSPACE_SERVICE_TOKEN || ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              paEmail: process.env.SYSTEM_PA_EMAIL || `system@${process.env.BASE_DOMAIN || "localhost"}`,
              to: user[0].email,
              subject: `Reset your ${APP_NAME} password`,
              body: `<p>Hi ${user[0].name},</p><p>Click the link below to reset your password. This link expires in 1 hour.</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, you can ignore this email.</p>`,
            }),
          });
        } catch (emailErr) {
          logger.error("Failed to send reset email", emailErr as Error, { email });
        }
      } else {
        // No email service — log the reset URL for admin
        logger.warn("Password reset token generated but no email service configured", {
          userId: user[0].id,
          resetUrl,
        });
      }
    }

    // Always return 200 to prevent email enumeration
    res.json({ message: "If an account with that email exists, a reset link has been sent." });
  } catch (error) {
    logger.error("Forgot password error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "RESET_ERROR", message: "Failed to process password reset" },
    });
  }
});

/**
 * POST /api/auth/reset-password
 * Reset password using a reset token
 */
authRoutes.post("/reset-password", authRateLimit, async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword || typeof newPassword !== "string" || newPassword.length < 8) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Token and newPassword (min 8 chars) are required" },
      });
    }

    const verified = await verifyPasswordResetToken(token);
    if (!verified) {
      return res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Reset token is invalid or expired" },
      });
    }

    // Verify user still exists
    const user = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);
    if (user.length === 0) {
      return res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Reset token is invalid or expired" },
      });
    }

    // Update password
    const newHash = await hashPassword(newPassword);
    await db
      .update(users)
      .set({ passwordHash: newHash, updatedAt: new Date() })
      .where(eq(users.id, verified.userId));

    // Revoke all existing refresh tokens (force re-login everywhere)
    await revokeAllUserTokens(verified.userId);

    logger.info("Password reset completed", { userId: verified.userId });

    res.json({ message: "Password has been reset successfully. Please sign in with your new password." });
  } catch (error) {
    logger.error("Reset password error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "RESET_ERROR", message: "Failed to reset password" },
    });
  }
});

/**
 * GET /api/auth/verify
 * Verify if current token is valid
 */
authRoutes.get("/verify", async (req, res) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({
        error: {
          code: "NO_TOKEN",
          message: "No token provided",
        },
      });
    }

    const token = authHeader.slice(7);
    const payload = await verifyToken(token);

    if (!payload) {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN",
          message: "Token is invalid or expired",
        },
      });
    }

    if (payload.type !== "access") {
      return res.status(401).json({
        error: {
          code: "INVALID_TOKEN_TYPE",
          message: "Invalid token type",
        },
      });
    }

    // Fetch emailVerified from DB
    let emailVerified = false;
    try {
      const userRow = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
      if (userRow.length > 0) {
        emailVerified = userRow[0].emailVerified ?? false;
      }
    } catch {
      // Non-critical: default to false
    }

    res.json({
      valid: true,
      user: {
        id: payload.sub,
        email: payload.email,
        name: payload.name,
        emailVerified,
      },
    });
  } catch (error) {
    logger.error("Token verification error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: {
        code: "VERIFICATION_ERROR",
        message: "Failed to verify token",
      },
    });
  }
});

// ============= Email Verification =============

/**
 * Internal helper: generate verification token and send email.
 * Used by registration (fire-and-forget) and the resend endpoint.
 */
async function sendVerificationEmail(userId: string, email: string, name: string): Promise<void> {
  const verificationToken = await generateEmailVerificationToken({ id: userId, email });
  const appUrl = process.env.APP_URL || "https://app.mypa.chat";
  const verifyUrl = `${appUrl}?verify=${verificationToken}`;

  logger.info("Email verification token generated", { userId });

  const paWorkspaceUrl = process.env.PA_WORKSPACE_API_URL;
  if (paWorkspaceUrl) {
    try {
      await fetch(`${paWorkspaceUrl}/api/email/send`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.PA_WORKSPACE_SERVICE_TOKEN || ""}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          paEmail: process.env.SYSTEM_PA_EMAIL || `system@${process.env.BASE_DOMAIN || "localhost"}`,
          to: email,
          subject: `Verify your ${APP_NAME} email`,
          body: `<p>Hi ${name},</p><p>Please verify your email address by clicking the link below. This link expires in 24 hours.</p><p><a href="${verifyUrl}">${verifyUrl}</a></p><p>If you didn't create this account, you can ignore this email.</p>`,
        }),
      });
    } catch (emailErr) {
      logger.error("Failed to send verification email", emailErr as Error, { email });
    }
  } else {
    logger.warn("Email verification token generated but no email service configured", {
      userId,
      verifyUrl,
    });
  }
}

/**
 * POST /api/auth/verify-email/send
 * Resend email verification. Requires authentication. Always returns 200.
 */
authRoutes.post("/verify-email/send", authRateLimit, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: { code: "NO_TOKEN", message: "No token provided" } });
    }
    const token = authHeader.slice(7);
    const payload = await verifyToken(token);
    if (!payload || payload.type !== "access") {
      return res.status(401).json({ error: { code: "INVALID_TOKEN", message: "Token is invalid or expired" } });
    }

    // Look up user
    const user = await db.select().from(users).where(eq(users.id, payload.sub)).limit(1);
    if (user.length === 0) {
      // Don't reveal user not found — just return 200
      return res.json({ message: "If the account exists, a verification email has been sent." });
    }

    // Already verified — no-op
    if (user[0].emailVerified) {
      return res.json({ message: "Email is already verified." });
    }

    // Send verification email (fire-and-forget for speed, but await here since user explicitly requested)
    await sendVerificationEmail(user[0].id, user[0].email, user[0].name);

    res.json({ message: "Verification email sent. Check your inbox." });
  } catch (error) {
    logger.error("Send verification email error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "VERIFICATION_ERROR", message: "Failed to send verification email" },
    });
  }
});

/**
 * POST /api/auth/verify-email/confirm
 * Confirm email verification using a token. No auth required (clicked from email link).
 */
authRoutes.post("/verify-email/confirm", async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || typeof token !== "string") {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Token is required" },
      });
    }

    const verified = await verifyEmailVerificationToken(token);
    if (!verified) {
      return res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Verification token is invalid or expired" },
      });
    }

    // Verify user still exists and email matches
    const user = await db.select().from(users).where(eq(users.id, verified.userId)).limit(1);
    if (user.length === 0) {
      return res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Verification token is invalid or expired" },
      });
    }

    // Check email matches (prevents token reuse after email change)
    if (user[0].email !== verified.email) {
      return res.status(400).json({
        error: { code: "INVALID_TOKEN", message: "Verification token is invalid or expired" },
      });
    }

    // Already verified — idempotent success
    if (user[0].emailVerified) {
      return res.json({ message: "Email is already verified." });
    }

    // Mark as verified
    await db
      .update(users)
      .set({ emailVerified: true, updatedAt: new Date() })
      .where(eq(users.id, verified.userId));

    logger.info("Email verified", { userId: verified.userId });

    res.json({ message: "Email verified successfully." });
  } catch (error) {
    logger.error("Confirm email verification error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "VERIFICATION_ERROR", message: "Failed to verify email" },
    });
  }
});

// ============= Bootstrap (for external OpenClaw runtimes) =============

/**
 * GET /api/auth/bootstrap
 * Returns everything an external OpenClaw runtime needs on first contact:
 * user info, teams, capabilities, connected hubs, and endpoint URLs.
 *
 * SKILL CONTRACT: This endpoint is used by OpenClaw skills.
 * Changes to response structure are breaking changes.
 */
authRoutes.get("/bootstrap", authenticate, async (req, res) => {
  try {
    const userId = req.user!.id;

    const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (user.length === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "User not found" } });
    }
    const u = user[0];

    // Fetch all teams the user belongs to
    const allUserTeams = await db
      .select({ teamId: userTeams.teamId, role: userTeams.role, teamName: teams.name })
      .from(userTeams)
      .innerJoin(teams, eq(userTeams.teamId, teams.id))
      .where(eq(userTeams.userId, userId));

    // Get member counts for each team
    const allTeamIds = allUserTeams.map((t) => t.teamId);
    const teamMemberCounts: Record<string, number> = {};
    if (allTeamIds.length > 0) {
      const counts = await db
        .select({ teamId: userTeams.teamId, count: sql<number>`count(*)` })
        .from(userTeams)
        .where(inArray(userTeams.teamId, allTeamIds))
        .groupBy(userTeams.teamId);
      for (const row of counts) {
        teamMemberCounts[row.teamId] = row.count;
      }
    }

    // Capability detection from env vars
    const capabilities = {
      relay: !!process.env.RELAY_URL || !!process.env.RELAY_ENABLED,
      crm: !!process.env.TWENTY_API_URL && !!process.env.TWENTY_API_KEY,
      paWorkspace: !!process.env.PA_WORKSPACE_API_URL,
      federation: !!process.env.RELAY_URL,
      scheduler: INSTANCE_MODE === "personal",
    };

    // In personal mode, fetch connected hubs from relay
    let connectedHubs: Array<{ hubHost: string; teamId: string; teamName: string }> = [];
    if (INSTANCE_MODE === "personal" && process.env.RELAY_URL) {
      try {
        const relayResp = await fetch(`${process.env.RELAY_URL}/federation/my-hubs`, {
          headers: { Authorization: req.headers.authorization || "" },
        });
        if (relayResp.ok) {
          const hubData = await relayResp.json();
          connectedHubs = (hubData.data || hubData.hubs || []).map((h: any) => ({
            hubHost: h.hubHost,
            teamId: h.teamId,
            teamName: h.teamName || h.hubHost,
          }));
        }
      } catch {
        // Non-critical: relay may be unreachable
      }
    }

    // Build endpoint map
    const endpoints: Record<string, string | null> = {
      backend: process.env.APP_URL || process.env.API_URL || `https://api.mypa.chat`,
      relay: process.env.RELAY_URL || null,
      crossTeam: INSTANCE_MODE === "personal" ? (process.env.APP_URL || process.env.API_URL || `https://api.mypa.chat`) + "/api/cross-team" : null,
    };

    res.json({
      data: {
        user: {
          id: u.id,
          email: u.email,
          name: u.name,
          department: u.department,
          teamId: u.teamId || undefined,
        },
        teams: allUserTeams.map((t) => ({
          id: t.teamId,
          name: t.teamName,
          role: t.role,
          isActive: t.teamId === u.teamId,
          memberCount: teamMemberCounts[t.teamId] || 0,
        })),
        instanceMode: INSTANCE_MODE,
        capabilities,
        connectedHubs,
        endpoints,
      },
    });
  } catch (error) {
    logger.error("Bootstrap error", error as Error, { requestId: req.requestId });
    res.status(500).json({
      error: { code: "BOOTSTRAP_ERROR", message: "Failed to fetch bootstrap data" },
    });
  }
});
