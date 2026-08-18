import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { hashPassword, validatePassword, validateUsername, verifyPassword } from '$lib/server/auth';
import { createSession } from '$lib/server/sessions';
import { getFormString } from '$lib/server/form';
import type { PasswordError, UsernameError } from '$lib/server/auth';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.user) throw redirect(302, '/events');
	return {};
};

const PASSWORD_ERROR_MESSAGES: Record<PasswordError, string> = {
	too_short: 'Password must be at least 12 characters.',
	missing_number: 'Password must contain at least one number.',
	missing_letter: 'Password must contain at least one letter.',
	missing_symbol: 'Password must contain at least one symbol.'
};

const USERNAME_ERROR_MESSAGES: Record<UsernameError, string> = {
	empty: 'Username is required.',
	too_long: 'Username must be 32 characters or fewer.',
	invalid_chars: 'Username may only contain letters, numbers, underscores, and hyphens.'
};

export const actions: Actions = {
	register: async ({ request, cookies }) => {
		const form = await request.formData();
		const username = getFormString(form, 'username').trim();
		const password = getFormString(form, 'password');
		const timezone = getFormString(form, 'timezone');

		const usernameResult = validateUsername(username);
		if (!usernameResult.ok) {
			return fail(400, {
				register: true,
				username,
				error: USERNAME_ERROR_MESSAGES[usernameResult.error]
			});
		}
		const passwordResult = validatePassword(password);
		if (!passwordResult.ok) {
			return fail(400, {
				register: true,
				username,
				error: PASSWORD_ERROR_MESSAGES[passwordResult.error]
			});
		}

		const existing = db
			.select({ id: users.id })
			.from(users)
			.where(eq(users.username, username))
			.get();
		if (existing) {
			return fail(400, { register: true, username, error: 'That username is already taken.' });
		}

		const passwordHash = await hashPassword(password);
		const user = db
			.insert(users)
			.values({ username, password_hash: passwordHash, tz_id: timezone })
			.returning({ id: users.id })
			.get();

		createSession(cookies, user.id);
		throw redirect(303, '/events');
	},

	login: async ({ request, cookies }) => {
		const form = await request.formData();
		const username = getFormString(form, 'username').trim();
		const password = getFormString(form, 'password');
		const timezone = getFormString(form, 'timezone');

		const user = db
			.select({ id: users.id, password_hash: users.password_hash })
			.from(users)
			.where(eq(users.username, username))
			.get();

		if (!user) {
			return fail(400, { login: true, username, error: 'Invalid username or password.' });
		}

		const valid = await verifyPassword(user.password_hash, password);
		if (!valid) {
			return fail(400, { login: true, username, error: 'Invalid username or password.' });
		}

		// Keep the stored time zone fresh (it may have changed since signup).
		db.update(users).set({ tz_id: timezone }).where(eq(users.id, user.id)).run();

		createSession(cookies, user.id);
		throw redirect(303, '/events');
	}
};
