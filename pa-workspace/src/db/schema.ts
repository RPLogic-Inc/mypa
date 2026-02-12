import { sqliteTable, text, integer, index } from "drizzle-orm/sqlite-core";

/**
 * workspace_config — One row per team.
 * Stores Google Workspace credentials and setup status.
 */
export const workspaceConfig = sqliteTable("workspace_config", {
  teamId: text("team_id").primaryKey(),

  /** URL of the parent app backend API */
  appApiUrl: text("app_api_url").notNull(),

  /** Service-to-service auth token for calling the app backend */
  serviceToken: text("service_token"),

  /** Google Workspace domain for PA accounts (e.g. pa.company.com) */
  googleDomain: text("google_domain"),

  /** Encrypted service account JSON key (domain-wide delegation) */
  googleServiceAccountJson: text("google_service_account_json"),

  /** Super admin email for impersonation via domain-wide delegation */
  googleAdminEmail: text("google_admin_email"),

  /** Setup progress: pending → workspace_configured → ready */
  setupStatus: text("setup_status").notNull().default("pending"),

  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
});

/**
 * pa_identities — One row per user/PA.
 * Each PA is a real Google Workspace user account.
 */
export const paIdentities = sqliteTable("pa_identities", {
  /** Matches the user ID from the parent app */
  userId: text("user_id").primaryKey(),

  /** Team this PA belongs to */
  teamId: text("team_id").notNull().references(() => workspaceConfig.teamId),

  /** Real Google Workspace email (e.g. alice-pa@pa.company.com) */
  paEmail: text("pa_email").notNull().unique(),

  /** Google's internal user ID (from Admin SDK users.insert response) */
  googleUserId: text("google_user_id"),

  /** Google Voice phone number (provisioned via Workspace) */
  googleVoiceNumber: text("google_voice_number"),

  /** Display name for the PA (e.g. "Alice's PA") */
  displayName: text("display_name").notNull(),

  /** Client's real email (for reply-to headers) */
  clientEmail: text("client_email"),

  /** Client's name (from parent app) */
  clientName: text("client_name"),

  /** Provisioning status: pending → provisioning → active → suspended → deleted */
  provisionStatus: text("provision_status").notNull().default("pending"),

  createdAt: integer("created_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  teamIdx: index("pa_identities_team_idx").on(table.teamId),
  statusIdx: index("pa_identities_status_idx").on(table.provisionStatus),
}));

/**
 * pa_action_log — Append-only event log of PA actions.
 * Serves as the local backing store for the PA timesheet/calendar.
 */
export const paActionLog = sqliteTable("pa_action_log", {
  id: text("id").primaryKey(),

  /** PA email that performed the action */
  paEmail: text("pa_email").notNull(),

  /** Action type: card_created, email_read, email_sent, tez_received, calendar_checked, etc. */
  actionType: text("action_type").notNull(),

  /** Human-readable summary of the action */
  summary: text("summary").notNull(),

  /** When the action occurred */
  timestamp: integer("timestamp", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),

  /** Duration of the action in milliseconds (if applicable) */
  durationMs: integer("duration_ms"),

  /** Correlation: card ID from the parent app */
  cardId: text("card_id"),

  /** Correlation: Gmail message ID */
  emailMessageId: text("email_message_id"),

  /** Correlation: calendar event ID (from parent app) */
  calendarEventId: text("calendar_event_id"),

  /** Google Calendar event ID (from PA's calendar) */
  googleCalendarEventId: text("google_calendar_event_id"),

  /** Calendar sync status: pending → synced → failed */
  calendarSyncStatus: text("calendar_sync_status").default("pending"),
}, (table) => ({
  paEmailIdx: index("pa_action_log_pa_email_idx").on(table.paEmail),
  actionTypeIdx: index("pa_action_log_action_type_idx").on(table.actionType),
  timestampIdx: index("pa_action_log_timestamp_idx").on(table.timestamp),
}));

/**
 * email_log — Email processing tracking.
 * Records every email the PA inbox processes.
 */
export const emailLog = sqliteTable("email_log", {
  id: text("id").primaryKey(),

  /** PA email that received/sent this email */
  paEmail: text("pa_email").notNull(),

  /** Direction: inbound or outbound */
  direction: text("direction").notNull(),

  /** Sender email address */
  fromAddress: text("from_address").notNull(),

  /** Recipient email address */
  toAddress: text("to_address").notNull(),

  /** Email subject */
  subject: text("subject"),

  /** First ~200 chars of the email body */
  bodyPreview: text("body_preview"),

  /** Gmail message ID */
  gmailMessageId: text("gmail_message_id"),

  /** Whether this email contains Tezit Protocol content */
  isTezit: integer("is_tezit", { mode: "boolean" }).default(false),

  /** How the email was processed: card, tez_import, ignored */
  processedAs: text("processed_as"),

  /** Card ID created from this email (if any) */
  cardId: text("card_id"),

  /** Processing timestamp */
  processedAt: integer("processed_at", { mode: "timestamp" }).$defaultFn(() => new Date()),
}, (table) => ({
  paEmailIdx: index("email_log_pa_email_idx").on(table.paEmail),
  directionIdx: index("email_log_direction_idx").on(table.direction),
  isTezitIdx: index("email_log_is_tezit_idx").on(table.isTezit),
}));
