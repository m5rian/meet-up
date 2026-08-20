import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { calendars, users } from '$lib/server/db/schema';
import { resizeProfilePicture } from '$lib/server/picture';
import { isTimeOfDay } from '$lib/server/time';
import { getFormString } from '$lib/server/form';
import type { CalendarConnection, UserProfile } from '$lib/types';
import { setCalendarToken } from '$lib/server/feed';
import {
	createCalendar,
	fetchIcsBlocks,
	getCalendars,
	parseIcsFile,
	removeCalendar,
	replaceCalendarBlocks,
	syncCalendar,
	syncErrorMessage,
	validateIcsUrl
} from '$lib/server/calendar/sync';

function toSyncStatus(row: {
	last_success_at: Date | null;
	last_attempt_at: Date | null;
	last_error: string | null;
}): { last_success_at: Date | null; last_attempt_at: Date | null; last_error: string | null } {
	return {
		last_success_at: row.last_success_at,
		last_attempt_at: row.last_attempt_at,
		last_error: row.last_error
	};
}

export const load: PageServerLoad = ({ locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const row = db
		.select({
			id: users.id,
			username: users.username,
			profile_picture: users.profile_picture,
			tz_id: users.tz_id,
			sleep_start: users.sleep_start,
			sleep_end: users.sleep_end,
			calendar_token: users.calendar_token
		})
		.from(users)
		.where(eq(users.id, locals.user.id))
		.get();
	if (!row) throw redirect(302, '/');

	const profile: UserProfile = {
		id: row.id,
		username: row.username,
		profile_picture: row.profile_picture,
		tz_id: row.tz_id,
		sleep_start: row.sleep_start,
		sleep_end: row.sleep_end
	};

	const calendars: CalendarConnection[] = getCalendars(locals.user.id).map((c) => ({
		id: c.id,
		name: c.name,
		source: c.source,
		url: c.url,
		syncStatus: toSyncStatus(c)
	}));

	// The user's private calendar feed URL (generated lazily on first view so
	// users who never use it don't get an unused secret token).
	let calendarToken = row.calendar_token;
	if (!calendarToken) {
		calendarToken = setCalendarToken(row.id);
	}
	const baseUrl = env.BASE_URL.replace(/\/$/, '');
	const calendarFeedUrl = `${baseUrl}/calendar/${calendarToken}.ics`;

	return { profile, calendars, feedUrl: calendarFeedUrl };
};

export const actions: Actions = {
	'update-profile-picture': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const file = form.get('picture');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { pictureError: 'Choose an image to upload.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const result = await resizeProfilePicture(buffer);
		if (!result.ok) {
			const messages = {
				not_an_image: 'That file is not a valid image.',
				too_large: 'Image is too large (max 5 MB).',
				unsupported_format: 'Unsupported image format.',
				processing_failed: 'Could not process the image.'
			};
			return fail(400, { pictureError: messages[result.error] });
		}

		db.update(users)
			.set({ profile_picture: result.data })
			.where(eq(users.id, locals.user.id))
			.run();
		return { pictureSaved: true };
	},

	'update-sleep-schedule': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const startRaw = getFormString(form, 'sleep_start');
		const endRaw = getFormString(form, 'sleep_end');

		// Normalize 'HH:mm' (from time inputs) to 'HH:mm:ss'.
		const normalize = (v: string): string | null => {
			if (!v) return null;
			const m = /^(\d{2}):(\d{2})$/.exec(v);
			if (m) return `${m[1]}:${m[2]}:00`;
			return isTimeOfDay(v) ? v : null;
		};

		const start = normalize(startRaw);
		const end = normalize(endRaw);
		if ((start === null) !== (end === null)) {
			return fail(400, { sleepError: 'Provide both a start and end time, or clear the schedule.' });
		}

		db.update(users)
			.set({ sleep_start: start, sleep_end: end })
			.where(eq(users.id, locals.user.id))
			.run();
		return { sleepSaved: true };
	},

	'clear-sleep-schedule': ({ locals }) => {
		if (!locals.user) throw redirect(302, '/');
		db.update(users)
			.set({ sleep_start: null, sleep_end: null })
			.where(eq(users.id, locals.user.id))
			.run();
		return { sleepSaved: true };
	},

	'add-calendar': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const name = getFormString(form, 'name').trim();
		const source = getFormString(form, 'source') === 'file' ? 'file' : 'url';

		if (source === 'url') {
			const url = getFormString(form, 'ics_url');
			const validated = validateIcsUrl(url);
			if (!validated.ok) {
				return fail(400, { calendarError: syncErrorMessage(validated.error) });
			}

			// Immediate fetch + parse before saving, so the user gets instant feedback.
			const fetched = await fetchIcsBlocks(validated.data);
			if (!fetched.ok) {
				return fail(400, { calendarError: syncErrorMessage(fetched.error) });
			}

			const created = createCalendar(locals.user.id, name, 'url', validated.data);
			if (!created.ok) {
				return fail(400, { calendarError: syncErrorMessage(created.error) });
			}

			const written = replaceCalendarBlocks(created.data, fetched.data);
			if (!written.ok) {
				removeCalendar(created.data);
				return fail(400, { calendarError: syncErrorMessage(written.error) });
			}

			return { calendarSaved: true };
		}

		// File calendar: parse once, no polling.
		const file = form.get('ics_file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { calendarError: 'Choose an .ics file to upload.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const parsed = parseIcsFile(buffer);
		if (!parsed.ok) {
			return fail(400, { calendarError: syncErrorMessage(parsed.error) });
		}

		const created = createCalendar(locals.user.id, name, 'file', null);
		if (!created.ok) {
			return fail(400, { calendarError: syncErrorMessage(created.error) });
		}

		const written = replaceCalendarBlocks(created.data, parsed.data);
		if (!written.ok) {
			removeCalendar(created.data);
			return fail(400, { calendarError: syncErrorMessage(written.error) });
		}

		return { calendarSaved: true };
	},

	'resync-calendar': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const calendarId = getFormString(form, 'calendar_id');

		const calendar = getCalendarForUser(calendarId, locals.user.id);
		if (!calendar) {
			return fail(400, { calendarError: 'Calendar not found.' });
		}

		const result = await syncCalendar(calendarId);
		if (!result.ok) {
			return fail(400, { calendarError: syncErrorMessage(result.error) });
		}
		return { calendarSaved: true };
	},

	'remove-calendar': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const calendarId = getFormString(form, 'calendar_id');

		const calendar = getCalendarForUser(calendarId, locals.user.id);
		if (!calendar) {
			return fail(400, { calendarError: 'Calendar not found.' });
		}

		removeCalendar(calendarId);
		return { calendarSaved: true };
	},

	'regenerate-calendar-token': ({ locals }) => {
		if (!locals.user) throw redirect(302, '/');
		setCalendarToken(locals.user.id);
		return { tokenRegenerated: true };
	}
};

/** Load a calendar and confirm it belongs to the given user (ownership check). */
function getCalendarForUser(
	calendarId: string,
	userId: string
): { id: string; user_id: string } | null {
	const row = db
		.select({ id: calendars.id, user_id: calendars.user_id })
		.from(calendars)
		.where(eq(calendars.id, calendarId))
		.get();
	if (!row || row.user_id !== userId) return null;
	return row;
}
