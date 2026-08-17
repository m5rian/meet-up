/**
 * In-process background scheduler (ARCHITECTURE.md §1 "Background jobs").
 *
 * A simple setInterval loop polls every user's live ICS URL on the configured
 * interval (ICS_POLL_INTERVAL_MINUTES, default 30). Each poll writes to the
 * `sync_jobs` table so the "last synced / last error" UI stays accurate.
 *
 * The scheduler is started once from `hooks.server.ts` (the SvelteKit server
 * module) so it lives for the process lifetime. It is idempotent: starting it
 * twice is a no-op.
 */
import { env } from '$env/dynamic/private';
import { getUsersWithIcsUrl, syncUserFromUrl } from '../calendar/sync';

const DEFAULT_POLL_INTERVAL_MINUTES = 30;

let started = false;

/** Start the ICS polling loop. Safe to call more than once. */
export function startScheduler(): void {
	if (started) return;
	started = true;

	const raw = env.ICS_POLL_INTERVAL_MINUTES;
	const parsed = raw ? Number(raw) : NaN;
	const intervalMinutes =
		Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_POLL_INTERVAL_MINUTES;
	const intervalMs = intervalMinutes * 60 * 1000;

	// Poll immediately on startup, then on the interval.
	void pollAll();
	setInterval(() => void pollAll(), intervalMs);
}

/** Poll every user that has a live ICS URL. Failures are recorded per-user. */
async function pollAll(): Promise<void> {
	const userIds = getUsersWithIcsUrl();
	for (const userId of userIds) {
		// Each user's sync outcome is recorded in sync_jobs; never throw.
		await syncUserFromUrl(userId);
	}
}
