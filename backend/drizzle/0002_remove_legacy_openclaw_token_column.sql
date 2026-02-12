-- Remove legacy openclaw_token column from team_settings.
-- This is a real data migration for deployments that already applied 0001.
-- It rebuilds the table without the token column and preserves existing rows.

PRAGMA foreign_keys=OFF;
--> statement-breakpoint
CREATE TABLE `__team_settings_new` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`openclaw_url` text DEFAULT 'http://localhost:18789',
	`openclaw_agent_template` text DEFAULT 'default',
	`openclaw_team_context` text,
	`openclaw_enabled_tools` text DEFAULT '["search","calendar","tasks","email"]',
	`openai_api_key` text,
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
	`openai_api_key`,
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
	`openai_api_key`,
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
