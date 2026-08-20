/**
 * Per-user private ICS feed of finalized meetings (ARCHITECTURE.md §5,
 * PLAN.md Phase 4).
 *
 * Each user has a secret `calendar_token` (bearer secret) that authenticates
 * `GET /calendar/<token>.ics`. The feed serves one `VEVENT` per finalized
 * meeting the user participates in, built with the same `buildVevent` helper as
 * the per-event invite download so both stay identical.
 */
import { randomBytes } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { db } from './db';
import { events, participants, users } from './db/schema';
import { buildVevent, wrapCalendar } from './vevent';
import { safeEqual } from './crypto';

/** Generate a new secret feed token (32 random bytes, base64url). */
export function generateCalendarToken(): string {
	return randomBytes(32).toString('base64url');
}

/**
 * Set (or rotate) a user's feed token and return it. Rotation invalidates the
 * previous feed URL because old tokens no longer match.
 */
export function setCalendarToken(userId: string): string {
	const token = generateCalendarToken();
	db.update(users).set({ calendar_token: token }).where(eq(users.id, userId)).run();
	return token;
}

/**
 * Look up a user id by feed token. Uses a constant-time comparison so a timing
 * side-channel can't be used to enumerate valid tokens. Returns null when the
 * token doesn't match any user.
 */
export function getUserByCalendarToken(token: string): string | null {
	const rows = db.select({ id: users.id, calendar_token: users.calendar_token }).from(users).all();
	const target = token.trim();
	for (const row of rows) {
		if (row.calendar_token !== null && safeEqual(row.calendar_token, target)) {
			return row.id;
		}
	}
	return null;
}

export interface FinalizedMeeting {
	id: string;
	title: string;
	start_ts: string;
	end_ts: string;
	organizer_id: string;
	organizer_name: string;
}

/**
 * Load a user's finalized meetings: every event where they are a participant
 * and a final slot is set, sorted by start time.
 */
export function getUserFinalizedMeetings(userId: string): FinalizedMeeting[] {
	const rows = db
		.select({
			id: events.id,
			title: events.title,
			start_ts: events.finalized_start_ts,
			end_ts: events.finalized_end_ts,
			organizer_id: events.organizer_id,
			organizer_username: users.username
		})
		.from(events)
		.innerJoin(participants, eq(participants.event_id, events.id))
		.leftJoin(users, eq(users.id, events.organizer_id))
		.where(
			and(
				eq(participants.user_id, userId),
				isNotNull(events.finalized_start_ts),
				isNotNull(events.finalized_end_ts)
			)
		)
		.orderBy(events.finalized_start_ts)
		.all();

	return rows
		.filter((r) => r.start_ts && r.end_ts)
		.map((r) => ({
			id: r.id,
			title: r.title,
			start_ts: r.start_ts as string,
			end_ts: r.end_ts as string,
			organizer_id: r.organizer_id,
			organizer_name: r.organizer_username ?? 'Organizer'
		}));
}

/** Build the full `.ics` feed payload for a list of finalized meetings. */
export function buildUserFeed(meetings: FinalizedMeeting[]): string {
	return wrapCalendar(
		meetings.map((m) =>
			buildVevent({
				id: m.id,
				title: m.title,
				start_ts: m.start_ts,
				end_ts: m.end_ts,
				organizer_name: m.organizer_name
			})
		)
	);
}
