import { redirect } from '@sveltejs/kit';
import type { Actions } from './$types';
import { destroySession } from '$lib/server/sessions';

export const actions: Actions = {
	default: ({ cookies }) => {
		destroySession(cookies);
		throw redirect(303, '/');
	}
};
