import { Router } from "express";
import { authenticate, aiRateLimit, logger } from "../middleware/index.js";
import { z } from "zod";
import { createHash } from "crypto";
import { eq } from "drizzle-orm";
import { db, users, teamSettings } from "../db/index.js";

export const openclawProxyRoutes = Router();

// All routes require authentication
openclawProxyRoutes.use(authenticate);
openclawProxyRoutes.use(aiRateLimit); // Strict rate limit for AI calls

const DEFAULT_ALLOWED_MODELS = [
  "claude-3-5-sonnet-20241022",
  "claude-3-5-haiku-20241022",
  "claude-3-7-sonnet-20250219",
  "claude-sonnet-4-20250514",
  "gpt-4o-mini",
  "gpt-4.1-mini",
];

function hashRoutingValue(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

function buildFallbackAgentId(userId: string): string {
  return `mypa-user-${hashRoutingValue(`agent:${userId}`).slice(0, 24)}`;
}

function buildSessionKey(userId: string): string {
  const salt = process.env.OPENCLAW_SESSION_SALT || process.env.JWT_SECRET || "mypa-openclaw-session-v1";
  return `sess-${hashRoutingValue(`${salt}:${userId}`).slice(0, 32)}`;
}

async function resolveRouting(userId: string): Promise<{ agentId: string; sessionKey: string }> {
  const sessionKey = buildSessionKey(userId);

  try {
    const rows = await db
      .select({ openclawAgentId: users.openclawAgentId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);

    const dbAgent = rows[0]?.openclawAgentId?.trim();
    return {
      agentId: dbAgent && dbAgent.length > 0 ? dbAgent : buildFallbackAgentId(userId),
      sessionKey,
    };
  } catch (error) {
    logger.warn("OpenClaw routing lookup failed; using deterministic fallback", {
      userId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return {
      agentId: buildFallbackAgentId(userId),
      sessionKey,
    };
  }
}

function getMaxPromptChars(): number {
  const parsed = Number(process.env.OPENCLAW_MAX_PROMPT_CHARS || 50000);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 50000;
}

/**
 * Resolve AI settings from the user's team settings (DB), with env fallback.
 * Lets operators configure model allowlist, default model, and prompt limits via the UI.
 */
async function resolveTeamAISettings(userId: string): Promise<{
  allowedModels: string[];
  defaultModel: string;
  maxPromptChars: number;
}> {
  try {
    const userRow = await db
      .select({ teamId: users.teamId })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    const teamId = userRow[0]?.teamId;

    if (teamId) {
      const settings = await db
        .select({
          aiModelAllowlist: teamSettings.aiModelAllowlist,
          aiDefaultModel: teamSettings.aiDefaultModel,
          aiMaxPromptChars: teamSettings.aiMaxPromptChars,
        })
        .from(teamSettings)
        .where(eq(teamSettings.teamId, teamId))
        .limit(1);

      const s = settings[0];
      if (s) {
        const allowedModels =
          s.aiModelAllowlist && s.aiModelAllowlist.length > 0
            ? s.aiModelAllowlist
            : getAllowedModels();
        const defaultModel =
          s.aiDefaultModel || process.env.OPENCLAW_DEFAULT_MODEL || allowedModels[0];
        const maxPromptChars = s.aiMaxPromptChars || getMaxPromptChars();
        return { allowedModels, defaultModel, maxPromptChars };
      }
    }
  } catch (error) {
    logger.warn("Failed to load team AI settings, using env defaults", {
      userId,
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }

  // Fallback to env
  return {
    allowedModels: getAllowedModels(),
    defaultModel: process.env.OPENCLAW_DEFAULT_MODEL || getAllowedModels()[0],
    maxPromptChars: getMaxPromptChars(),
  };
}

const chatMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.union([
    z.string().min(1).max(20000),
    z.array(z.unknown()),
  ]),
  name: z.string().min(1).max(128).optional(),
  tool_call_id: z.string().min(1).max(128).optional(),
});

const chatCompletionsSchema = z.object({
  model: z.string().min(1).max(120).optional(),
  messages: z.array(chatMessageSchema).min(1).max(80),
  stream: z.boolean().optional().default(false),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  max_tokens: z.number().int().min(1).max(4096).optional(),
  tools: z.array(z.unknown()).max(16).optional(),
  tool_choice: z.union([z.string(), z.record(z.unknown())]).optional(),
});

function getAllowedModels(): string[] {
  const envList = process.env.OPENCLAW_MODEL_ALLOWLIST;
  if (!envList) return DEFAULT_ALLOWED_MODELS;
  return envList
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

function approximatePromptSize(messages: Array<{ content: string | unknown[] }>): number {
  return messages.reduce((sum, msg) => {
    if (typeof msg.content === "string") {
      return sum + msg.content.length;
    }
    if (Array.isArray(msg.content)) {
      // Only count text parts — image_url parts are large base64 but the gateway handles them
      return sum + msg.content.reduce((partSum: number, part: unknown) => {
        if (part && typeof part === "object" && "type" in part) {
          const p = part as { type: string; text?: string };
          if (p.type === "text" && p.text) return partSum + p.text.length;
        }
        return partSum;
      }, 0);
    }
    return sum;
  }, 0);
}

/**
 * POST /api/openclaw/chat/completions
 * Authenticated proxy to OpenClaw Gateway
 * - User sends JWT, never sees OPENCLAW_TOKEN
 * - Server proxies request with server token
 * - Supports streaming responses
 */
openclawProxyRoutes.post("/chat/completions", async (req, res) => {
  const openclawUrl = process.env.OPENCLAW_URL || "http://localhost:18789";
  const openclawToken = process.env.OPENCLAW_TOKEN;

  // Read model settings from team DB (operator-configurable) with env fallback
  const aiSettings = await resolveTeamAISettings(req.user!.id);
  const allowedModels = aiSettings.allowedModels;
  const defaultModel = aiSettings.defaultModel;
  const maxPromptChars = aiSettings.maxPromptChars;

  if (!openclawToken) {
    return res.status(503).json({
      error: {
        code: "OPENCLAW_UNAVAILABLE",
        message: "OpenClaw integration not configured",
      },
    });
  }

  const parsed = chatCompletionsSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid OpenClaw chat request",
        details: parsed.error.issues,
      },
    });
  }

  const promptChars = approximatePromptSize(parsed.data.messages);
  if (promptChars > maxPromptChars) {
    return res.status(413).json({
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: `Prompt too large. Max ${maxPromptChars} characters.`,
      },
    });
  }

  const requestedModel = parsed.data.model || defaultModel;
  if (!requestedModel || !allowedModels.includes(requestedModel)) {
    return res.status(400).json({
      error: {
        code: "INVALID_MODEL",
        message: `Model must be one of: ${allowedModels.join(", ")}`,
      },
    });
  }

  const routing = await resolveRouting(req.user!.id);

  const payload = {
    ...parsed.data,
    model: requestedModel,
    // Enforced by server: each user is pinned to their own OpenClaw agent + session.
    // Client-provided routing keys are ignored by schema parsing and replaced here.
    user: req.user!.id,
    agentId: routing.agentId,
    agent_id: routing.agentId,
    sessionId: routing.sessionKey,
    session_id: routing.sessionKey,
  };

  const abortController = new AbortController();
  const handleClientClose = () => {
    abortController.abort();
  };
  req.on("close", handleClientClose);

  try {
    // Per-user session isolation: pass user identity to OpenClaw Gateway
    const response = await fetch(`${openclawUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${openclawToken}`,
        "X-OpenClaw-User-Id": req.user!.id,
        "X-OpenClaw-User-Name": encodeURIComponent(req.user!.name || ""),
        "X-OpenClaw-Agent-Id": routing.agentId,
        "X-OpenClaw-Session-Key": routing.sessionKey,
        "X-OpenClaw-Session-Scope": "private",
      },
      body: JSON.stringify(payload),
      signal: abortController.signal,
    });

    // Proxy status code
    res.status(response.status);

    // Handle streaming responses
    if (payload.stream && response.body) {
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.flushHeaders?.();

      const reader = response.body.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (res.writableEnded) {
            abortController.abort();
            break;
          }
          res.write(value);
        }
      } catch (streamError) {
        if (!abortController.signal.aborted) {
          logger.warn("OpenClaw stream interrupted", {
            userId: req.user!.id,
            requestId: req.requestId,
            errorMessage: streamError instanceof Error ? streamError.message : String(streamError),
          });
        }
      } finally {
        req.off("close", handleClientClose);
        try {
          reader.releaseLock();
        } catch {
          // no-op
        }
        if (!res.writableEnded) res.end();
      }
      return;
    } else {
      // Non-streaming response
      const data = await response.json();
      res.json(data);
    }

    req.off("close", handleClientClose);
    logger.info("OpenClaw proxy request", {
      userId: req.user!.id,
      model: payload.model,
      stream: !!payload.stream,
      agentId: routing.agentId,
      sessionKeyPrefix: routing.sessionKey.slice(0, 12),
    });
  } catch (error) {
    req.off("close", handleClientClose);
    if (abortController.signal.aborted) {
      logger.info("OpenClaw proxy request aborted by client", {
        userId: req.user!.id,
        requestId: req.requestId,
      });
      return;
    }
    logger.error("OpenClaw proxy error", error as Error, {
      userId: req.user!.id,
    });
    res.status(502).json({
      error: {
        code: "GATEWAY_ERROR",
        message: "Failed to reach OpenClaw Gateway",
      },
    });
  }
});
