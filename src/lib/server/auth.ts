/**
 * Authentication helpers: password hashing (argon2id) and validation.
 *
 * Password policy (ARCHITECTURE.md §2): at least 12 characters, containing at
 * least one number, one alphabetical character, and one symbol. Usernames are
 * unique and capped at 32 characters.
 */
import argon2 from 'argon2';
import type { Result } from '$lib/result';
import { err, ok } from '$lib/result';

export type PasswordError = 'too_short' | 'missing_number' | 'missing_letter' | 'missing_symbol';

export type UsernameError = 'empty' | 'too_long' | 'invalid_chars';

export const USERNAME_MAX_LENGTH = 32;
export const PASSWORD_MIN_LENGTH = 12;

const USERNAME_RE = /^[A-Za-z0-9_-]+$/;

export function validateUsername(username: string): Result<string, UsernameError> {
	if (username.length === 0) return err('empty');
	if (username.length > USERNAME_MAX_LENGTH) return err('too_long');
	if (!USERNAME_RE.test(username)) return err('invalid_chars');
	return ok(username);
}

export function validatePassword(password: string): Result<string, PasswordError> {
	if (password.length < PASSWORD_MIN_LENGTH) return err('too_short');
	if (!/\d/.test(password)) return err('missing_number');
	if (!/[A-Za-z]/.test(password)) return err('missing_letter');
	if (!/[^A-Za-z0-9]/.test(password)) return err('missing_symbol');
	return ok(password);
}

export async function hashPassword(password: string): Promise<string> {
	return argon2.hash(password, { type: argon2.argon2id });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
	try {
		return await argon2.verify(hash, password);
	} catch {
		return false;
	}
}
