-- Multiple calendars per user (ARCHITECTURE.md §2).
--
-- 1. New `calendars` table (one row per connected calendar, url or file).
-- 2. Backfill one calendar per user that already has a calendar configured.
-- 3. Rebuild `calendar_blocks` to reference `calendars.id` instead of `users.id`.
-- 4. Rebuild `sync_jobs` to be per-calendar instead of per-user.
-- 5. Drop the legacy single-calendar columns from `users`.
--
-- Backfilled calendar ids are derived deterministically ('cal_' || user_id) so the
-- existing blocks and sync rows can be linked to them. New calendars created by the
-- app use random UUIDs, which never collide with this prefix.
CREATE TABLE `calendars` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`source` text NOT NULL,
	`url_enc` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `calendars` (`id`, `user_id`, `name`, `source`, `url_enc`, `created_at`)
SELECT 'cal_' || `id`, `id`, 'My calendar', COALESCE(`ics_source`, 'file'), `ics_url_enc`, `created_at`
FROM `users`
WHERE `ics_url_enc` IS NOT NULL OR `ics_source` IS NOT NULL;
--> statement-breakpoint
CREATE TABLE `calendar_blocks_new` (
	`id` text PRIMARY KEY NOT NULL,
	`calendar_id` text NOT NULL,
	`start_ts` text NOT NULL,
	`end_ts` text NOT NULL,
	`is_floating` integer DEFAULT false NOT NULL,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `calendar_blocks_new` (`id`, `calendar_id`, `start_ts`, `end_ts`, `is_floating`)
SELECT cb.`id`, 'cal_' || cb.`user_id`, cb.`start_ts`, cb.`end_ts`, cb.`is_floating`
FROM `calendar_blocks` cb
JOIN `calendars` c ON c.`id` = 'cal_' || cb.`user_id`;
--> statement-breakpoint
DROP TABLE `calendar_blocks`;
--> statement-breakpoint
ALTER TABLE `calendar_blocks_new` RENAME TO `calendar_blocks`;
--> statement-breakpoint
CREATE TABLE `sync_jobs_new` (
	`calendar_id` text PRIMARY KEY NOT NULL,
	`last_success_at` integer,
	`last_attempt_at` integer,
	`last_error` text,
	FOREIGN KEY (`calendar_id`) REFERENCES `calendars`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `sync_jobs_new` (`calendar_id`, `last_success_at`, `last_attempt_at`, `last_error`)
SELECT 'cal_' || sj.`user_id`, sj.`last_success_at`, sj.`last_attempt_at`, sj.`last_error`
FROM `sync_jobs` sj
JOIN `calendars` c ON c.`id` = 'cal_' || sj.`user_id`;
--> statement-breakpoint
DROP TABLE `sync_jobs`;
--> statement-breakpoint
ALTER TABLE `sync_jobs_new` RENAME TO `sync_jobs`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `ics_url_enc`;
--> statement-breakpoint
ALTER TABLE `users` DROP COLUMN `ics_source`;
