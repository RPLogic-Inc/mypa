CREATE TABLE `card_context` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`user_name` text NOT NULL,
	`original_type` text NOT NULL,
	`original_raw_text` text NOT NULL,
	`original_audio_url` text,
	`original_audio_duration` integer,
	`assistant_data` text,
	`captured_at` integer NOT NULL,
	`device_info` text,
	`display_bullets` text,
	`display_generated_at` integer,
	`display_model_used` text,
	`created_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_context_card_idx` ON `card_context` (`card_id`);--> statement-breakpoint
CREATE INDEX `card_context_captured_at_idx` ON `card_context` (`captured_at`);--> statement-breakpoint
CREATE INDEX `card_context_type_idx` ON `card_context` (`original_type`);--> statement-breakpoint
CREATE TABLE `card_recipients` (
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`added_at` integer,
	PRIMARY KEY(`card_id`, `user_id`),
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `card_views` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`viewed_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `card_views_card_idx` ON `card_views` (`card_id`);--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`content` text NOT NULL,
	`summary` text,
	`audio_url` text,
	`source_type` text DEFAULT 'self' NOT NULL,
	`source_user_id` text,
	`source_ref` text,
	`from_user_id` text NOT NULL,
	`to_user_ids` text DEFAULT '[]',
	`visibility` text DEFAULT 'private' NOT NULL,
	`team_id` text,
	`status` text DEFAULT 'pending' NOT NULL,
	`due_date` integer,
	`snoozed_until` integer,
	`forked_from_id` text,
	`fork_type` text,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`source_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`from_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `cards_from_user_idx` ON `cards` (`from_user_id`);--> statement-breakpoint
CREATE INDEX `cards_status_idx` ON `cards` (`status`);--> statement-breakpoint
CREATE INDEX `cards_created_at_idx` ON `cards` (`created_at`);--> statement-breakpoint
CREATE INDEX `cards_source_type_idx` ON `cards` (`source_type`);--> statement-breakpoint
CREATE TABLE `mirror_audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`template` text NOT NULL,
	`destination` text NOT NULL,
	`recipient_hint` text,
	`char_count` integer NOT NULL,
	`deep_link_included` integer DEFAULT true,
	`created_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `mirror_audit_card_idx` ON `mirror_audit_log` (`card_id`);--> statement-breakpoint
CREATE INDEX `mirror_audit_user_idx` ON `mirror_audit_log` (`user_id`);--> statement-breakpoint
CREATE TABLE `reactions` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`emoji` text NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `reactions_card_idx` ON `reactions` (`card_id`);--> statement-breakpoint
CREATE TABLE `refresh_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`family_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`revoked_at` integer,
	`created_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `refresh_tokens_user_idx` ON `refresh_tokens` (`user_id`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_token_hash_idx` ON `refresh_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `refresh_tokens_family_idx` ON `refresh_tokens` (`family_id`);--> statement-breakpoint
CREATE TABLE `responses` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`content` text NOT NULL,
	`audio_url` text,
	`attachments` text DEFAULT '[]',
	`created_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `responses_card_idx` ON `responses` (`card_id`);--> statement-breakpoint
CREATE INDEX `responses_created_at_idx` ON `responses` (`created_at`);--> statement-breakpoint
CREATE TABLE `team_invites` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`team_id` text NOT NULL,
	`created_by_user_id` text NOT NULL,
	`email` text,
	`max_uses` integer DEFAULT 1,
	`used_count` integer DEFAULT 0,
	`expires_at` integer,
	`default_roles` text DEFAULT '[]',
	`default_skills` text DEFAULT '[]',
	`default_department` text,
	`default_notification_prefs` text,
	`openclaw_config` text,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `team_invites_code_unique` ON `team_invites` (`code`);--> statement-breakpoint
CREATE INDEX `team_invites_code_idx` ON `team_invites` (`code`);--> statement-breakpoint
CREATE INDEX `team_invites_team_idx` ON `team_invites` (`team_id`);--> statement-breakpoint
CREATE TABLE `team_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`team_id` text NOT NULL,
	`openclaw_url` text DEFAULT 'http://localhost:18789',
	`openclaw_token` text,
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
CREATE UNIQUE INDEX `team_settings_team_id_unique` ON `team_settings` (`team_id`);--> statement-breakpoint
CREATE TABLE `teams` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`members` text DEFAULT '[]',
	`leads` text DEFAULT '[]',
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `tez_citations` (
	`id` text PRIMARY KEY NOT NULL,
	`interrogation_id` text NOT NULL,
	`context_item_id` text NOT NULL,
	`location` text,
	`excerpt` text NOT NULL,
	`claim` text NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verification_details` text,
	`confidence` text DEFAULT 'medium' NOT NULL,
	`created_at` integer,
	FOREIGN KEY (`interrogation_id`) REFERENCES `tez_interrogations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tez_citations_interrogation_idx` ON `tez_citations` (`interrogation_id`);--> statement-breakpoint
CREATE INDEX `tez_citations_context_item_idx` ON `tez_citations` (`context_item_id`);--> statement-breakpoint
CREATE TABLE `tez_interrogations` (
	`id` text PRIMARY KEY NOT NULL,
	`card_id` text NOT NULL,
	`user_id` text NOT NULL,
	`session_id` text NOT NULL,
	`question` text NOT NULL,
	`answer` text NOT NULL,
	`classification` text NOT NULL,
	`confidence` text NOT NULL,
	`context_scope` text DEFAULT 'full' NOT NULL,
	`context_token_count` integer,
	`model_used` text,
	`response_time_ms` integer,
	`created_at` integer,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `tez_interrogations_card_idx` ON `tez_interrogations` (`card_id`);--> statement-breakpoint
CREATE INDEX `tez_interrogations_session_idx` ON `tez_interrogations` (`session_id`);--> statement-breakpoint
CREATE INDEX `tez_interrogations_user_idx` ON `tez_interrogations` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_onboarding` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`invite_id` text,
	`profile_completed` integer DEFAULT false,
	`notifications_configured` integer DEFAULT false,
	`assistant_created` integer DEFAULT false,
	`assistant_configured` integer DEFAULT false,
	`team_tour_completed` integer DEFAULT false,
	`openclaw_agent_status` text DEFAULT 'pending',
	`openclaw_agent_error` text,
	`started_at` integer,
	`completed_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invite_id`) REFERENCES `team_invites`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_onboarding_user_id_unique` ON `user_onboarding` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_roles` (
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	PRIMARY KEY(`user_id`, `role`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`mirror_warnings_enabled` integer DEFAULT true,
	`mirror_default_template` text DEFAULT 'surface',
	`mirror_append_deeplink` integer DEFAULT true,
	`created_at` integer,
	`updated_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_skills` (
	`user_id` text NOT NULL,
	`skill` text NOT NULL,
	PRIMARY KEY(`user_id`, `skill`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `user_teams` (
	`user_id` text NOT NULL,
	`team_id` text NOT NULL,
	`role` text DEFAULT 'member' NOT NULL,
	`joined_at` integer,
	PRIMARY KEY(`user_id`, `team_id`),
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `user_teams_user_idx` ON `user_teams` (`user_id`);--> statement-breakpoint
CREATE INDEX `user_teams_team_idx` ON `user_teams` (`team_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`password_hash` text,
	`avatar_url` text,
	`roles` text DEFAULT '[]',
	`skills` text DEFAULT '[]',
	`department` text NOT NULL,
	`team_id` text,
	`manager_id` text,
	`openclaw_agent_id` text,
	`notification_prefs` text,
	`pa_preferences` text,
	`created_at` integer,
	`updated_at` integer,
	`ai_consent_given` integer DEFAULT false,
	`ai_consent_date` integer,
	FOREIGN KEY (`team_id`) REFERENCES `teams`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);