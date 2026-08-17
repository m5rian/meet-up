/**
 * ICS parsing → busy intervals (ARCHITECTURE.md §3.4).
 *
 * We deliberately discard every raw calendar detail (SUMMARY/DESCRIPTION/LOCATION)
 * immediately after computing each event's busy range — nothing but free/busy
 * intervals is ever persisted (CORE.md §2, §5).
 *
 * Time-format handling:
 *  - UTC times (DTSTART:...Z) → resolved UTC ISO string, is_floating = false.
 *  - TZID-bound times (DTSTART;TZID=...) → resolved UTC ISO string, is_floating = false.
 *  - Floating times (no Z / no TZID) → kept as local wall-clock 'YYYY-MM-DDTHH:mm:ss',
 *    is_floating = true. node-ical parses these as host-local Date objects; we read
 *    back the wall-clock components so the stored value is timezone-independent.
 *
 * Recurring events (RRULE) are expanded with node-ical's `expandRecurringEvent`
 * within a fixed lookahead horizon (NOW → NOW + 90 days, ARCHITECTURE.md §3.4).
 */
import ical from 'node-ical';
import type { CalendarResponse, EventInstance } from 'node-ical';
import type { UtcTimestamp } from '../time';
import { addDays } from '../time';
import type { Result } from '$lib/result';
import { err, ok } from '$lib/result';

/** A busy interval derived from a calendar. */
export interface CalendarBlock {
	/** UTC ISO string, or a wall-clock ISO string (no offset) when `floating`. */
	start_ts: string;
	/** UTC ISO string, or a wall-clock ISO string (no offset) when `floating`. */
	end_ts: string;
	/** True for ICS floating times (no Z / no TZID); false for resolved UTC timestamps. */
	floating: boolean;
}

export type IcsParseError = 'empty' | 'malformed' | 'no_events';

const LOOKAHEAD_DAYS = 90;

/**
 * Parse an ICS payload into busy intervals. `from`/`to` bound the RRULE expansion
 * horizon (typically NOW → NOW + 90 days, intersected with active event ranges).
 */
export function parseIcsToBlocks(
	icsText: string,
	from: Date,
	to: Date
): Result<CalendarBlock[], IcsParseError> {
	const trimmed = icsText.trim();
	if (!trimmed) return err('empty');

	let parsed: CalendarResponse;
	try {
		parsed = ical.sync.parseICS(trimmed);
	} catch {
		return err('malformed');
	}

	const blocks: CalendarBlock[] = [];
	for (const value of Object.values(parsed)) {
		if (!value || typeof value !== 'object' || value.type !== 'VEVENT') continue;
		const event = value;
		// Skip cancelled events — they occupy no time.
		if (event.status === 'CANCELLED') continue;

		let instances: EventInstance[];
		try {
			instances = ical.expandRecurringEvent(event, { from, to });
		} catch {
			// A malformed RRULE shouldn't fail the whole calendar; skip this event.
			continue;
		}

		for (const instance of instances) {
			const block = instanceToBlock(instance);
			if (block) blocks.push(block);
		}
	}

	if (blocks.length === 0) return err('no_events');
	return ok(blocks);
}

/** Convert a single expanded event instance into a busy interval. */
function instanceToBlock(instance: EventInstance): CalendarBlock | null {
	const start = instance.start;
	const end = instance.end;
	if (!(start instanceof Date) || !(end instanceof Date)) return null;

	// Full-day events (dateOnly) block the whole day in the calendar owner's local
	// time zone. node-ical represents them as local-midnight Dates; we store them
	// as floating wall-clock intervals so they stay timezone-independent.
	if (instance.isFullDay) {
		const startLocal = localWallClock(start);
		const endLocal = localWallClock(end);
		if (!startLocal || !endLocal) return null;
		return { start_ts: startLocal, end_ts: endLocal, floating: true };
	}

	// Floating DATE-TIME: no TZID, no Z. node-ical keeps the wall-clock components
	// in the host's local time; we read them back so the stored value is
	// timezone-independent (ARCHITECTURE.md §3.4).
	if (!start.tz) {
		const startLocal = localWallClock(start);
		const endLocal = localWallClock(end);
		if (!startLocal || !endLocal) return null;
		return { start_ts: startLocal, end_ts: endLocal, floating: true };
	}

	// UTC / TZID-bound: node-ical gives us an absolute instant. Store the UTC ISO
	// string (suppress milliseconds to match the app's timestamp convention).
	const startUtc = toUtcIso(start);
	const endUtc = toUtcIso(end);
	if (!startUtc || !endUtc) return null;
	return { start_ts: startUtc, end_ts: endUtc, floating: false };
}

/** Format a Date as 'YYYY-MM-DDTHH:mm:ss' using its local wall-clock components. */
function localWallClock(date: Date): string | null {
	const y = String(date.getFullYear());
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	const h = String(date.getHours()).padStart(2, '0');
	const min = String(date.getMinutes()).padStart(2, '0');
	const s = String(date.getSeconds()).padStart(2, '0');
	return `${y}-${m}-${d}T${h}:${min}:${s}`;
}

/** Format a Date as a UTC ISO string 'YYYY-MM-DDTHH:mm:ssZ'. */
function toUtcIso(date: Date): UtcTimestamp | null {
	const iso = date.toISOString();
	const match = /^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})\.\d{3}Z$/.exec(iso);
	return match ? `${match[1]}Z` : iso;
}

/** The default RRULE expansion horizon: NOW → NOW + 90 days. */
export function defaultExpansionRange(now: Date = new Date()): { from: Date; to: Date } {
	const from = now;
	const to = addDays(now.toISOString().slice(0, 10), LOOKAHEAD_DAYS);
	return { from, to: new Date(`${to}T23:59:59.999Z`) };
}
