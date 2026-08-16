import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import { manualBlocks, participants, users } from '$lib/server/db/schema';
import {
	buildHeatmap,
	getEventBySlug,
	getOrganizerUsername,
	isParticipant,
	markOpened
} from '$lib/server/heatmap';
import { getFormString } from '$lib/server/form';
import type { UserSummary } from '$lib/types';

export const load: PageServerLoad = ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const event = getEventBySlug(params.slug);
	if (!event) throw redirect(302, '/events');

	const isOrganizer = event.organizer_id === locals.user.id;
	const joined = isParticipant(event.id, locals.user.id);

	// Access control:
	//  - link events: any logged-in user can view.
	//  - private events: only invited participants (or the organizer) can view.
	if (event.visibility === 'private' && !joined && !isOrganizer) {
		throw redirect(302, '/events');
	}

	// Opening the event page flips has_opened for private-event invites.
	if (joined && event.visibility === 'private') {
		markOpened(event.id, locals.user.id);
	}

	// The viewer's time zone, auto-detected from the browser.
	const viewerRow = db
		.select({ tz_id: users.tz_id })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.get();
	const viewerTzId = viewerRow?.tz_id ?? 'UTC';

	const heatmap = buildHeatmap(event, locals.user.id, viewerTzId);

	// Users available to invite (private events, organizer only).
	let inviteCandidates: UserSummary[] = [];
	let invitedUserIds: string[] = [];
	if (isOrganizer && event.visibility === 'private') {
		const participantRows = db
			.select({ user_id: participants.user_id })
			.from(participants)
			.where(eq(participants.event_id, event.id))
			.all();
		invitedUserIds = participantRows.map((p) => p.user_id);
		// Candidates = all users except those already invited and the organizer.
		const allUsers = db
			.select({ id: users.id, username: users.username, profile_picture: users.profile_picture })
			.from(users)
			.all();
		const invitedSet = new Set(invitedUserIds);
		const viewerId = locals.user.id;
		inviteCandidates = allUsers.filter((u) => u.id !== viewerId && !invitedSet.has(u.id));
	}

	const baseUrl = env.BASE_URL;
	const shareUrl = baseUrl ? `${baseUrl}/events/${event.slug}` : `/events/${event.slug}`;

	return {
		event: {
			id: event.id,
			slug: event.slug,
			title: event.title,
			visibility: event.visibility,
			organizer_id: event.organizer_id,
			organizer_username: getOrganizerUsername(event.organizer_id) ?? 'Unknown',
			tz_id: event.tz_id,
			date_range_start: event.date_range_start,
			date_range_end: event.date_range_end,
			time_window_start: event.time_window_start,
			time_window_end: event.time_window_end,
			slot_granularity_minutes: event.slot_granularity_minutes,
			finalized_start_ts: event.finalized_start_ts,
			finalized_end_ts: event.finalized_end_ts
		},
		heatmap,
		isOrganizer,
		joined,
		inviteCandidates,
		invitedUserIds,
		shareUrl
	};
};

export const actions: Actions = {
	join: ({ params, locals }) => {
		if (!locals.user) throw redirect(302, '/');
		const event = getEventBySlug(params.slug);
		if (!event) return fail(404, { joinError: 'Event not found.' });
		if (event.visibility !== 'link')
			return fail(400, { joinError: 'This event is not joinable by link.' });

		const existing = isParticipant(event.id, locals.user.id);
		if (!existing) {
			db.insert(participants)
				.values({ event_id: event.id, user_id: locals.user.id, has_opened: true })
				.run();
		}
		return { joined: true };
	},

	invite: async ({ params, locals, request }) => {
		if (!locals.user) throw redirect(302, '/');
		const event = getEventBySlug(params.slug);
		if (!event) return fail(404, { inviteError: 'Event not found.' });
		if (event.organizer_id !== locals.user.id)
			return fail(403, { inviteError: 'Only the organizer can invite.' });
		if (event.visibility !== 'private')
			return fail(400, { inviteError: 'Only private events support invitations.' });

		const form = await request.formData();
		const username = getFormString(form, 'username').trim();
		if (!username) return fail(400, { inviteError: 'Choose a user to invite.' });

		const target = db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, username))
			.get();
		if (!target) return fail(400, { inviteError: 'That user does not exist.' });
		if (target.id === locals.user.id)
			return fail(400, { inviteError: 'You cannot invite yourself.' });

		const existing = isParticipant(event.id, target.id);
		if (existing) return fail(400, { inviteError: 'That user is already invited.' });

		db.insert(participants)
			.values({ event_id: event.id, user_id: target.id, has_opened: false })
			.run();
		return { invited: username };
	},

	'update-availability': async ({ params, locals, request }) => {
		if (!locals.user) throw redirect(302, '/');
		const event = getEventBySlug(params.slug);
		if (!event) return fail(404, { availabilityError: 'Event not found.' });

		const participant = db
			.select({ id: participants.id })
			.from(participants)
			.where(and(eq(participants.event_id, event.id), eq(participants.user_id, locals.user.id)))
			.get();
		if (!participant) return fail(403, { availabilityError: 'You must join the event first.' });

		const form = await request.formData();
		const busyRaw = getFormString(form, 'busy_cells');
		const freeRaw = getFormString(form, 'free_cells');

		const parsed = parseCells(busyRaw, freeRaw);
		if (!parsed.ok) return fail(400, { availabilityError: 'Invalid availability data.' });
		const { busyCells, freeCells } = parsed.data;

		// Replace the user's manual blocks for this event.
		db.delete(manualBlocks).where(eq(manualBlocks.participant_id, participant.id)).run();
		for (const [start, end] of busyCells) {
			db.insert(manualBlocks)
				.values({ participant_id: participant.id, start_ts: start, end_ts: end, busy: true })
				.run();
		}
		for (const [start, end] of freeCells) {
			db.insert(manualBlocks)
				.values({ participant_id: participant.id, start_ts: start, end_ts: end, busy: false })
				.run();
		}

		return { saved: true };
	}
};

function parseCells(
	busyRaw: string,
	freeRaw: string
):
	| { ok: true; data: { busyCells: [string, string][]; freeCells: [string, string][] } }
	| { ok: false } {
	let busyCells: unknown;
	let freeCells: unknown;
	try {
		busyCells = JSON.parse(busyRaw);
		freeCells = JSON.parse(freeRaw);
	} catch {
		return { ok: false };
	}
	if (!isCellList(busyCells) || !isCellList(freeCells)) return { ok: false };
	return { ok: true, data: { busyCells, freeCells } };
}

function isCellList(value: unknown): value is [string, string][] {
	if (!Array.isArray(value)) return false;
	return value.every(
		(cell) =>
			Array.isArray(cell) &&
			cell.length === 2 &&
			typeof cell[0] === 'string' &&
			typeof cell[1] === 'string' &&
			cell[0] < cell[1]
	);
}
