/**
 * Crypto helpers: session token generation and AES-GCM encryption/decryption
 * of stored ICS URLs at rest (ARCHITECTURE.md §2, CORE.md §5).
 */
import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes,
	timingSafeEqual
} from 'node:crypto';
import { env } from '$env/dynamic/private';

/** Generate a cryptographically random session token. */
export function generateSessionToken(): string {
	return randomBytes(32).toString('base64url');
}

/** Hash a session token for storage (so a leaked DB doesn't leak sessions). */
export function hashSessionToken(token: string): string {
	return createHash('sha256').update(token).digest('hex');
}

/** Constant-time comparison of two strings. */
export function safeEqual(a: string, b: string): boolean {
	const bufA = Buffer.from(a);
	const bufB = Buffer.from(b);
	if (bufA.length !== bufB.length) return false;
	return timingSafeEqual(bufA, bufB);
}

/**
 * Encrypt a plaintext with AES-256-GCM. The 12-byte nonce is prepended to the
 * ciphertext in the stored value. The key is a hex string from ENCRYPTION_KEY.
 * Returns null when ENCRYPTION_KEY is not set (encryption is unavailable).
 */
export function encryptSecret(plaintext: string): string | null {
	const key = getEncryptionKey();
	if (!key) return null;
	const nonce = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key, nonce);
	const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
	const tag = cipher.getAuthTag();
	return Buffer.concat([nonce, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a value produced by `encryptSecret`. Returns null when the value is
 * missing or the key is unavailable (e.g. ENCRYPTION_KEY not set).
 */
export function decryptSecret(value: string): string | null {
	const key = getEncryptionKey();
	if (!key) return null;
	const buf = Buffer.from(value, 'base64');
	if (buf.length < 12 + 16) return null;
	const nonce = buf.subarray(0, 12);
	const tag = buf.subarray(12, 28);
	const encrypted = buf.subarray(28);
	try {
		const decipher = createDecipheriv('aes-256-gcm', key, nonce);
		decipher.setAuthTag(tag);
		return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
	} catch {
		return null;
	}
}

let cachedKey: Buffer | null | undefined;

function getEncryptionKey(): Buffer | null {
	if (cachedKey !== undefined) return cachedKey;
	const hex = env.ENCRYPTION_KEY;
	if (!hex) {
		cachedKey = null;
		return null;
	}
	cachedKey = Buffer.from(hex, 'hex');
	return cachedKey;
}
