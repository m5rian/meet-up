/**
 * Downloadable `.ics` invite for a finalized meeting (PLAN.md Phase 3).
 *
 * A read-only GET endpoint (a download is a read, not a mutation) gated by the
 * logged-in session: only the organizer and participants may download, and only
 * once the event has a finalized slot. The payload is built by the shared
 * `buildVevent` helper so it stays identical to the per-user feed (Phase 4).
 */
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { participants, users } from '$lib/server/db/schema';
import { buildSingleEventIcs } from '$lib/server/vevent';
import { getEventBySlug } from '$lib/server/heatmap';

export const GET: RequestHandler = ({ params, locals }) => {
	if (!locals.user) throw redirect(302, '/');

	const event = getEventBySlug(params.slug);
	if (!event || !event.finalized_start_ts || !event.finalized_end_ts) {
		throw redirect(302, `/events/${params.slug}`);
	}

	// Access control: the organizer or any participant may download.
	const isOrganizer = event.organizer_id === locals.user.id;
	const participant = db
		.select({ id: participants.id })
		.from(participants)
		.where(and(eq(participants.event_id, event.id), eq(participants.user_id, locals.user.id)))
		.get();
	if (!isOrganizer && !participant) throw redirect(302, `/events/${params.slug}`);

	// Organizer display name for the VEVENT reference.
	const organizerRow = db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, event.organizer_id))
		.get();
	const organizerName = organizerRow?.username ?? 'Organizer';

	const ics = buildSingleEventIcs({
		id: event.id,
		title: event.title,
		start_ts: event.finalized_start_ts,
		end_ts: event.finalized_end_ts,
		organizer_name: organizerName
	});

	// Slug-safe filename: lowercase alnum + dashes.
	const safe =
		event.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'meeting';

	return new Response(ics, {
		status: 200,
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': `attachment; filename="${safe}.ics"`
		}
	});
};
