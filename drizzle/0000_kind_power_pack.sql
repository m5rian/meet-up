CREATE TABLE `calendar_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`start_ts` text NOT NULL,
	`end_ts` text NOT NULL,
	`is_floating` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`organizer_id` text NOT NULL,
	`title` text NOT NULL,
	`visibility` text NOT NULL,
	`tz_id` text NOT NULL,
	`date_range_start` text NOT NULL,
	`date_range_end` text NOT NULL,
	`time_window_start` text NOT NULL,
	`time_window_end` text NOT NULL,
	`slot_granularity_minutes` integer DEFAULT 15 NOT NULL,
	`finalized_start_ts` text,
	`finalized_end_ts` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`organizer_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_slug_unique` ON `events` (`slug`);--> statement-breakpoint
CREATE TABLE `manual_blocks` (
	`id` text PRIMARY KEY NOT NULL,
	`participant_id` text NOT NULL,
	`start_ts` text NOT NULL,
	`end_ts` text NOT NULL,
	`busy` integer NOT NULL,
	FOREIGN KEY (`participant_id`) REFERENCES `participants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `participants` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`user_id` text NOT NULL,
	`has_opened` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `participants_event_user_unique` ON `participants` (`event_id`,`user_id`);--> statement-breakpoint
CREATE TABLE `sync_jobs` (
	`user_id` text PRIMARY KEY NOT NULL,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`last_error` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`profile_picture` text,
	`ics_url_enc` text,
	`tz_id` text,
	`sleep_start` text,
	`sleep_end` text,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_username_unique` ON `users` (`username`);