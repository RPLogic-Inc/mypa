import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";

// Users table
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash"), // Added for JWT auth (optional for existing users)
  avatarUrl: text("avatar_url"),
  // roles and skills now in junction tables, keeping JSON for backward compat during migration
  roles: text("roles", { mode: "json" }).$type<string[]>().default([]),
  skills: text("skills", { mode: "json" }).$type<string[]>().default([]),
  department: text("department").notNull(),
  teamId: text("team_id").references(() => teams.id),
  managerId: text("manager_id"),
  openclawAgentId: text("openclaw_agent_id"),
  notificationPrefs: text("notification_prefs", { mode: "json" }).$type<{
    urgentPush: boolean;
    digestTime?: string;
  }>(),
  paPreferences: text("pa_preferences", { mode: "json" }).$type<{
    model?: string;
    thinkingLevel?: string;
    temperature?: number;
    responseStyle?: string;
    tone?: string;
    ttsVoice?: string;
    autoReadResponses?: boolean;
    webSearchEnabled?: boolean;
    proactiveSuggestions?: boolean;
    paDisplayName?: string;
  }>(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  // AI consent for external API calls (OpenAI, etc.)
  aiConsentGiven: integer("ai_consent_given", { mode: "boolean" }).default(false),
  aiConsentDate: integer("ai_consent_date", { mode: "timestamp" }),
  // Email verification
  emailVerified: integer("email_verified", { mode: "boolean" }).default(false),
});

// Junction table: user_roles
export const userRoles = sqliteTable("user_roles", {
  userId: text("user_id").notNull().references(() => users.id),
  role: text("role").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.role] }),
}));

// Junction table: user_skills
export const userSkills = sqliteTable("user_skills", {
  userId: text("user_id").notNull().references(() => users.id),
  skill: text("skill").notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.skill] }),
}));

// Junction table: user_teams (multi-team membership)
export const userTeams = sqliteTable("user_teams", {
  userId: text("user_id").notNull().references(() => users.id),
  teamId: text("team_id").notNull().references(() => teams.id),
  role: text("role").notNull().default("member"), // "member" | "lead" | "admin"
  joinedAt: integer("joined_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  pk: primaryKey({ columns: [table.userId, table.teamId] }),
  userIdx: index("user_teams_user_idx").on(table.userId),
  teamIdx: index("user_teams_team_idx").on(table.teamId),
}));

// Teams table
export const teams = sqliteTable("teams", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  members: text("members", { mode: "json" }).$type<string[]>().default([]),
  leads: text("leads", { mode: "json" }).$type<string[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Team settings - stores integration configurations (admin-managed)
export const teamSettings = sqliteTable("team_settings", {
  id: text("id").primaryKey(),
  teamId: text("team_id").notNull().references(() => teams.id).unique(),

  // OpenClaw Configuration
  openclawUrl: text("openclaw_url").default("http://localhost:18789"),
  // DEPRECATED 2026-02-08: Token storage removed for security
  // OpenClaw tokens should ONLY be in server environment variables (OPENCLAW_TOKEN)
  // Never store bearer tokens in user-accessible database storage
  // openclawToken: text("openclaw_token"), // REMOVED - use OPENCLAW_TOKEN env var
  openclawAgentTemplate: text("openclaw_agent_template").default("default"),
  openclawTeamContext: text("openclaw_team_context"), // Team-specific context for all agents
  openclawEnabledTools: text("openclaw_enabled_tools", { mode: "json" }).$type<string[]>().default([
    "search", "calendar", "tasks", "email"
  ]),

  // AI model settings (operator-configurable via Settings UI, overrides env vars)
  aiModelAllowlist: text("ai_model_allowlist", { mode: "json" }).$type<string[]>(),
    // null = use env OPENCLAW_MODEL_ALLOWLIST or DEFAULT_ALLOWED_MODELS
  aiDefaultModel: text("ai_default_model"),
    // null = use env OPENCLAW_DEFAULT_MODEL or first allowed model
  aiMaxPromptChars: integer("ai_max_prompt_chars"),
    // null = use env OPENCLAW_MAX_PROMPT_CHARS or 50000

  // Notification Configuration
  ntfyServerUrl: text("ntfy_server_url").default("https://ntfy.sh"),
  ntfyDefaultTopic: text("ntfy_default_topic"),

  // Webhook Secrets (for inbound integrations)
  emailWebhookSecret: text("email_webhook_secret"),
  calendarWebhookSecret: text("calendar_webhook_secret"),

  // Feature Flags
  featuresEnabled: text("features_enabled", { mode: "json" }).$type<{
    voiceRecording: boolean;
    emailIngestion: boolean;
    calendarSync: boolean;
    paAssistant: boolean;
  }>().default({
    voiceRecording: true,
    emailIngestion: false,
    calendarSync: false,
    paAssistant: true,
  }),

  // Setup completion tracking
  setupCompleted: integer("setup_completed", { mode: "boolean" }).default(false),
  setupCompletedAt: integer("setup_completed_at", { mode: "timestamp" }),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
});

// Cards table (Tez message model)
export const cards = sqliteTable("cards", {
  id: text("id").primaryKey(),

  // Content
  content: text("content").notNull(),
  summary: text("summary"),
  audioUrl: text("audio_url"),

  // Source - where did this come from?
  sourceType: text("source_type").notNull().default("self"), // "self" | "bot" | "email" | "calendar"
  sourceUserId: text("source_user_id").references(() => users.id), // If from another user's bot
  sourceRef: text("source_ref"), // Email ID or Calendar Event ID

  // For backward compatibility and AI routing
  fromUserId: text("from_user_id").notNull().references(() => users.id),

  // Routing - who can see this?
  // toUserIds kept for backward compat during migration, use card_recipients junction table
  toUserIds: text("to_user_ids", { mode: "json" }).$type<string[]>().default([]),
  visibility: text("visibility").notNull().default("private"), // "private" | "team"

  // Team scoping - which team was this card sent within?
  teamId: text("team_id").references(() => teams.id),

  // Status
  status: text("status").notNull().default("pending"), // "pending" | "active" | "resolved"
  shareIntent: text("share_intent").notNull().default("note"), // "note" | "decision" | "handoff" | "question" | "update" | "escalation"
  proactiveHints: text("proactive_hints", { mode: "json" }).$type<string[]>().default([]),

  // Timing
  dueDate: integer("due_date", { mode: "timestamp" }),
  snoozedUntil: integer("snoozed_until", { mode: "timestamp" }),

  // Forking (Counter-Tez)
  forkedFromId: text("forked_from_id"),
  forkType: text("fork_type"), // "counter" | "extension" | "reframe" | "update"

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  // Indexes for common queries
  fromUserIdx: index("cards_from_user_idx").on(table.fromUserId),
  statusIdx: index("cards_status_idx").on(table.status),
  shareIntentIdx: index("cards_share_intent_idx").on(table.shareIntent),
  createdAtIdx: index("cards_created_at_idx").on(table.createdAt),
  sourceTypeIdx: index("cards_source_type_idx").on(table.sourceType),
}));

// Junction table: card_recipients (replaces toUserIds JSON array)
export const cardRecipients = sqliteTable("card_recipients", {
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  addedAt: integer("added_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  pk: primaryKey({ columns: [table.cardId, table.userId] }),
}));

// Card Context - Library of Context (PRESERVED FOREVER)
export const cardContext = sqliteTable("card_context", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  userName: text("user_name").notNull(),

  // ═══════════════════════════════════════════════════════════
  // ORIGINAL (immutable, never deleted or modified)
  // ═══════════════════════════════════════════════════════════
  originalType: text("original_type").notNull(), // "voice" | "text" | "assistant"
  originalRawText: text("original_raw_text").notNull(), // Full transcription or text
  originalAudioUrl: text("original_audio_url"), // Original audio file if voice
  originalAudioDuration: integer("original_audio_duration"), // Seconds

  // File-specific data (if originalType === "document")
  originalFileUrl: text("original_file_url"),
  originalFileName: text("original_file_name"),
  originalFileMimeType: text("original_file_mime_type"),
  originalFileSize: integer("original_file_size"),

  // Assistant-specific data (if originalType === "assistant")
  assistantData: text("assistant_data", { mode: "json" }).$type<{
    query: string;
    fullResponse: string;
    toolsUsed: string[];
    sources: Array<{ type: string; reference: string; title?: string }>;
    executionTimeMs: number;
  }>(),

  // Device/capture metadata
  capturedAt: integer("captured_at", { mode: "timestamp" }).notNull(),
  deviceInfo: text("device_info"),

  // ═══════════════════════════════════════════════════════════
  // DISPLAY (AI-generated, can be regenerated)
  // ═══════════════════════════════════════════════════════════
  displayBullets: text("display_bullets", { mode: "json" }).$type<string[]>(),
  displayGeneratedAt: integer("display_generated_at", { mode: "timestamp" }),
  displayModelUsed: text("display_model_used"),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("card_context_card_idx").on(table.cardId),
  capturedAtIdx: index("card_context_captured_at_idx").on(table.capturedAt),
  typeIdx: index("card_context_type_idx").on(table.originalType),
}));

// Card responses table
export const responses = sqliteTable("responses", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  content: text("content").notNull(),
  audioUrl: text("audio_url"),
  attachments: text("attachments", { mode: "json" }).$type<{
    id: string;
    type: "image" | "file" | "audio";
    url: string;
    name: string;
    size: number;
  }[]>().default([]),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("responses_card_idx").on(table.cardId),
  createdAtIdx: index("responses_created_at_idx").on(table.createdAt),
}));

// Card reactions table
export const reactions = sqliteTable("reactions", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  emoji: text("emoji").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("reactions_card_idx").on(table.cardId),
}));

// Card views table
export const cardViews = sqliteTable("card_views", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  viewedAt: integer("viewed_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("card_views_card_idx").on(table.cardId),
}));

// Team invites - for user onboarding
export const teamInvites = sqliteTable("team_invites", {
  id: text("id").primaryKey(),
  code: text("code").notNull().unique(), // 8-character invite code
  teamId: text("team_id").notNull().references(() => teams.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),

  // Invite configuration
  email: text("email"), // Optional: specific email this invite is for
  maxUses: integer("max_uses").default(1), // How many times can be used (null = unlimited)
  usedCount: integer("used_count").default(0),
  expiresAt: integer("expires_at", { mode: "timestamp" }), // null = never expires

  // Pre-configured onboarding settings (admin can set defaults)
  defaultRoles: text("default_roles", { mode: "json" }).$type<string[]>().default([]),
  defaultSkills: text("default_skills", { mode: "json" }).$type<string[]>().default([]),
  defaultDepartment: text("default_department"),
  defaultNotificationPrefs: text("default_notification_prefs", { mode: "json" }).$type<{
    urgentPush: boolean;
    digestTime?: string;
  }>(),

  // OpenClaw onboarding configuration
  openclawConfig: text("openclaw_config", { mode: "json" }).$type<{
    createAgent: boolean;           // Whether to auto-create OpenClaw agent
    agentTemplate?: string;         // Template to use for agent creation
    initialMemory?: string[];       // Initial memory/context to seed
    enabledTools?: string[];        // Which tools to enable for the agent
    teamContext?: string;           // Team-specific context to add to agent
  }>(),

  // Status
  status: text("status").notNull().default("active"), // "active" | "revoked" | "expired"

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
}, (table) => ({
  codeIdx: index("team_invites_code_idx").on(table.code),
  teamIdx: index("team_invites_team_idx").on(table.teamId),
}));

// User onboarding status - tracks completion of onboarding steps
export const userOnboarding = sqliteTable("user_onboarding", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id).unique(),
  inviteId: text("invite_id").references(() => teamInvites.id),

  // Onboarding steps completion
  profileCompleted: integer("profile_completed", { mode: "boolean" }).default(false),
  notificationsConfigured: integer("notifications_configured", { mode: "boolean" }).default(false),
  assistantCreated: integer("assistant_created", { mode: "boolean" }).default(false),
  assistantConfigured: integer("assistant_configured", { mode: "boolean" }).default(false),
  teamTourCompleted: integer("team_tour_completed", { mode: "boolean" }).default(false),

  // OpenClaw assistant details
  openclawAgentStatus: text("openclaw_agent_status").default("pending"), // "pending" | "creating" | "ready" | "failed"
  openclawAgentError: text("openclaw_agent_error"),

  // Timestamps
  startedAt: integer("started_at", { mode: "timestamp" })
    .$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// Tez Interrogation sessions
export const tezInterrogations = sqliteTable("tez_interrogations", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  sessionId: text("session_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  classification: text("classification").notNull(), // "grounded" | "inferred" | "partial" | "abstention"
  confidence: text("confidence").notNull(), // "high" | "medium" | "low"
  contextScope: text("context_scope").notNull().default("full"), // "full" | "focused" | "private"
  contextTokenCount: integer("context_token_count"),
  modelUsed: text("model_used"),
  responseTimeMs: integer("response_time_ms"),
  guestTokenId: text("guest_token_id"), // Share token ID when interrogation is from a guest
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("tez_interrogations_card_idx").on(table.cardId),
  sessionIdx: index("tez_interrogations_session_idx").on(table.sessionId),
  userIdx: index("tez_interrogations_user_idx").on(table.userId),
}));

// Tez Citations - verified references from interrogation responses
export const tezCitations = sqliteTable("tez_citations", {
  id: text("id").primaryKey(),
  interrogationId: text("interrogation_id").notNull().references(() => tezInterrogations.id),
  contextItemId: text("context_item_id").notNull(), // References card_context.id
  location: text("location"), // timestamp, page, line, section reference
  excerpt: text("excerpt").notNull(),
  claim: text("claim").notNull(), // The claim this citation supports
  verificationStatus: text("verification_status").notNull().default("pending"), // "verified" | "unverified" | "failed"
  verificationDetails: text("verification_details"),
  confidence: text("confidence").notNull().default("medium"), // "high" | "medium" | "low"
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  interrogationIdx: index("tez_citations_interrogation_idx").on(table.interrogationId),
  contextItemIdx: index("tez_citations_context_item_idx").on(table.contextItemId),
}));

// Refresh tokens - for token rotation and revocation
export const refreshTokens = sqliteTable("refresh_tokens", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull(), // SHA-256 hash of the refresh token
  familyId: text("family_id").notNull(), // Token family for rotation theft detection
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdx: index("refresh_tokens_user_idx").on(table.userId),
  tokenHashIdx: index("refresh_tokens_token_hash_idx").on(table.tokenHash),
  familyIdx: index("refresh_tokens_family_idx").on(table.familyId),
}));

// User mirror settings
export const userSettings = sqliteTable("user_settings", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id).unique(),
  mirrorWarningsEnabled: integer("mirror_warnings_enabled", { mode: "boolean" }).default(true),
  mirrorDefaultTemplate: text("mirror_default_template").default("surface"), // "teaser" | "surface" | "surface_facts"
  mirrorAppendDeeplink: integer("mirror_append_deeplink", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

// Mirror audit log — every external share is logged for transparency
export const mirrorAuditLog = sqliteTable("mirror_audit_log", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  userId: text("user_id").notNull().references(() => users.id),
  template: text("template").notNull(), // "teaser" | "surface" | "surface_facts"
  destination: text("destination").notNull(), // "sms" | "email" | "clipboard" | "other"
  recipientHint: text("recipient_hint"), // Optional: "mom", "group chat"
  charCount: integer("char_count").notNull(),
  deepLinkIncluded: integer("deep_link_included", { mode: "boolean" }).default(true),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("mirror_audit_card_idx").on(table.cardId),
  userIdx: index("mirror_audit_user_idx").on(table.userId),
}));

// Tez share tokens — scoped guest access to individual tezits via TIP
export const tezShareTokens = sqliteTable("tez_share_tokens", {
  id: text("id").primaryKey(),
  cardId: text("card_id").notNull().references(() => cards.id),
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label"), // "For Alice", "Email share", etc.
  contextScope: text("context_scope").notNull().default("surface"), // "surface" | "full" | "selected"
  contextItemIds: text("context_item_ids", { mode: "json" }).$type<string[]>().default([]),
  maxInterrogations: integer("max_interrogations"), // null = unlimited
  interrogationCount: integer("interrogation_count").notNull().default(0),
  expiresAt: integer("expires_at", { mode: "timestamp" }),
  revokedAt: integer("revoked_at", { mode: "timestamp" }),
  lastUsedAt: integer("last_used_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  tokenHashIdx: index("tez_share_tokens_hash_idx").on(table.tokenHash),
  cardIdx: index("tez_share_tokens_card_idx").on(table.cardId),
  createdByIdx: index("tez_share_tokens_created_by_idx").on(table.createdByUserId),
}));

// Tez audit events — immutable audit trail for key mutating actions.
export const tezAuditEvents = sqliteTable("tez_audit_events", {
  id: text("id").primaryKey(),
  cardId: text("card_id").references(() => cards.id),
  actorUserId: text("actor_user_id").notNull().references(() => users.id),
  action: text("action").notNull(), // share | edit | redact | export | import | respond | acknowledge | resolve | snooze | archive
  details: text("details", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  cardIdx: index("tez_audit_events_card_idx").on(table.cardId),
  actorIdx: index("tez_audit_events_actor_idx").on(table.actorUserId),
  actionIdx: index("tez_audit_events_action_idx").on(table.action),
  createdAtIdx: index("tez_audit_events_created_at_idx").on(table.createdAt),
}));

// Product events — metadata-only usage instrumentation for click-budget and utility metrics.
export const productEvents = sqliteTable("product_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  teamId: text("team_id").references(() => teams.id),
  cardId: text("card_id").references(() => cards.id),
  eventName: text("event_name").notNull(), // tez_shared | tez_opened | tez_replied | tez_interrogated | ...
  metadata: text("metadata", { mode: "json" }).$type<Record<string, unknown>>().default({}),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdx: index("product_events_user_idx").on(table.userId),
  teamIdx: index("product_events_team_idx").on(table.teamId),
  eventIdx: index("product_events_name_idx").on(table.eventName),
  createdAtIdx: index("product_events_created_at_idx").on(table.createdAt),
}));

// PA Invites (for inviting new users + auto-provisioning PAs)
export const paInvites = sqliteTable("pa_invites", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  email: text("email").notNull(),
  inviteToken: text("invite_token").notNull().unique(),
  invitedBy: text("invited_by").notNull().references(() => users.id),
  status: text("status").notNull().default("pending"), // pending | accepted | expired
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  acceptedAt: integer("accepted_at", { mode: "timestamp" }),
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  tokenIdx: index("pa_invites_token_idx").on(table.inviteToken),
  userIdx: index("pa_invites_user_idx").on(table.userId),
  statusIdx: index("pa_invites_status_idx").on(table.status),
}));

// Provisioning jobs — tracks team droplet provisioning
export const provisioningJobs = sqliteTable("provisioning_jobs", {
  id: text("id").primaryKey(),

  // Team config
  teamName: text("team_name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  adminEmail: text("admin_email").notNull(),

  // Droplet config
  dropletSize: text("droplet_size").notNull().default("s-2vcpu-4gb"),
  region: text("region").notNull().default("nyc3"),

  // Status tracking
  status: text("status").notNull().default("pending"),
  currentStep: text("current_step"),
  progress: integer("progress").default(0),

  // Results
  dropletId: text("droplet_id"),
  dropletIp: text("droplet_ip"),
  appUrl: text("app_url"),
  error: text("error"),
  log: text("log"),

  // Who triggered it
  createdByUserId: text("created_by_user_id").notNull().references(() => users.id),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  completedAt: integer("completed_at", { mode: "timestamp" }),
});

// Scheduled jobs — personal instance cron jobs (reminders, summaries, periodic queries)
export const scheduledJobs = sqliteTable("scheduled_jobs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),

  // Job definition
  name: text("name").notNull(),                    // Human-readable name: "Weekly team summary"
  schedule: text("schedule").notNull(),             // Cron expression: "0 16 * * 5"
  action: text("action").notNull(),                 // Action type: "reminder" | "cross-team-summary" | "check-inbox" | "custom"
  scope: text("scope").notNull().default("personal"),  // "personal" or a teamId
  payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().default({}),

  // State
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  lastRunAt: integer("last_run_at", { mode: "timestamp" }),
  lastRunResult: text("last_run_result"),           // "success" | "error" | null
  lastRunError: text("last_run_error"),
  nextRunAt: integer("next_run_at", { mode: "timestamp" }),
  runCount: integer("run_count").notNull().default(0),

  // Timestamps
  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  userIdx: index("scheduled_jobs_user_idx").on(table.userId),
  enabledIdx: index("scheduled_jobs_enabled_idx").on(table.enabled),
  nextRunIdx: index("scheduled_jobs_next_run_idx").on(table.nextRunAt),
}));

// Type exports
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Team = typeof teams.$inferSelect;
export type NewTeam = typeof teams.$inferInsert;
export type Tez = typeof cards.$inferSelect;
export type NewTez = typeof cards.$inferInsert;
/** @deprecated Use Tez instead */
export type Card = Tez;
/** @deprecated Use NewTez instead */
export type NewCard = NewTez;
export type Response = typeof responses.$inferSelect;
export type NewResponse = typeof responses.$inferInsert;
export type TezContext = typeof cardContext.$inferSelect;
export type NewTezContext = typeof cardContext.$inferInsert;
/** @deprecated Use TezContext instead */
export type CardContext = TezContext;
/** @deprecated Use NewTezContext instead */
export type NewCardContext = NewTezContext;
export type TezRecipient = typeof cardRecipients.$inferSelect;
export type NewTezRecipient = typeof cardRecipients.$inferInsert;
/** @deprecated Use TezRecipient instead */
export type CardRecipient = TezRecipient;
/** @deprecated Use NewTezRecipient instead */
export type NewCardRecipient = NewTezRecipient;
export type UserRole = typeof userRoles.$inferSelect;
export type NewUserRole = typeof userRoles.$inferInsert;
export type UserSkill = typeof userSkills.$inferSelect;
export type NewUserSkill = typeof userSkills.$inferInsert;
export type UserTeam = typeof userTeams.$inferSelect;
export type NewUserTeam = typeof userTeams.$inferInsert;
export type TeamInvite = typeof teamInvites.$inferSelect;
export type NewTeamInvite = typeof teamInvites.$inferInsert;
export type UserOnboarding = typeof userOnboarding.$inferSelect;
export type NewUserOnboarding = typeof userOnboarding.$inferInsert;
export type TeamSettings = typeof teamSettings.$inferSelect;
export type NewTeamSettings = typeof teamSettings.$inferInsert;
export type TezInterrogation = typeof tezInterrogations.$inferSelect;
export type NewTezInterrogation = typeof tezInterrogations.$inferInsert;
export type TezCitation = typeof tezCitations.$inferSelect;
export type NewTezCitation = typeof tezCitations.$inferInsert;
export type RefreshToken = typeof refreshTokens.$inferSelect;
export type NewRefreshToken = typeof refreshTokens.$inferInsert;
export type UserSettings = typeof userSettings.$inferSelect;
export type NewUserSettings = typeof userSettings.$inferInsert;
export type MirrorAuditLog = typeof mirrorAuditLog.$inferSelect;
export type NewMirrorAuditLog = typeof mirrorAuditLog.$inferInsert;
export type TezAuditEvent = typeof tezAuditEvents.$inferSelect;
export type NewTezAuditEvent = typeof tezAuditEvents.$inferInsert;
export type ProductEvent = typeof productEvents.$inferSelect;
export type NewProductEvent = typeof productEvents.$inferInsert;
export type TezShareToken = typeof tezShareTokens.$inferSelect;
export type NewTezShareToken = typeof tezShareTokens.$inferInsert;
export type PaInvite = typeof paInvites.$inferSelect;
export type NewPaInvite = typeof paInvites.$inferInsert;
export type ProvisioningJob = typeof provisioningJobs.$inferSelect;
export type NewProvisioningJob = typeof provisioningJobs.$inferInsert;
export type ScheduledJob = typeof scheduledJobs.$inferSelect;
export type NewScheduledJob = typeof scheduledJobs.$inferInsert;
