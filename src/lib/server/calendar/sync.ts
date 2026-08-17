/**
 * Calendar sync: fetch a live ICS URL or parse an uploaded .ics file, then
 * rebuild the user's `calendar_blocks` and record the outcome in `sync_jobs`
 * (ARCHITECTURE.md §2, §3.4; CORE.md §4, §5).
 *
 * `calendar_blocks` are rebuilt on every successful poll/parse — they always
 * reflect the most recent version of the calendar, never merged incrementally.
 * Only computed busy intervals are persisted; raw event details are discarded.
 */
import { and, eq } from 'drizzle-orm';
import { db } from '../db';
import { calendarBlocks, syncJobs, users } from '../db/schema';
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

/** Validate a submitted ICS URL. Only https:// is accepted (CORE.md §5). */
export function validateIcsUrl(raw: string): Result<string, SyncError> {
	const url = raw.trim();
	if (!url) return err('no_source');
	let parsed: URL;
	try {
		parsed = new URL(url);
	} catch {
		return err('invalid_url');
	}
	if (parsed.protocol !== 'https:') return err('not_https');
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
 * Persist a set of busy blocks for a user, replacing any previous calendar blocks.
 * Returns a typed error when the blocks cannot be written.
 */
export function replaceCalendarBlocks(
	userId: string,
	blocks: CalendarBlock[]
): Result<void, SyncError> {
	try {
		db.delete(calendarBlocks).where(eq(calendarBlocks.user_id, userId)).run();
		for (const b of blocks) {
			db.insert(calendarBlocks)
				.values({
					user_id: userId,
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
export function recordSyncSuccess(userId: string): void {
	const now = new Date();
	db.insert(syncJobs)
		.values({ user_id: userId, last_attempt_at: now, last_success_at: now, last_error: null })
		.onConflictDoUpdate({
			target: syncJobs.user_id,
			set: { last_attempt_at: now, last_success_at: now, last_error: null }
		})
		.run();
}

/** Record a failed sync attempt in `sync_jobs`. */
export function recordSyncFailure(userId: string, error: string): void {
	const now = new Date();
	db.insert(syncJobs)
		.values({ user_id: userId, last_attempt_at: now, last_error: error })
		.onConflictDoUpdate({
			target: syncJobs.user_id,
			set: { last_attempt_at: now, last_error: error }
		})
		.run();
}

/**
 * Run a full sync for a user from their live ICS URL: fetch, parse, persist, and
 * record the outcome. Returns the sync result (typed error on any expected failure).
 */
export async function syncUserFromUrl(userId: string): Promise<Result<void, SyncError>> {
	const row = db
		.select({ ics_url_enc: users.ics_url_enc })
		.from(users)
		.where(eq(users.id, userId))
		.get();
	if (!row?.ics_url_enc) {
		recordSyncFailure(userId, 'No ICS URL configured.');
		return err('no_source');
	}
	const url = decryptSecret(row.ics_url_enc);
	if (!url) {
		recordSyncFailure(userId, 'Could not decrypt the ICS URL.');
		return err('encryption_unavailable');
	}

	const fetched = await fetchIcsBlocks(url);
	if (!fetched.ok) {
		recordSyncFailure(userId, syncErrorMessage(fetched.error));
		return err(fetched.error);
	}

	const written = replaceCalendarBlocks(userId, fetched.data);
	if (!written.ok) {
		recordSyncFailure(userId, 'Could not save calendar blocks.');
		return err(written.error);
	}

	recordSyncSuccess(userId);
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

/** Store a user's ICS URL (encrypted at rest) and mark the source as 'url'. */
export function setUserIcsUrl(userId: string, url: string): Result<void, SyncError> {
	const encrypted = encryptSecret(url);
	if (!encrypted) return err('encryption_unavailable');
	db.update(users)
		.set({ ics_url_enc: encrypted, ics_source: 'url' })
		.where(eq(users.id, userId))
		.run();
	return ok(undefined);
}

/** Clear a user's ICS URL (used when uploading a file instead). */
export function clearUserIcsUrl(userId: string): void {
	db.update(users).set({ ics_url_enc: null, ics_source: 'file' }).where(eq(users.id, userId)).run();
}

/** Load a user's sync status row, if any. */
export function getSyncStatus(userId: string): {
	last_success_at: Date | null;
	last_attempt_at: Date | null;
	last_error: string | null;
} | null {
	const row = db
		.select({
			last_success_at: syncJobs.last_success_at,
			last_attempt_at: syncJobs.last_attempt_at,
			last_error: syncJobs.last_error
		})
		.from(syncJobs)
		.where(eq(syncJobs.user_id, userId))
		.get();
	if (!row) return null;
	return {
		last_success_at: row.last_success_at,
		last_attempt_at: row.last_attempt_at,
		last_error: row.last_error
	};
}

/** The set of user ids that currently have a live ICS URL (for the polling job). */
export function getUsersWithIcsUrl(): string[] {
	const rows = db
		.select({ id: users.id })
		.from(users)
		.where(and(eq(users.ics_source, 'url')))
		.all();
	return rows.map((r) => r.id);
}
