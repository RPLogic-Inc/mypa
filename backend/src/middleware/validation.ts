import { Request, Response, NextFunction } from "express";
import { z, ZodSchema, ZodError } from "zod";

// Backend commonly returns relative paths for uploaded media (e.g. "/uploads/<id>.webm").
// Accept either absolute http(s) URLs or same-origin relative paths.
const urlOrPath = z
  .string()
  .min(1)
  .max(2000)
  .refine((value) => value.startsWith("/") || value.startsWith("http://") || value.startsWith("https://"), {
    message: "Invalid URL",
  });

const CRM_PAYLOAD_MAX_DEPTH = 6;
const CRM_PAYLOAD_MAX_KEYS = 120;
const CRM_PAYLOAD_MAX_CHARS = 25000;

function collectPayloadStats(
  value: unknown,
  depth = 1,
): { maxDepth: number; keyCount: number } {
  if (!value || typeof value !== "object") {
    return { maxDepth: depth, keyCount: 0 };
  }

  if (Array.isArray(value)) {
    let maxDepth = depth;
    let keyCount = 0;
    for (const item of value) {
      const child = collectPayloadStats(item, depth + 1);
      maxDepth = Math.max(maxDepth, child.maxDepth);
      keyCount += child.keyCount;
    }
    return { maxDepth, keyCount };
  }

  const obj = value as Record<string, unknown>;
  let maxDepth = depth;
  let keyCount = Object.keys(obj).length;
  for (const nested of Object.values(obj)) {
    const child = collectPayloadStats(nested, depth + 1);
    maxDepth = Math.max(maxDepth, child.maxDepth);
    keyCount += child.keyCount;
  }
  return { maxDepth, keyCount };
}

/**
 * Validation middleware factory
 * Creates middleware that validates request body, query, and params against Zod schemas
 */
export function validate(schemas: {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) {
        req.body = await schemas.body.parseAsync(req.body);
      }
      if (schemas.query) {
        req.query = await schemas.query.parseAsync(req.query);
      }
      if (schemas.params) {
        req.params = await schemas.params.parseAsync(req.params);
      }
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        return res.status(400).json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request data",
            details: error.errors.map((e) => ({
              path: e.path.join("."),
              message: e.message,
            })),
          },
        });
      }
      next(error);
    }
  };
}

// Common validation schemas
export const schemas = {
  // Tez creation
  contextLayerSchema: z.object({
    type: z.enum(["assistant", "text"]),
    content: z.string().min(1).max(50000),
    query: z.string().max(10000).optional(),
  }),

  createPersonalCard: z.object({
    content: z.string().min(1, "Content is required").max(10000),
    summary: z.string().max(500).optional(),
    shareIntent: z.enum(["note", "decision", "handoff", "question", "update", "escalation"]).optional(),
    audioUrl: urlOrPath.optional(),
    dueDate: z.string().datetime().optional(),
    contextLayers: z.array(z.object({
      type: z.enum(["assistant", "text"]),
      content: z.string().min(1).max(50000),
      query: z.string().max(10000).optional(),
    })).max(20).optional(),
  }),

  createTeamCard: z.object({
    content: z.string().min(1, "Content is required").max(10000),
    summary: z.string().max(500).optional(),
    shareIntent: z.enum(["note", "decision", "handoff", "question", "update", "escalation"]).optional(),
    audioUrl: urlOrPath.optional(),
    recipients: z.array(z.string()).optional(),
    // Privacy-by-default: team-wide broadcast requires an explicit confirmation flag.
    // If `shareToTeam` is true, server will expand recipients to all teammates.
    shareToTeam: z.boolean().optional(),
    dueDate: z.string().datetime().optional(),
    // Multi-team scope: required when user belongs to multiple teams.
    // If omitted, server infers from single-team membership or returns AMBIGUOUS_TEAM_SCOPE.
    teamId: z.string().uuid().optional(),
    contextLayers: z.array(z.object({
      type: z.enum(["assistant", "text"]),
      content: z.string().min(1).max(50000),
      query: z.string().max(10000).optional(),
    })).max(20).optional(),
  }),

  // Tez status updates
  updateCard: z.object({
    status: z.enum(["pending", "active", "resolved"]).optional(),
    summary: z.string().max(500).optional(),
  }),

  // Snooze
  snoozeCard: z.object({
    until: z.string().datetime(),
  }),

  trackHintClick: z.object({
    hint: z.string().min(1).max(200),
  }),

  // Context
  addContext: z.object({
    type: z.enum(["voice", "text", "assistant"]),
    rawText: z.string().min(1).max(50000),
    audioUrl: urlOrPath.optional(),
    audioDuration: z.number().positive().optional(),
    assistantData: z.object({
      query: z.string(),
      fullResponse: z.string(),
      toolsUsed: z.array(z.string()),
      sources: z.array(z.object({
        type: z.string(),
        reference: z.string(),
        title: z.string().optional(),
      })),
      executionTimeMs: z.number(),
    }).optional(),
  }),

  // Response
  addResponse: z.object({
    content: z.string().min(1).max(10000),
    audioUrl: urlOrPath.optional(),
  }),

  // Reaction
  addReaction: z.object({
    emoji: z.string().min(1).max(50),
  }),

  // Query params
  feedQuery: z.object({
    status: z.string().optional(),
    sourceType: z.enum(["self", "bot", "email", "calendar"]).optional(),
    limit: z.coerce.number().positive().max(100).optional(),
    cursor: z.string().optional(),
  }),

  crmListQuery: z.object({
    q: z.string().max(500).optional(),
    limit: z.coerce.number().positive().max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
  }),

  librarySearchQuery: z.object({
    q: z.string().min(1).max(500),
    type: z.enum(["voice", "text", "assistant"]).optional(),
    from: z.string().datetime().optional(),
    to: z.string().datetime().optional(),
  }),

  // V2 Library search with pagination and more filters
  librarySearchQueryV2: z.object({
    q: z.string().min(1).max(500),
    type: z.enum(["voice", "text", "assistant"]).optional(),
    // Privacy: the library search endpoint always scopes to the authenticated user.
    // Keep accepting `from` for backwards compatibility, but the server ignores it.
    from: z.string().min(1).max(200).optional(),
    after: z.string().datetime().optional(),
    before: z.string().datetime().optional(),
    limit: z.coerce.number().positive().max(100).optional(),
    offset: z.coerce.number().min(0).optional(),
  }),

  // Path params
  cardIdParam: z.object({
    id: z.string().uuid(),
  }),

  crmEntityParam: z.object({
    entityType: z.enum(["person", "opportunity", "task"]),
    entityId: z.string().min(1).max(200),
  }),

  crmEntityIdParam: z.object({
    entityId: z.string().min(1).max(200),
  }),

  crmTezContext: z.object({
    entityType: z.enum(["person", "opportunity", "task"]),
    entityId: z.string().min(1).max(200),
  }),

  crmWriteBody: z.object({
    payload: z.record(z.unknown()).superRefine((value, ctx) => {
      if (Object.keys(value).length === 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "payload cannot be empty",
        });
        return;
      }

      const stats = collectPayloadStats(value);
      if (stats.maxDepth > CRM_PAYLOAD_MAX_DEPTH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `payload nesting exceeds max depth (${CRM_PAYLOAD_MAX_DEPTH})`,
        });
      }
      if (stats.keyCount > CRM_PAYLOAD_MAX_KEYS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `payload key count exceeds max (${CRM_PAYLOAD_MAX_KEYS})`,
        });
      }

      const serialized = JSON.stringify(value);
      if (serialized.length > CRM_PAYLOAD_MAX_CHARS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `payload size exceeds max (${CRM_PAYLOAD_MAX_CHARS} chars)`,
        });
      }
    }),
  }),

  crmWorkflowBody: z.object({
    entityType: z.enum(["person", "opportunity", "task"]),
    entityId: z.string().min(1).max(200),
    objective: z.string().min(1).max(1000),
    tez: z.object({
      teamId: z.string().uuid().optional(),
      recipients: z.array(z.string().uuid()).max(100).optional(),
      type: z.enum(["note", "decision", "handoff", "question", "update", "escalation"]).optional(),
      urgency: z.enum(["critical", "high", "normal", "low", "fyi"]).optional(),
      visibility: z.enum(["team", "dm", "private"]).optional(),
      surfaceText: z.string().max(5000).optional(),
    }).optional(),
    openclaw: z.object({
      enabled: z.boolean().optional(),
      model: z.string().max(120).optional(),
      temperature: z.number().min(0).max(2).optional(),
    }).optional(),
    googleWorkspace: z.object({
      enabled: z.boolean().optional(),
      paEmail: z.string().email().optional(),
      emailTo: z.string().email().optional(),
      emailSubject: z.string().max(300).optional(),
      emailBody: z.string().max(10000).optional(),
      sendEmail: z.boolean().optional(),
      logCalendar: z.boolean().optional(),
      calendarSummary: z.string().max(300).optional(),
      durationMs: z.number().int().positive().max(24 * 60 * 60 * 1000).optional(),
      dryRun: z.boolean().optional(),
    }).optional(),
  }),

  // User schemas
  updateUser: z.object({
    name: z.string().min(1).max(200).optional(),
    avatarUrl: z.string().url().optional(),
    notificationPrefs: z.object({
      urgentPush: z.boolean().optional(),
      digestTime: z.string().optional(),
    }).optional(),
  }),

  updateNotificationPrefs: z.object({
    urgentPush: z.boolean().optional(),
    digestTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, "Invalid time format (use HH:MM)").optional(),
  }),

  classifyMessage: z.object({
    content: z.string().min(1, "Content is required").max(10000),
    // Multi-team scope: scopes name matching to a specific team's members.
    teamId: z.string().uuid().optional(),
  }),

  updatePAPreferences: z.object({
    model: z.string().max(50).optional(),
    thinkingLevel: z.enum(["quick", "balanced", "thorough"]).optional(),
    temperature: z.number().min(0).max(1).optional(),
    responseStyle: z.enum(["concise", "balanced", "detailed"]).optional(),
    tone: z.enum(["professional", "friendly", "casual"]).optional(),
    ttsVoice: z.string().max(100).optional(),
    autoReadResponses: z.boolean().optional(),
    webSearchEnabled: z.boolean().optional(),
    proactiveSuggestions: z.boolean().optional(),
    autoSendDMs: z.boolean().optional(),
    paDisplayName: z.string().max(30).optional(),
  }),

  createUser: z.object({
    name: z.string().min(1).max(200),
    email: z.string().email(),
    department: z.string().min(1).max(100),
    teamId: z.string().uuid().optional(),
    roles: z.array(z.string()).optional(),
    skills: z.array(z.string()).optional(),
  }),

  createTeam: z.object({
    name: z.string().min(1).max(200),
    members: z.array(z.string().uuid()).optional(),
    leads: z.array(z.string().uuid()).optional(),
  }),

  userIdParam: z.object({
    id: z.string().uuid(),
  }),

  teamIdParam: z.object({
    id: z.string().uuid(),
  }),

  // Team membership
  joinTeam: z.object({
    role: z.enum(["member", "lead"]).optional(),
  }),

  switchActiveTeam: z.object({
    teamId: z.string().uuid(),
  }),

  // Audio schemas
  transcribeAudio: z.object({
    audioData: z.string().min(1, "Audio data is required"),
    mimeType: z.string().optional(),
  }),

  uploadAudio: z.object({
    audioData: z.string().min(1, "Audio data is required"),
    mimeType: z.string().optional(),
  }),

  uploadFile: z.object({
    fileData: z.string().min(1, "File data is required"),
    mimeType: z.string().min(1, "MIME type is required"),
    filename: z.string().max(255).optional(),
  }),

  provisionTeam: z.object({
    teamName: z.string().min(2).max(100),
    subdomain: z.string().min(3).max(20).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/),
    adminEmail: z.string().email(),
    adminPassword: z.string().min(8).max(128),
    dropletSize: z.enum(["s-1vcpu-2gb", "s-2vcpu-4gb", "s-4vcpu-8gb"]).optional(),
    region: z.enum(["nyc3", "sfo3", "lon1", "ams3"]).optional(),
  }),
};
