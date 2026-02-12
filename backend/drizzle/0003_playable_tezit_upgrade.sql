-- Playable sprint schema upgrades:
-- 1) Remove openai_api_key persistence from team_settings (env-only policy)
-- 2) Add share_intent + proactive_hints to cards
-- 3) Add immutable tez_audit_events + metadata-only product_events tables

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__team_settings_new` (
  `id` text PRIMARY KEY NOT NULL,
  `team_id` text NOT NULL,
  `openclaw_url` text DEFAULT 'http://localhost:18789',
  `openclaw_agent_template` text DEFAULT 'default',
  `openclaw_team_context` text,
  `openclaw_enabled_tools` text DEFAULT '["search","calendar","tasks","email"]',
  `ntfy_server_url` text DEFAULT 'https://ntfy.sh',
  `ntfy_default_topic` text,
  `email_webhook_secret` text,
  `calendar_webhook_secret` text,
  `features_enabled` text DEFAULT '{"voiceRecording":true,"emailIngestion":false,"calendarSync":false,"paAssistant":true}',
  `setup_completed` integer DEFAULT false,
  `setup_completed_at` integer,
  `created_at` integer,
  `updated_at` integer,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__team_settings_new` (
  `id`,
  `team_id`,
  `openclaw_url`,
  `openclaw_agent_template`,
  `openclaw_team_context`,
  `openclaw_enabled_tools`,
  `ntfy_server_url`,
  `ntfy_default_topic`,
  `email_webhook_secret`,
  `calendar_webhook_secret`,
  `features_enabled`,
  `setup_completed`,
  `setup_completed_at`,
  `created_at`,
  `updated_at`
)
SELECT
  `id`,
  `team_id`,
  `openclaw_url`,
  `openclaw_agent_template`,
  `openclaw_team_context`,
  `openclaw_enabled_tools`,
  `ntfy_server_url`,
  `ntfy_default_topic`,
  `email_webhook_secret`,
  `calendar_webhook_secret`,
  `features_enabled`,
  `setup_completed`,
  `setup_completed_at`,
  `created_at`,
  `updated_at`
FROM `team_settings`;
--> statement-breakpoint
DROP TABLE `team_settings`;
--> statement-breakpoint
ALTER TABLE `__team_settings_new` RENAME TO `team_settings`;
--> statement-breakpoint
CREATE UNIQUE INDEX `team_settings_team_id_unique` ON `team_settings` (`team_id`);
--> statement-breakpoint
PRAGMA foreign_keys=ON;

--> statement-breakpoint
ALTER TABLE `cards` ADD COLUMN `share_intent` text DEFAULT 'note' NOT NULL;
--> statement-breakpoint
ALTER TABLE `cards` ADD COLUMN `proactive_hints` text DEFAULT '[]';
--> statement-breakpoint
CREATE INDEX `cards_share_intent_idx` ON `cards` (`share_intent`);

--> statement-breakpoint
CREATE TABLE `tez_audit_events` (
  `id` text PRIMARY KEY NOT NULL,
  `card_id` text,
  `actor_user_id` text NOT NULL,
  `action` text NOT NULL,
  `details` text DEFAULT '{}',
  `created_at` integer,
  FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tez_audit_events_card_idx` ON `tez_audit_events` (`card_id`);
--> statement-breakpoint
CREATE INDEX `tez_audit_events_actor_idx` ON `tez_audit_events` (`actor_user_id`);
--> statement-breakpoint
CREATE INDEX `tez_audit_events_action_idx` ON `tez_audit_events` (`action`);
--> statement-breakpoint
CREATE INDEX `tez_audit_events_created_at_idx` ON `tez_audit_events` (`created_at`);

--> statement-breakpoint
CREATE TABLE `product_events` (
  `id` text PRIMARY KEY NOT NULL,
  `user_id` text NOT NULL,
  `team_id` text,
  `card_id` text,
  `event_name` text NOT NULL,
  `metadata` text DEFAULT '{}',
  `created_at` integer,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
  FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `product_events_user_idx` ON `product_events` (`user_id`);
--> statement-breakpoint
CREATE INDEX `product_events_team_idx` ON `product_events` (`team_id`);
--> statement-breakpoint
CREATE INDEX `product_events_name_idx` ON `product_events` (`event_name`);
--> statement-breakpoint
CREATE INDEX `product_events_created_at_idx` ON `product_events` (`created_at`);
