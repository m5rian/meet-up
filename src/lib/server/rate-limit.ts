/**
 * In-memory sliding-window rate limiter (CORE.md §5, PLAN.md Phase 5).
 *
 * A simple per-key limiter used to throttle sensitive operations (login/register
 * attempts, ICS URL fetching, feed regeneration). It is in-memory and per-process,
 * which is fine for a single self-hosted instance; a multi-instance deployment
 * would need a shared store (e.g. Redis) instead.
 *
 * The limiter never throws — it returns whether the request is allowed and, when
 * blocked, how long to wait.
 */
export interface RateLimitResult {
	allowed: boolean;
	/** Seconds until the window resets (for the Retry-After header). */
	retryAfterSeconds: number;
}

interface Bucket {
	/** Monotonic timestamps (ms) of recent hits within the window. */
	hits: number[];
}

const buckets = new Map<string, Bucket>();

/**
 * Check and record a hit for `key`. Allows up to `limit` hits within `windowMs`.
 * When over the limit, returns `allowed: false` and the seconds until the oldest
 * hit in the window falls out.
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
	const now = Date.now();
	const bucket = buckets.get(key) ?? { hits: [] };

	// Drop hits older than the window.
	bucket.hits = bucket.hits.filter((t) => now - t < windowMs);

	if (bucket.hits.length >= limit) {
		const oldest = bucket.hits[0];
		const retryAfterSeconds = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
		buckets.set(key, bucket);
		return { allowed: false, retryAfterSeconds };
	}

	bucket.hits.push(now);
	buckets.set(key, bucket);
	return { allowed: true, retryAfterSeconds: 0 };
}

/** Clear all buckets (useful for tests). */
export function clearRateLimits(): void {
	buckets.clear();
}
