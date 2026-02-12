/**
 * Test setup — creates in-memory SQLite database with schema.
 * Each test file gets a fresh database.
 */

import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "../src/db/schema.js";

// SQL statements to create all tables (matches schema.ts)
const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS workspace_config (
    team_id TEXT PRIMARY KEY,
    app_api_url TEXT NOT NULL,
    service_token TEXT,
    google_domain TEXT,
    google_service_account_json TEXT,
    google_admin_email TEXT,
    setup_status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER,
    updated_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS pa_identities (
    user_id TEXT PRIMARY KEY,
    team_id TEXT NOT NULL REFERENCES workspace_config(team_id),
    pa_email TEXT NOT NULL UNIQUE,
    google_user_id TEXT,
    google_voice_number TEXT,
    display_name TEXT NOT NULL,
    client_email TEXT,
    client_name TEXT,
    provision_status TEXT NOT NULL DEFAULT 'pending',
    created_at INTEGER,
    updated_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS pa_identities_team_idx ON pa_identities(team_id);
  CREATE INDEX IF NOT EXISTS pa_identities_status_idx ON pa_identities(provision_status);

  CREATE TABLE IF NOT EXISTS pa_action_log (
    id TEXT PRIMARY KEY,
    pa_email TEXT NOT NULL,
    action_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    timestamp INTEGER NOT NULL,
    duration_ms INTEGER,
    card_id TEXT,
    email_message_id TEXT,
    calendar_event_id TEXT,
    google_calendar_event_id TEXT,
    calendar_sync_status TEXT DEFAULT 'pending'
  );
  CREATE INDEX IF NOT EXISTS pa_action_log_pa_email_idx ON pa_action_log(pa_email);
  CREATE INDEX IF NOT EXISTS pa_action_log_action_type_idx ON pa_action_log(action_type);
  CREATE INDEX IF NOT EXISTS pa_action_log_timestamp_idx ON pa_action_log(timestamp);

  CREATE TABLE IF NOT EXISTS email_log (
    id TEXT PRIMARY KEY,
    pa_email TEXT NOT NULL,
    direction TEXT NOT NULL,
    from_address TEXT NOT NULL,
    to_address TEXT NOT NULL,
    subject TEXT,
    body_preview TEXT,
    gmail_message_id TEXT,
    is_tezit INTEGER DEFAULT 0,
    processed_as TEXT,
    card_id TEXT,
    processed_at INTEGER
  );
  CREATE INDEX IF NOT EXISTS email_log_pa_email_idx ON email_log(pa_email);
  CREATE INDEX IF NOT EXISTS email_log_direction_idx ON email_log(direction);
  CREATE INDEX IF NOT EXISTS email_log_is_tezit_idx ON email_log(is_tezit);
`;

export function createTestDb() {
  const client = createClient({ url: ":memory:" });

  // Execute each statement separately (libsql doesn't support multi-statement)
  for (const stmt of CREATE_TABLES.split(";").filter((s) => s.trim())) {
    client.execute(stmt.trim());
  }

  return drizzle(client, { schema });
}
