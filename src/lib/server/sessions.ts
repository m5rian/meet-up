/**
 * Cookie-session management (ARCHITECTURE.md §1 "Sessions").
 *
 * A session is a random token stored in a signed, httpOnly cookie. The token's
 * SHA-256 hash is stored in the `sessions` table; the cookie carries the raw
 * token so the server can look it up on each request.
 */
import type { Cookies } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from './db';
import { sessions, users } from './db/schema';
import { generateSessionToken, hashSessionToken } from './crypto';
import type { Result } from '$lib/result';
import { err, ok } from '$lib/result';

const COOKIE_NAME = 'ft_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export type SessionError = 'invalid_session';

export interface SessionUser {
	id: string;
	username: string;
}

export function setSessionCookie(cookies: Cookies, token: string): void {
	cookies.set(COOKIE_NAME, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		// TLS is normally terminated in front of the app; mark the cookie secure
		// when the public origin is https so it is only sent over TLS.
		secure: originSecure(),
		maxAge: SESSION_TTL_MS / 1000
	});
}

/** Whether the public origin is https (so cookies are marked Secure). */
function originSecure(): boolean {
	const origin = env.ORIGIN;
	return origin ? origin.startsWith('https://') : false;
}

export function clearSessionCookie(cookies: Cookies): void {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

export function getSessionToken(cookies: Cookies): string | null {
	return cookies.get(COOKIE_NAME) ?? null;
}

/** Create a session for a user and set the cookie. */
export function createSession(cookies: Cookies, userId: string): void {
	const token = generateSessionToken();
	const tokenHash = hashSessionToken(token);
	db.insert(sessions)
		.values({
			user_id: userId,
			token_hash: tokenHash,
			expires_at: new Date(Date.now() + SESSION_TTL_MS)
		})
		.run();
	setSessionCookie(cookies, token);
}

/** Destroy the current session (logout). */
export function destroySession(cookies: Cookies): void {
	const token = getSessionToken(cookies);
	if (token) {
		db.delete(sessions)
			.where(eq(sessions.token_hash, hashSessionToken(token)))
			.run();
	}
	clearSessionCookie(cookies);
}

/**
 * Resolve the current session to a user. Returns `err('invalid_session')` when
 * there is no valid session. Expired sessions are deleted on access.
 */
export function getSessionUser(cookies: Cookies): Result<SessionUser, SessionError> {
	const token = getSessionToken(cookies);
	if (!token) return err('invalid_session');

	const tokenHash = hashSessionToken(token);
	const row = db
		.select({ user_id: sessions.user_id, expires_at: sessions.expires_at })
		.from(sessions)
		.where(eq(sessions.token_hash, tokenHash))
		.get();

	if (!row) return err('invalid_session');

	if (row.expires_at.getTime() < Date.now()) {
		db.delete(sessions).where(eq(sessions.token_hash, tokenHash)).run();
		clearSessionCookie(cookies);
		return err('invalid_session');
	}

	const user = db
		.select({ id: users.id, username: users.username })
		.from(users)
		.where(eq(users.id, row.user_id))
		.get();

	if (!user) return err('invalid_session');

	return ok(user);
}

/** Refresh the session's expiry on activity (sliding expiration). */
export function touchSession(cookies: Cookies): void {
	const token = getSessionToken(cookies);
	if (!token) return;
	const tokenHash = hashSessionToken(token);
	db.update(sessions)
		.set({ expires_at: new Date(Date.now() + SESSION_TTL_MS) })
		.where(and(eq(sessions.token_hash, tokenHash)))
		.run();
}

export { COOKIE_NAME };
