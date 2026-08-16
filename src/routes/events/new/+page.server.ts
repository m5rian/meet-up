import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { events, participants, users } from '$lib/server/db/schema';
import { generateSlug } from '$lib/server/slug';
import { isCalendarDate, isTimeOfDay } from '$lib/server/time';
import { getFormString } from '$lib/server/form';

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');
	return {};
};

/** Normalize 'HH:mm' (from time inputs) to 'HH:mm:ss', or pass through 'HH:mm:ss'. */
function normalizeTime(value: string): string | null {
	const m = /^(\d{2}):(\d{2})$/.exec(value);
	if (m) return `${m[1]}:${m[2]}:00`;
	return isTimeOfDay(value) ? value : null;
}

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');

		const form = await request.formData();
		const title = getFormString(form, 'title').trim();
		const visibility = getFormString(form, 'visibility');
		const dateRangeStart = getFormString(form, 'date_range_start');
		const dateRangeEnd = getFormString(form, 'date_range_end');
		const timeWindowStart = normalizeTime(getFormString(form, 'time_window_start'));
		const timeWindowEnd = normalizeTime(getFormString(form, 'time_window_end'));
		const granularityRaw = Number(getFormString(form, 'slot_granularity_minutes'));

		if (!title) return fail(400, { error: 'Title is required.' });
		if (visibility !== 'private' && visibility !== 'link') {
			return fail(400, { error: 'Invalid visibility.' });
		}
		if (!isCalendarDate(dateRangeStart) || !isCalendarDate(dateRangeEnd)) {
			return fail(400, { error: 'Invalid date range.' });
		}
		if (dateRangeEnd < dateRangeStart) {
			return fail(400, { error: 'End date must be on or after the start date.' });
		}
		if (!timeWindowStart || !timeWindowEnd) {
			return fail(400, { error: 'Invalid time window.' });
		}
		if (![15, 30, 60].includes(granularityRaw)) {
			return fail(400, { error: 'Invalid slot granularity.' });
		}

		// Copy the organizer's time zone to the event (canonical time zone).
		const organizer = db
			.select({ tz_id: users.tz_id })
			.from(users)
			.where(eq(users.id, locals.user.id))
			.get();
		const tzId = organizer?.tz_id ?? 'UTC';

		const slug = generateSlug();
		const event = db
			.insert(events)
			.values({
				slug,
				organizer_id: locals.user.id,
				title,
				visibility,
				tz_id: tzId,
				date_range_start: dateRangeStart,
				date_range_end: dateRangeEnd,
				time_window_start: timeWindowStart,
				time_window_end: timeWindowEnd,
				slot_granularity_minutes: granularityRaw
			})
			.returning({ id: events.id })
			.get();

		// Auto-add the organizer as a participant.
		db.insert(participants)
			.values({ event_id: event.id, user_id: locals.user.id, has_opened: true })
			.run();

		throw redirect(303, `/events/${slug}`);
	}
};
