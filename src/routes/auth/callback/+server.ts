import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { handleCallback } from '$lib/server/oidc';
import { createSession } from '$lib/server/sessions';

export const GET: RequestHandler = async ({ cookies, url }) => {
	const result = await handleCallback(cookies, url);

	if (!result.ok) {
		// Redirect back to the login page. The state cookie is already consumed;
		// the user can simply retry. Optionally surface a reason via query param.
		const reason = result.error === 'missing_username' ? 'missing_username' : 'invalid_state';
		throw redirect(302, `/?error=${reason}`);
	}

	const { sub, issuer, username } = result.identity;

	// Upsert the user keyed by their IdP `sub`. On a returning user, refresh the
	// stored username in case it changed on the IdP.
	const existing = db.select({ id: users.id }).from(users).where(eq(users.oidc_sub, sub)).get();

	let userId: string;
	if (existing) {
		db.update(users).set({ username }).where(eq(users.id, existing.id)).run();
		userId = existing.id;
	} else {
		// A username collision with an existing account (different IdP `sub`) is
		// rejected: the user must resolve it on the IdP side.
		try {
			const created = db
				.insert(users)
				.values({ username, oidc_sub: sub, oidc_issuer: issuer })
				.returning({ id: users.id })
				.get();
			userId = created.id;
		} catch {
			throw redirect(302, '/?error=username_taken');
		}
	}

	createSession(cookies, userId);
	throw redirect(303, '/events');
};
