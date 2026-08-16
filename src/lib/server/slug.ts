/**
 * Event slug generation. Slugs are non-secret identifiers (ARCHITECTURE.md §2):
 * they point to an event, but access is gated by login + invitation.
 */
import { randomBytes } from 'node:crypto';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export function generateSlug(length = 10): string {
	const bytes = randomBytes(length);
	let out = '';
	for (let i = 0; i < length; i++) {
		out += ALPHABET[bytes[i] % ALPHABET.length];
	}
	return out;
}
