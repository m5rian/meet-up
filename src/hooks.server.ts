import type { Handle } from '@sveltejs/kit';
import { getSessionUser, touchSession } from '$lib/server/sessions';
import { startScheduler } from '$lib/server/jobs/scheduler';

// Start the in-process ICS polling scheduler once per process (idempotent).
startScheduler();

export const handle: Handle = async ({ event, resolve }) => {
	// Resolve the session user (if any) for every request.
	const session = getSessionUser(event.cookies);
	if (session.ok) {
		event.locals.user = session.data;
		touchSession(event.cookies);
	} else {
		event.locals.user = null;
	}

	return resolve(event);
};
