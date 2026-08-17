import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { calendarBlocks, users } from '$lib/server/db/schema';
import { resizeProfilePicture } from '$lib/server/picture';
import { decryptSecret } from '$lib/server/crypto';
import { isTimeOfDay } from '$lib/server/time';
import { getFormString } from '$lib/server/form';
import type { UserProfile } from '$lib/types';
import {
	clearUserIcsUrl,
	fetchIcsBlocks,
	getSyncStatus,
	recordSyncFailure,
	recordSyncSuccess,
	replaceCalendarBlocks,
	setUserIcsUrl,
	syncErrorMessage,
	parseIcsFile,
	validateIcsUrl,
	type IcsSource
} from '$lib/server/calendar/sync';

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
			ics_url_enc: users.ics_url_enc,
			ics_source: users.ics_source
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

	// Decrypt the ICS URL for display (never log it).
	const icsUrl = row.ics_url_enc ? decryptSecret(row.ics_url_enc) : null;
	const icsSource: IcsSource | null = row.ics_source;
	const syncStatus = getSyncStatus(locals.user.id);

	return { profile, icsUrl, icsSource, syncStatus };
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

	'submit-ics-url': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const url = getFormString(form, 'ics_url');

		const validated = validateIcsUrl(url);
		if (!validated.ok) {
			return fail(400, { icsError: syncErrorMessage(validated.error) });
		}

		// Immediate fetch + parse before saving, so the user gets instant feedback.
		const fetched = await fetchIcsBlocks(validated.data);
		if (!fetched.ok) {
			return fail(400, { icsError: syncErrorMessage(fetched.error) });
		}

		const stored = setUserIcsUrl(locals.user.id, validated.data);
		if (!stored.ok) {
			return fail(400, { icsError: syncErrorMessage(stored.error) });
		}

		const written = replaceCalendarBlocks(locals.user.id, fetched.data);
		if (!written.ok) {
			recordSyncFailure(locals.user.id, syncErrorMessage(written.error));
			return fail(400, { icsError: syncErrorMessage(written.error) });
		}

		recordSyncSuccess(locals.user.id);
		return { icsSaved: true };
	},

	'upload-ics-file': async ({ request, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const form = await request.formData();
		const file = form.get('ics_file');
		if (!(file instanceof File) || file.size === 0) {
			return fail(400, { icsError: 'Choose an .ics file to upload.' });
		}

		const buffer = Buffer.from(await file.arrayBuffer());
		const parsed = parseIcsFile(buffer);
		if (!parsed.ok) {
			return fail(400, { icsError: syncErrorMessage(parsed.error) });
		}

		// Uploading a file clears the live ICS URL (mutually exclusive, ARCHITECTURE.md §2).
		clearUserIcsUrl(locals.user.id);

		const written = replaceCalendarBlocks(locals.user.id, parsed.data);
		if (!written.ok) {
			recordSyncFailure(locals.user.id, syncErrorMessage(written.error));
			return fail(400, { icsError: syncErrorMessage(written.error) });
		}

		recordSyncSuccess(locals.user.id);
		return { icsSaved: true };
	},

	'disconnect-calendar': ({ locals }) => {
		if (!locals.user) throw redirect(302, '/');
		db.update(users)
			.set({ ics_url_enc: null, ics_source: null })
			.where(eq(users.id, locals.user.id))
			.run();
		db.delete(calendarBlocks).where(eq(calendarBlocks.user_id, locals.user.id)).run();
		return { icsSaved: true };
	}
};
