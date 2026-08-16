import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { desc, eq, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { events, participants, users } from '$lib/server/db/schema';
import type { EventSummary } from '$lib/types';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	const userId = locals.user.id;

	// Events the user is a participant of (invited or joined).
	const participantRows = db
		.select({ event_id: participants.event_id })
		.from(participants)
		.where(eq(participants.user_id, userId))
		.all();
	const eventIds = participantRows.map((p) => p.event_id);

	const eventRows = eventIds.length
		? db
				.select({
					id: events.id,
					slug: events.slug,
					title: events.title,
					visibility: events.visibility,
					organizer_id: events.organizer_id,
					tz_id: events.tz_id,
					date_range_start: events.date_range_start,
					date_range_end: events.date_range_end,
					time_window_start: events.time_window_start,
					time_window_end: events.time_window_end,
					slot_granularity_minutes: events.slot_granularity_minutes,
					finalized_start_ts: events.finalized_start_ts,
					finalized_end_ts: events.finalized_end_ts,
					created_at: events.created_at
				})
				.from(events)
				.where(inArray(events.id, eventIds))
				.orderBy(desc(events.created_at))
				.all()
		: [];

	const organizerIds = [...new Set(eventRows.map((e) => e.organizer_id))];
	const organizerRows = organizerIds.length
		? db
				.select({ id: users.id, username: users.username })
				.from(users)
				.where(inArray(users.id, organizerIds))
				.all()
		: [];
	const usernameById = new Map(organizerRows.map((u) => [u.id, u.username]));

	const list: EventSummary[] = eventRows.map((e) => ({
		id: e.id,
		slug: e.slug,
		title: e.title,
		visibility: e.visibility,
		organizer_id: e.organizer_id,
		organizer_username: usernameById.get(e.organizer_id) ?? 'Unknown',
		tz_id: e.tz_id,
		date_range_start: e.date_range_start,
		date_range_end: e.date_range_end,
		time_window_start: e.time_window_start,
		time_window_end: e.time_window_end,
		slot_granularity_minutes: e.slot_granularity_minutes,
		finalized_start_ts: e.finalized_start_ts,
		finalized_end_ts: e.finalized_end_ts,
		created_at: e.created_at.getTime(),
		is_organizer: e.organizer_id === userId,
		joined: true
	}));

	return { events: list };
};
