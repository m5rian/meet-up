import { integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * Everything here is a computed/busy-free domain per ARCHITECTURE.md §2.
 * No raw calendar event detail (SUMMARY/DESCRIPTION/LOCATION) is ever persisted.
 * All absolute timestamps are stored as ISO 8601 UTC strings ('YYYY-MM-DDTHH:mm:ssZ').
 * Recurring daily time windows are stored as local wall-clock 'HH:mm:ss' and expanded
 * to UTC dynamically per date (see ARCHITECTURE.md §3.2).
 */

export const users = sqliteTable(
	'users',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		username: text('username').notNull().unique(),
		password_hash: text('password_hash').notNull(),
		profile_picture: text('profile_picture'), // base64 (or NULL). Always resized to 32×32 on upload.
		tz_id: text('tz_id'), // IANA time zone id, auto-detected from the browser.
		sleep_start: text('sleep_start'), // local wall-clock 'HH:mm:ss'
		sleep_end: text('sleep_end'), // local wall-clock 'HH:mm:ss'
		created_at: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('users_username_unique').on(table.username)]
);

export const events = sqliteTable('events', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	slug: text('slug').notNull().unique(),
	organizer_id: text('organizer_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	title: text('title').notNull(),
	visibility: text('visibility', { enum: ['private', 'link'] }).notNull(),
	tz_id: text('tz_id').notNull(), // organizer's IANA time zone id at creation; event's canonical timezone.
	date_range_start: text('date_range_start').notNull(), // 'YYYY-MM-DD'
	date_range_end: text('date_range_end').notNull(), // 'YYYY-MM-DD'
	time_window_start: text('time_window_start').notNull(), // local wall-clock 'HH:mm:ss'
	time_window_end: text('time_window_end').notNull(), // local wall-clock 'HH:mm:ss'
	slot_granularity_minutes: integer('slot_granularity_minutes').notNull().default(15),
	finalized_start_ts: text('finalized_start_ts'), // UTC ISO string
	finalized_end_ts: text('finalized_end_ts'), // UTC ISO string
	created_at: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

export const participants = sqliteTable(
	'participants',
	{
		id: text('id')
			.primaryKey()
			.$defaultFn(() => crypto.randomUUID()),
		event_id: text('event_id')
			.notNull()
			.references(() => events.id, { onDelete: 'cascade' }),
		user_id: text('user_id')
			.notNull()
			.references(() => users.id, { onDelete: 'cascade' }),
		has_opened: integer('has_opened', { mode: 'boolean' }).notNull().default(false),
		created_at: integer('created_at', { mode: 'timestamp_ms' })
			.notNull()
			.$defaultFn(() => new Date())
	},
	(table) => [uniqueIndex('participants_event_user_unique').on(table.event_id, table.user_id)]
);

export const calendars = sqliteTable('calendars', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	name: text('name').notNull(), // display name shown in the profile calendar list.
	source: text('source', { enum: ['url', 'file'] }).notNull(), // 'url' = live ICS URL (polled); 'file' = one-off upload (no polling).
	url_enc: text('url_enc'), // AES-GCM encrypted ICS URL (nonce prepended). Treated as a bearer secret. Null for file calendars.
	created_at: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** Busy intervals computed solely from calendar free/busy (never raw event details). Per calendar. */
export const calendarBlocks = sqliteTable('calendar_blocks', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	calendar_id: text('calendar_id')
		.notNull()
		.references(() => calendars.id, { onDelete: 'cascade' }),
	start_ts: text('start_ts').notNull(), // UTC ISO string, or wall-clock (floating) ISO string without offset.
	end_ts: text('end_ts').notNull(),
	is_floating: integer('is_floating', { mode: 'boolean' }).notNull().default(false)
});

/**
 * Per-event manual overrides. busy: 1 = actually busy, busy: 0 = actually free.
 * Manual overrides take precedence over calendar blocks / sleep schedule where they overlap.
 */
export const manualBlocks = sqliteTable('manual_blocks', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	participant_id: text('participant_id')
		.notNull()
		.references(() => participants.id, { onDelete: 'cascade' }),
	start_ts: text('start_ts').notNull(), // absolute UTC
	end_ts: text('end_ts').notNull(), // absolute UTC
	busy: integer('busy', { mode: 'boolean' }).notNull()
});

/** Cookie sessions. The raw token is stored in the cookie; only its hash is persisted. */
export const sessions = sqliteTable('sessions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	user_id: text('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }),
	token_hash: text('token_hash').notNull().unique(),
	expires_at: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
	created_at: integer('created_at', { mode: 'timestamp_ms' })
		.notNull()
		.$defaultFn(() => new Date())
});

/** One row per calendar: last sync attempt / last success / last error. */
export const syncJobs = sqliteTable('sync_jobs', {
	calendar_id: text('calendar_id')
		.primaryKey()
		.references(() => calendars.id, { onDelete: 'cascade' }),
	last_success_at: integer('last_success_at', { mode: 'timestamp_ms' }),
	last_attempt_at: integer('last_attempt_at', { mode: 'timestamp_ms' }),
	last_error: text('last_error')
});
