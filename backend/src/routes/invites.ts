import { Router, Request, Response } from "express";
import { db, users, paInvites } from "../db/index.js";
import { eq, and } from "drizzle-orm";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logger } from "../middleware/logging.js";
import { randomBytes } from "crypto";
import { hashPassword } from "../services/jwt.js";

const router = Router();

/**
 * POST /api/invites/send
 * Send an invite to a new user (creates account + sends invite email via PA)
 */
router.post("/send", authenticate, requireRole("admin", "team_lead"), async (req: Request, res: Response) => {
  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "email and name are required" },
    });
  }

  // Check if user already exists
  const existing = await db.query.users.findFirst({
    where: eq(users.email, email),
  });

  if (existing) {
    return res.status(409).json({
      error: { code: "USER_EXISTS", message: "User with this email already exists" },
    });
  }

  // Generate invite token (URL-safe, 32 bytes = 64 hex chars)
  const inviteToken = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  // Create user with pending status (no password yet)
  const userId = crypto.randomUUID();
  const now = new Date();

  await db.insert(users).values({
    id: userId,
    email,
    name,
    passwordHash: "", // Empty until they set password via invite
    department: "General",
    createdAt: now,
    updatedAt: now,
  });

  // Create invite record
  await db.insert(paInvites).values({
    id: crypto.randomUUID(),
    userId,
    inviteToken,
    email,
    invitedBy: req.user!.id,
    expiresAt,
    status: "pending",
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Invite created", { userId, email, invitedBy: req.user!.id });

  // Generate invite URL
  const appUrl = process.env.APP_URL || "http://localhost:5174";
  const inviteUrl = `${appUrl}/__openclaw__/canvas/?invite=${inviteToken}`;

  // Send invite email via PA Workspace (if configured)
  const paWorkspaceUrl = process.env.PA_WORKSPACE_API_URL;
  if (paWorkspaceUrl) {
    try {
      // Get inviter's PA email from PA Workspace
      const paResponse = await fetch(`${paWorkspaceUrl}/api/identity/by-user/${req.user!.id}`, {
        headers: { Authorization: req.headers.authorization || "" },
      });

      if (paResponse.ok) {
        const { data: paIdentity } = await paResponse.json();

        // Send email from inviter's PA
        const emailHtml = generateInviteEmail(name, req.user!.name, inviteUrl);

        await fetch(`${paWorkspaceUrl}/api/email/send`, {
          method: "POST",
          headers: {
            Authorization: req.headers.authorization || "",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            paEmail: paIdentity.paEmail,
            to: email,
            subject: `${req.user!.name} invited you to MyPA`,
            body: emailHtml,
          }),
        });

        logger.info("Invite email sent", { email, fromPa: paIdentity.paEmail });
      }
    } catch (error) {
      logger.error("Failed to send invite email", error as Error, { email });
      // Continue anyway - user can still use the invite link manually
    }
  }

  res.status(201).json({
    data: {
      userId,
      email,
      name,
      inviteUrl,
      expiresAt,
    },
  });
});

/**
 * GET /api/invites/:token
 * Get invite details (check if valid)
 */
router.get("/:token", async (req: Request, res: Response) => {
  const token = req.params.token as string;

  const invite = await db.query.paInvites.findFirst({
    where: eq(paInvites.inviteToken, token),
  });

  if (!invite) {
    return res.status(404).json({
      error: { code: "INVITE_NOT_FOUND", message: "Invalid invite token" },
    });
  }

  if (invite.status !== "pending") {
    return res.status(400).json({
      error: { code: "INVITE_USED", message: "This invite has already been used" },
    });
  }

  if (new Date() > new Date(invite.expiresAt)) {
    return res.status(400).json({
      error: { code: "INVITE_EXPIRED", message: "This invite has expired" },
    });
  }

  res.json({
    data: {
      email: invite.email,
      invitedBy: invite.invitedBy,
      expiresAt: invite.expiresAt,
    },
  });
});

/**
 * POST /api/invites/:token/accept
 * Accept invite and set password
 */
router.post("/:token/accept", async (req: Request, res: Response) => {
  const token = req.params.token as string;
  const { password } = req.body;

  if (!password || password.length < 8) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Password must be at least 8 characters" },
    });
  }

  const invite = await db.query.paInvites.findFirst({
    where: eq(paInvites.inviteToken, token),
  });

  if (!invite) {
    return res.status(404).json({
      error: { code: "INVITE_NOT_FOUND", message: "Invalid invite token" },
    });
  }

  if (invite.status !== "pending") {
    return res.status(400).json({
      error: { code: "INVITE_USED", message: "This invite has already been used" },
    });
  }

  if (new Date() > new Date(invite.expiresAt)) {
    return res.status(400).json({
      error: { code: "INVITE_EXPIRED", message: "This invite has expired" },
    });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Update user with password
  await db
    .update(users)
    .set({
      passwordHash,
      updatedAt: new Date(),
    })
    .where(eq(users.id, invite.userId));

  // Mark invite as accepted
  await db
    .update(paInvites)
    .set({
      status: "accepted",
      acceptedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(paInvites.inviteToken, token));

  logger.info("Invite accepted", { userId: invite.userId, email: invite.email });

  // Auto-provision PA for new user (if PA Workspace is configured)
  const paWorkspaceUrl = process.env.PA_WORKSPACE_API_URL;
  if (paWorkspaceUrl) {
    try {
      const user = await db.query.users.findFirst({
        where: eq(users.id, invite.userId),
      });

      if (user) {
        // Use the team the user just joined via invite, or DEFAULT_TEAM_ID env var.
        // Never fall back to a hardcoded UUID — skip provisioning if no team is known.
        const teamId = user.teamId || process.env.DEFAULT_TEAM_ID;

        if (!teamId) {
          logger.warn("Skipping PA auto-provision: no team available for new user", { userId: user.id });
        } else {
          const provisionResponse = await fetch(`${paWorkspaceUrl}/api/identity/provision`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${process.env.PA_WORKSPACE_SERVICE_TOKEN || ""}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: user.id,
              teamId,
              clientName: user.name,
              clientEmail: user.email,
            }),
          });

          if (provisionResponse.ok) {
            const { data: paIdentity } = await provisionResponse.json();
            logger.info("PA auto-provisioned for new user", {
              userId: user.id,
              paEmail: paIdentity.paEmail,
            });
          }
        }
      }
    } catch (error) {
      logger.error("Failed to auto-provision PA", error as Error, { userId: invite.userId });
      // Continue anyway - PA can be provisioned later
    }
  }

  res.json({
    data: {
      message: "Invite accepted successfully",
      userId: invite.userId,
      email: invite.email,
    },
  });
});

/**
 * Generate HTML email for invite
 */
function generateInviteEmail(inviteeName: string, inviterName: string, inviteUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to MyPA</title>
</head>
<body style="font-family: system-ui, -apple-system, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px 20px; text-align: center; border-radius: 8px 8px 0 0;">
    <h1 style="color: white; margin: 0; font-size: 28px;">💬 MyPA</h1>
  </div>

  <div style="background: white; padding: 40px 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <h2 style="margin-top: 0; color: #1f2937;">Hi ${escapeHtml(inviteeName)},</h2>

    <p style="font-size: 16px; color: #4b5563;">
      <strong>${escapeHtml(inviterName)}</strong> has invited you to join MyPA — your personal AI assistant platform.
    </p>

    <div style="background: #f9fafb; padding: 20px; border-radius: 6px; margin: 30px 0;">
      <p style="margin: 0 0 10px 0; font-size: 14px; color: #6b7280; font-weight: 600;">With MyPA, you get:</p>
      <ul style="margin: 0; padding-left: 20px; color: #374151;">
        <li style="margin: 8px 0;">🤖 Your own AI Personal Assistant</li>
        <li style="margin: 8px 0;">📧 Real Gmail account for your PA</li>
        <li style="margin: 8px 0;">💬 Tez messaging with full context preservation</li>
        <li style="margin: 8px 0;">📚 Library of Context for searchable history</li>
        <li style="margin: 8px 0;">🔗 CRM and calendar integration</li>
      </ul>
    </div>

    <div style="text-align: center; margin: 40px 0;">
      <a href="${inviteUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 14px 32px; text-decoration: none; border-radius: 6px; font-weight: 600; font-size: 16px;">
        Accept Invitation
      </a>
    </div>

    <p style="font-size: 14px; color: #6b7280; margin-top: 40px;">
      This invitation will expire in 7 days.
    </p>

    <p style="font-size: 12px; color: #9ca3af; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      If you didn't expect this invitation, you can safely ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const invitesRoutes = router;
