/**
 * Team Settings Routes
 *
 * Admin-only routes for configuring team-wide integrations.
 * The PA can call these endpoints to help admins configure settings.
 */

import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { teams, teamSettings, users, userRoles, userSettings } from "../db/schema.js";
import { randomUUID } from "crypto";
import { authenticate, requireRole } from "../middleware/auth.js";
import { logger } from "../middleware/logging.js";
import { DEFAULT_NTFY_SERVER_URL, validateNtfyServerUrl } from "../services/urlSecurity.js";
import { getTwentyConnectionStatus, verifyTwentyConnection } from "../services/twentyClient.js";

const router = Router();

// Available models for operator selection in the AI Provider settings UI
function getAvailableModels() {
  return [
    { value: "claude-3-5-sonnet-20241022", label: "Claude 3.5 Sonnet", provider: "anthropic" },
    { value: "claude-3-5-haiku-20241022", label: "Claude 3.5 Haiku", provider: "anthropic" },
    { value: "claude-3-7-sonnet-20250219", label: "Claude 3.7 Sonnet", provider: "anthropic" },
    { value: "claude-sonnet-4-20250514", label: "Claude Sonnet 4", provider: "anthropic" },
    { value: "gpt-4o-mini", label: "GPT-4o Mini", provider: "openai" },
    { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", provider: "openai" },
  ];
}

// Validation schemas
const updateSettingsSchema = z.object({
  // OpenClaw
  // openclawUrl is now env-only to prevent token exfiltration via arbitrary admin-configured URLs.
  // openclawToken: REMOVED 2026-02-08 - tokens are env-only now
  openclawAgentTemplate: z.string().optional(),
  openclawTeamContext: z.string().optional(),
  openclawEnabledTools: z.array(z.string()).optional(),

  // AI model settings (admin-only, overrides env vars)
  aiModelAllowlist: z.array(z.string().min(1).max(120)).max(20).optional(),
  aiDefaultModel: z.string().min(1).max(120).optional(),
  aiMaxPromptChars: z.number().int().min(1000).max(500000).optional(),

  // Notifications
  ntfyServerUrl: z.string().url().optional(),
  ntfyDefaultTopic: z.string().optional(),

  // Webhooks
  emailWebhookSecret: z.string().optional(),
  calendarWebhookSecret: z.string().optional(),

  // Features
  featuresEnabled: z.object({
    voiceRecording: z.boolean().optional(),

    emailIngestion: z.boolean().optional(),
    calendarSync: z.boolean().optional(),
    paAssistant: z.boolean().optional(),
  }).optional(),
});

const mirrorSettingsSchema = z.object({
  mirrorWarningsEnabled: z.boolean().optional(),
  mirrorDefaultTemplate: z.enum(["teaser", "surface", "surface_facts"]).optional(),
  mirrorAppendDeeplink: z.boolean().optional(),
});

/**
 * GET /api/settings/team
 * Get team settings (admin only)
 */
router.get("/team", authenticate, requireRole("admin", "team_lead"), async (req: any, res) => {
  try {
    // Get user's team
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user?.teamId) {
      return res.status(400).json({
        error: { code: "NO_TEAM", message: "User is not part of a team" },
      });
    }

    // Get or create settings
    let settings = await db.query.teamSettings.findFirst({
      where: eq(teamSettings.teamId, user.teamId),
    });

    if (!settings) {
      // Create default settings
      const id = randomUUID();
      await db.insert(teamSettings).values({
        id,
        teamId: user.teamId,
      });
      settings = await db.query.teamSettings.findFirst({
        where: eq(teamSettings.id, id),
      });
    }

    // Get team info
    const team = await db.query.teams.findFirst({
      where: eq(teams.id, user.teamId),
    });

    // Mask sensitive values
    const safeSettings = {
      teamId: settings!.teamId,
      teamName: team?.name,

      // OpenClaw (show configured status - env-only now)
      openclawConfigured: !!process.env.OPENCLAW_TOKEN, // Only check env, never DB
      openclawUrl: process.env.OPENCLAW_URL,
      openclawAgentTemplate: settings!.openclawAgentTemplate,
      openclawTeamContext: settings!.openclawTeamContext,
      openclawEnabledTools: settings!.openclawEnabledTools,

      // AI model settings (operator-configurable)
      aiModelAllowlist: settings!.aiModelAllowlist,
      aiDefaultModel: settings!.aiDefaultModel,
      aiMaxPromptChars: settings!.aiMaxPromptChars,
      availableModels: getAvailableModels(),

      // OpenAI (show configured status; env-only)
      openaiConfigured: !!process.env.OPENAI_API_KEY,

      // Twenty CRM (show configured status; env-only)
      twentyConfigured: !!process.env.TWENTY_API_URL && !!process.env.TWENTY_API_KEY,
      twentyApiUrl: process.env.TWENTY_API_URL,

      // Notifications
      ntfyServerUrl: settings!.ntfyServerUrl,
      ntfyDefaultTopic: settings!.ntfyDefaultTopic,

      // Webhooks (show configured status)
      emailWebhookConfigured: !!settings!.emailWebhookSecret,
      calendarWebhookConfigured: !!settings!.calendarWebhookSecret,

      // Features
      featuresEnabled: settings!.featuresEnabled,

      // Setup status
      setupCompleted: settings!.setupCompleted,
      setupCompletedAt: settings!.setupCompletedAt,
    };

    res.json({ data: safeSettings });
  } catch (error) {
    logger.error("Get team settings error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get team settings" },
    });
  }
});

/**
 * PATCH /api/settings/team
 * Update team settings (admin only)
 */
router.patch("/team", authenticate, requireRole("admin", "team_lead"), async (req: any, res) => {
  try {
    const parsed = updateSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: "Invalid settings", details: parsed.error.issues },
      });
    }

    // Get user's team
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user?.teamId) {
      return res.status(400).json({
        error: { code: "NO_TEAM", message: "User is not part of a team" },
      });
    }

    // Get or create settings
    let settings = await db.query.teamSettings.findFirst({
      where: eq(teamSettings.teamId, user.teamId),
    });

    if (!settings) {
      const id = randomUUID();
      await db.insert(teamSettings).values({
        id,
        teamId: user.teamId,
      });
      settings = await db.query.teamSettings.findFirst({
        where: eq(teamSettings.id, id),
      });
    }

    // Build update object (only include provided fields)
    const updates: Record<string, unknown> = {
      updatedAt: new Date(),
    };

    const data = parsed.data;

    // openclawUrl writes removed: Gateway URL is env-only for security.
    // openclawToken write removed - tokens are env-only now (OPENCLAW_TOKEN)
    if (data.openclawAgentTemplate !== undefined) updates.openclawAgentTemplate = data.openclawAgentTemplate;
    if (data.openclawTeamContext !== undefined) updates.openclawTeamContext = data.openclawTeamContext;
    if (data.openclawEnabledTools !== undefined) updates.openclawEnabledTools = data.openclawEnabledTools;

    // AI model settings (admin-configurable, overrides env vars)
    if (data.aiModelAllowlist !== undefined) updates.aiModelAllowlist = data.aiModelAllowlist;
    if (data.aiDefaultModel !== undefined) updates.aiDefaultModel = data.aiDefaultModel;
    if (data.aiMaxPromptChars !== undefined) updates.aiMaxPromptChars = data.aiMaxPromptChars;

    if (data.ntfyServerUrl !== undefined) {
      const ntfyValidation = validateNtfyServerUrl(data.ntfyServerUrl);
      if (!ntfyValidation.valid) {
        return res.status(400).json({
          error: {
            code: "INVALID_NTFY_SERVER_URL",
            message: ntfyValidation.message || "Invalid ntfy server URL",
          },
        });
      }
      updates.ntfyServerUrl = ntfyValidation.normalizedUrl;
    }
    if (data.ntfyDefaultTopic !== undefined) updates.ntfyDefaultTopic = data.ntfyDefaultTopic;

    if (data.emailWebhookSecret !== undefined) updates.emailWebhookSecret = data.emailWebhookSecret;
    if (data.calendarWebhookSecret !== undefined) updates.calendarWebhookSecret = data.calendarWebhookSecret;

    if (data.featuresEnabled !== undefined) {
      updates.featuresEnabled = {
        ...settings!.featuresEnabled,
        ...data.featuresEnabled,
      };
    }

    await db
      .update(teamSettings)
      .set(updates)
      .where(eq(teamSettings.teamId, user.teamId));

    res.json({ data: { updated: true } });
  } catch (error) {
    logger.error("Update team settings error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to update team settings" },
    });
  }
});

/**
 * POST /api/settings/team/complete-setup
 * Mark team setup as complete
 */
router.post("/team/complete-setup", authenticate, requireRole("admin", "team_lead"), async (req: any, res) => {
  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user?.teamId) {
      return res.status(400).json({
        error: { code: "NO_TEAM", message: "User is not part of a team" },
      });
    }

    await db
      .update(teamSettings)
      .set({
        setupCompleted: true,
        setupCompletedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(teamSettings.teamId, user.teamId));

    res.json({ data: { setupCompleted: true } });
  } catch (error) {
    logger.error("Complete setup error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to complete setup" },
    });
  }
});

/**
 * POST /api/settings/team/test-integration
 * Test an integration connection
 */
router.post("/team/test-integration", authenticate, requireRole("admin", "team_lead"), async (req: any, res) => {
  try {
    const { integration } = req.body;

    if (!integration || !["openclaw", "openai", "ntfy", "twenty"].includes(integration)) {
      return res.status(400).json({
        error: { code: "INVALID_INTEGRATION", message: "Specify integration: openclaw, openai, ntfy, or twenty" },
      });
    }

    const user = await db.query.users.findFirst({
      where: eq(users.id, req.user!.id),
    });

    if (!user?.teamId) {
      return res.status(400).json({
        error: { code: "NO_TEAM", message: "User is not part of a team" },
      });
    }

    const settings = await db.query.teamSettings.findFirst({
      where: eq(teamSettings.teamId, user.teamId),
    });

    let result: { success: boolean; message: string; details?: unknown };

    switch (integration) {
      case "openclaw":
        const openclawUrl = process.env.OPENCLAW_URL; // Env-only, never team-configurable
        const openclawToken = process.env.OPENCLAW_TOKEN; // Only env, never DB
        if (!openclawUrl || !openclawToken) {
          result = { success: false, message: "OpenClaw not configured (set OPENCLAW_TOKEN env var)" };
        } else {
          try {
            const response = await fetch(`${openclawUrl}/health`, {
              headers: { Authorization: `Bearer ${openclawToken}` },
            });
            if (response.ok) {
              result = { success: true, message: "OpenClaw connected" };
            } else {
              result = { success: false, message: `OpenClaw error: ${response.status}` };
            }
          } catch (e) {
            result = { success: false, message: "Failed to connect to OpenClaw" };
          }
        }
        break;

      case "openai":
        const openaiKey = process.env.OPENAI_API_KEY;
        if (!openaiKey) {
          result = { success: false, message: "OpenAI API key not configured" };
        } else {
          try {
            const response = await fetch("https://api.openai.com/v1/models", {
              headers: { Authorization: `Bearer ${openaiKey}` },
            });
            if (response.ok) {
              result = { success: true, message: "OpenAI API connected" };
            } else {
              result = { success: false, message: `OpenAI API error: ${response.status}` };
            }
          } catch (e) {
            result = { success: false, message: "Failed to connect to OpenAI" };
          }
        }
        break;

      case "ntfy":
        const ntfyValidation = validateNtfyServerUrl(settings?.ntfyServerUrl || DEFAULT_NTFY_SERVER_URL);
        if (!ntfyValidation.valid || !ntfyValidation.normalizedUrl) {
          result = {
            success: false,
            message: ntfyValidation.message || "Invalid ntfy server URL configuration",
          };
          break;
        }
        const ntfyServer = ntfyValidation.normalizedUrl;
        try {
          const timeoutController = new AbortController();
          const timeout = setTimeout(() => timeoutController.abort(), 5000);
          let response: Response;
          try {
            response = await fetch(`${ntfyServer}/v1/health`, { signal: timeoutController.signal });
          } finally {
            clearTimeout(timeout);
          }
          if (response.ok) {
            result = { success: true, message: "ntfy server reachable" };
          } else {
            result = { success: false, message: `ntfy server error: ${response.status}` };
          }
        } catch (e) {
          result = { success: false, message: "Failed to connect to ntfy server" };
        }
        break;

      case "twenty":
        const twentyStatus = getTwentyConnectionStatus();
        if (!twentyStatus.configured) {
          result = { success: false, message: twentyStatus.reason || "Twenty CRM not configured" };
          break;
        }
        const twentyCheck = await verifyTwentyConnection();
        result = {
          success: twentyCheck.success,
          message: twentyCheck.message,
        };
        break;

      default:
        result = { success: false, message: "Unknown integration" };
    }

    res.json({ data: result });
  } catch (error) {
    logger.error("Test integration error", error as Error);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to test integration" },
    });
  }
});

// ============= User Mirror Settings =============

/**
 * GET /api/settings/mirror
 * Get current user's mirror preferences.
 */
router.get("/mirror", authenticate, async (req: any, res) => {
  try {
    const userId = req.user!.id;
    const settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    res.json({
      data: {
        mirrorWarningsEnabled: settings?.mirrorWarningsEnabled ?? true,
        mirrorDefaultTemplate: settings?.mirrorDefaultTemplate ?? "surface",
        mirrorAppendDeeplink: settings?.mirrorAppendDeeplink ?? true,
      },
    });
  } catch (error) {
    logger.error("Get mirror settings error", error as Error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to get mirror settings" } });
  }
});

/**
 * PATCH /api/settings/mirror
 * Update current user's mirror preferences.
 */
router.patch("/mirror", authenticate, async (req: any, res) => {
  try {
    const userId = req.user!.id;

    const parsed = mirrorSettingsSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "Invalid settings", details: parsed.error.issues } });
    }

    // Upsert: get or create settings row
    let settings = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    if (!settings) {
      await db.insert(userSettings).values({
        id: randomUUID(),
        userId,
        ...parsed.data,
      });
    } else {
      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (parsed.data.mirrorWarningsEnabled !== undefined) updates.mirrorWarningsEnabled = parsed.data.mirrorWarningsEnabled;
      if (parsed.data.mirrorDefaultTemplate !== undefined) updates.mirrorDefaultTemplate = parsed.data.mirrorDefaultTemplate;
      if (parsed.data.mirrorAppendDeeplink !== undefined) updates.mirrorAppendDeeplink = parsed.data.mirrorAppendDeeplink;

      await db.update(userSettings).set(updates).where(eq(userSettings.userId, userId));
    }

    // Return updated settings
    const updated = await db.query.userSettings.findFirst({
      where: eq(userSettings.userId, userId),
    });

    res.json({
      data: {
        mirrorWarningsEnabled: updated?.mirrorWarningsEnabled ?? true,
        mirrorDefaultTemplate: updated?.mirrorDefaultTemplate ?? "surface",
        mirrorAppendDeeplink: updated?.mirrorAppendDeeplink ?? true,
      },
    });
  } catch (error) {
    logger.error("Update mirror settings error", error as Error);
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update mirror settings" } });
  }
});

export default router;
