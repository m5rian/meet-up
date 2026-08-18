/**
 * Calendar sync: fetch a live ICS URL or parse an uploaded .ics file, then
 * rebuild the busy blocks for a single calendar and record the outcome in
 * `sync_jobs` (ARCHITECTURE.md §2, §3.4; CORE.md §4, §5).
 *
 * Each user can connect any number of calendars (live URLs or one-off files).
 * A calendar's `calendar_blocks` are rebuilt on every successful poll/parse —
 * they always reflect the most recent version of that calendar, never merged
 * incrementally. The heatmap then merges all of a user's calendars together.
 * Only computed busy intervals are persisted; raw event details are discarded.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { calendarBlocks, calendars, syncJobs } from '../db/schema';
import { decryptSecret, encryptSecret } from '../crypto';
import { parseIcsToBlocks, defaultExpansionRange, type CalendarBlock } from './ics';
import type { Result } from '$lib/result';
import { err, ok } from '$lib/result';

export type IcsSource = 'url' | 'file';

export type SyncError =
	| 'no_source'
	| 'invalid_url'
	| 'not_https'
	| 'fetch_failed'
	| 'parse_failed'
	| 'no_events'
	| 'encryption_unavailable';

const FETCH_TIMEOUT_MS = 15_000;
const MAX_ICS_BYTES = 5 * 1024 * 1024; // 5 MB upload cap

/**
 * Validate a submitted ICS URL. Only https:// and webcal:// are accepted
 * (CORE.md §5). webcal:// is the scheme iCloud and CalDAV providers publish;
 * it is normalized to https:// so it can be fetched like any other URL.
 */
export function validateIcsUrl(raw: string): Result<string, SyncError> {
	const url = raw.trim();
	if (!url) return err('no_source');
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return err('invalid_url');
	}
	if (parsed.protocol !== 'https:' && parsed.protocol !== 'webcal:') return err('not_https');
	// webcal:// is a non-special scheme, so URL treats it as a relative path and
	// refuses to rewrite `.protocol`. Normalize by string substitution to https://
	// (iCloud/CalDAV publish the same resource over https).
	if (url.startsWith('webcal://')) return ok(`https://${url.slice('webcal://'.length)}`);
	return ok(url);
}

/**
 * Fetch and parse a live ICS URL into busy blocks. Returns a typed error for every
 * expected failure (network, timeout, malformed payload, no events) — never throws.
 */
export async function fetchIcsBlocks(url: string): Promise<Result<CalendarBlock[], SyncError>> {
	const { from, to } = defaultExpansionRange();
	let text: string;
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => {
			controller.abort();
		}, FETCH_TIMEOUT_MS);
		try {
			const res = await fetch(url, { signal: controller.signal });
			if (!res.ok) return err('fetch_failed');
			text = await res.text();
		} finally {
			clearTimeout(timeout);
		}
	} catch {
		return err('fetch_failed');
	}

	const parsed = parseIcsToBlocks(text, from, to);
	if (!parsed.ok) return err(parsed.error === 'no_events' ? 'no_events' : 'parse_failed');
	return ok(parsed.data);
}

/** Parse an uploaded .ics file into busy blocks. */
export function parseIcsFile(buffer: Buffer): Result<CalendarBlock[], SyncError> {
	if (buffer.length === 0) return err('no_source');
	if (buffer.length > MAX_ICS_BYTES) return err('parse_failed');
	const { from, to } = defaultExpansionRange();
	const parsed = parseIcsToBlocks(buffer.toString('utf8'), from, to);
	if (!parsed.ok) return err(parsed.error === 'no_events' ? 'no_events' : 'parse_failed');
	return ok(parsed.data);
}

/**
 * Persist a set of busy blocks for a calendar, replacing any previous blocks.
 * Returns a typed error when the blocks cannot be written.
 */
export function replaceCalendarBlocks(
	calendarId: string,
	blocks: CalendarBlock[]
): Result<void, SyncError> {
	try {
		db.delete(calendarBlocks).where(eq(calendarBlocks.calendar_id, calendarId)).run();
		for (const b of blocks) {
			db.insert(calendarBlocks)
				.values({
					calendar_id: calendarId,
					start_ts: b.start_ts,
					end_ts: b.end_ts,
					is_floating: b.floating
				})
				.run();
		}
		return ok(undefined);
	} catch {
		return err('parse_failed');
	}
}

/** Record a successful sync attempt in `sync_jobs`. */
export function recordSyncSuccess(calendarId: string): void {
	const now = new Date();
	db.insert(syncJobs)
		.values({
			calendar_id: calendarId,
			last_attempt_at: now,
			last_success_at: now,
			last_error: null
		})
		.onConflictDoUpdate({
			target: syncJobs.calendar_id,
			set: { last_attempt_at: now, last_success_at: now, last_error: null }
		})
		.run();
}

/** Record a failed sync attempt in `sync_jobs`. */
export function recordSyncFailure(calendarId: string, error: string): void {
	const now = new Date();
	db.insert(syncJobs)
		.values({ calendar_id: calendarId, last_attempt_at: now, last_error: error })
		.onConflictDoUpdate({
			target: syncJobs.calendar_id,
			set: { last_attempt_at: now, last_error: error }
		})
		.run();
}

/**
 * Run a sync for a single calendar: fetch its URL (or parse nothing for a file),
 * persist the blocks, and record the outcome. Returns a typed error on any
 * expected failure.
 */
export async function syncCalendar(calendarId: string): Promise<Result<void, SyncError>> {
	const row = db
		.select({ source: calendars.source, url_enc: calendars.url_enc })
		.from(calendars)
		.where(eq(calendars.id, calendarId))
		.get();
	if (!row) {
		recordSyncFailure(calendarId, 'Calendar no longer exists.');
		return err('no_source');
	}

	// A file calendar has no live URL to poll — nothing to sync.
	if (row.source === 'file') {
		recordSyncFailure(calendarId, 'File calendars are not polled.');
		return err('no_source');
	}

	if (!row.url_enc) {
		recordSyncFailure(calendarId, 'No ICS URL configured.');
		return err('no_source');
	}
	const url = decryptSecret(row.url_enc);
	if (!url) {
		recordSyncFailure(calendarId, 'Could not decrypt the ICS URL.');
		return err('encryption_unavailable');
	}

	const fetched = await fetchIcsBlocks(url);
	if (!fetched.ok) {
		recordSyncFailure(calendarId, syncErrorMessage(fetched.error));
		return err(fetched.error);
	}

	const written = replaceCalendarBlocks(calendarId, fetched.data);
	if (!written.ok) {
		recordSyncFailure(calendarId, 'Could not save calendar blocks.');
		return err(written.error);
	}

	recordSyncSuccess(calendarId);
	return ok(undefined);
}

/** Human-readable message for a sync error, for the "sync failed" UI. */
export function syncErrorMessage(error: SyncError): string {
	switch (error) {
		case 'no_source':
			return 'No calendar is connected.';
		case 'invalid_url':
			return 'That is not a valid URL.';
		case 'not_https':
			return 'Only https:// ICS URLs are accepted.';
		case 'fetch_failed':
			return 'Could not reach your calendar. Check the URL and try again.';
		case 'parse_failed':
			return 'The calendar could not be parsed.';
		case 'no_events':
			return 'No events found in the calendar.';
		case 'encryption_unavailable':
			return 'Encryption key is not configured.';
	}
}

/**
 * Create a new calendar for a user. For a URL calendar the URL is encrypted at
 * rest; for a file calendar the parsed blocks are written directly. A URL
 * calendar is immediately fetched (so the user gets instant feedback) unless the
 * optional `blocks` are provided. Returns the new calendar id.
 */
export function createCalendar(
	userId: string,
	name: string,
	source: IcsSource,
	url: string | null
): Result<string, SyncError> {
	let urlEnc: string | null = null;
	if (source === 'url') {
		if (!url) return err('no_source');
		const encrypted = encryptSecret(url);
		if (!encrypted) return err('encryption_unavailable');
		urlEnc = encrypted;
	}

	const inserted = db
		.insert(calendars)
		.values({
			user_id: userId,
			name: name || (source === 'url' ? 'Live calendar' : 'Uploaded calendar'),
			source,
			url_enc: urlEnc
		})
		.returning({ id: calendars.id })
		.get();

	return ok(inserted.id);
}

/** Load a user's calendars with their sync status. */
export function getCalendars(userId: string): Array<{
	id: string;
	name: string;
	source: IcsSource;
	url: string | null;
	last_success_at: Date | null;
	last_attempt_at: Date | null;
	last_error: string | null;
}> {
	const rows = db
		.select({
			id: calendars.id,
			name: calendars.name,
			source: calendars.source,
			url_enc: calendars.url_enc,
			last_success_at: syncJobs.last_success_at,
			last_attempt_at: syncJobs.last_attempt_at,
			last_error: syncJobs.last_error
		})
		.from(calendars)
		.leftJoin(syncJobs, eq(syncJobs.calendar_id, calendars.id))
		.where(eq(calendars.user_id, userId))
		.orderBy(calendars.created_at)
		.all();
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		source: r.source,
		url: r.url_enc ? decryptSecret(r.url_enc) : null,
		last_success_at: r.last_success_at,
		last_attempt_at: r.last_attempt_at,
		last_error: r.last_error
	}));
}

/**
 * Remove a calendar and everything derived from it (its busy blocks and sync
 * status), via the ON DELETE CASCADE foreign keys.
 */
export function removeCalendar(calendarId: string): void {
	db.delete(calendars).where(eq(calendars.id, calendarId)).run();
}

/** The ids of all calendars that have a live URL (for the polling job). */
export function getUrlCalendars(): string[] {
	const rows = db
		.select({ id: calendars.id })
		.from(calendars)
		.where(and(eq(calendars.source, 'url')))
		.all();
	return rows.map((r) => r.id);
}
