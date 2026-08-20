/**
 * Per-user private ICS feed of finalized meetings (PLAN.md Phase 4,
 * ARCHITECTURE.md §5.3).
 *
 * A public, token-authenticated endpoint: calendar providers fetch it without a
 * session, so the secret token in the URL is the only credential. Unknown or
 * mismatched tokens return 404 (no information leak). Responds with `text/calendar`.
 */
import type { RequestHandler } from './$types';
import { getUserByCalendarToken, getUserFinalizedMeetings, buildUserFeed } from '$lib/server/feed';
import { rateLimit } from '$lib/server/rate-limit';

// Calendar providers poll on a cadence (minutes), so a few per minute is plenty.
const FEED_LIMIT = 30;
const FEED_WINDOW_MS = 60 * 1000; // 1 minute

export const GET: RequestHandler = ({ params, getClientAddress }) => {
	const rl = rateLimit(`feed:${getClientAddress()}`, FEED_LIMIT, FEED_WINDOW_MS);
	if (!rl.allowed) {
		return new Response('Rate limited', {
			status: 429,
			headers: { 'Retry-After': String(rl.retryAfterSeconds) }
		});
	}

	const token = params.token;
	const userId = getUserByCalendarToken(token);
	// Return 404 for unknown tokens so attackers can't distinguish a bad token
	// from an empty feed.
	if (!userId) {
		return new Response('Not found', { status: 404 });
	}

	const meetings = getUserFinalizedMeetings(userId);
	const ics = buildUserFeed(meetings);

	return new Response(ics, {
		status: 200,
		headers: {
			'Content-Type': 'text/calendar; charset=utf-8',
			'Content-Disposition': 'inline; filename="meet-up-finalized.ics"'
		}
	});
};
