import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { resizeProfilePicture } from '$lib/server/picture';
import { decryptSecret } from '$lib/server/crypto';
import { isTimeOfDay } from '$lib/server/time';
import { getFormString } from '$lib/server/form';
import type { UserProfile } from '$lib/types';

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
			ics_url_enc: users.ics_url_enc
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

	// Decrypt the ICS URL for display (Phase 2 will use it; for now just expose whether set).
	const icsUrl = row.ics_url_enc ? decryptSecret(row.ics_url_enc) : null;

	return { profile, icsUrl };
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
	}
};
