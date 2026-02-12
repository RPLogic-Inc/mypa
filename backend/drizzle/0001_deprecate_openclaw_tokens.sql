-- Remove OpenClaw token storage from team_settings
-- Tokens should only be in server env (OPENCLAW_TOKEN), never in database
--
-- Context: The initial schema included openclaw_token in team_settings.
-- The Drizzle schema was updated to remove it, but the column and any
-- stored values persisted at rest. This migration wipes residual data
-- and drops the column entirely.
--
-- Requires SQLite 3.35.0+ (ALTER TABLE DROP COLUMN support)

-- 1. Null out any lingering token values
UPDATE team_settings SET openclaw_token = NULL WHERE openclaw_token IS NOT NULL;

-- 2. Drop the column from the table
ALTER TABLE team_settings DROP COLUMN openclaw_token;
