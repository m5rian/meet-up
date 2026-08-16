/**
 * Free/busy computation for the heatmap grid.
 *
 * A user's final busy state for a grid cell is the union of busy sources minus
 * any manual free override (ARCHITECTURE.md §3.5):
 *
 *   busy = ( sleep_window ∪ calendar_blocks ∪ manual_busy_blocks ) − manual_free_blocks
 *
 * Any overlap between a busy block and a grid cell blocks the whole cell; gaps
 * between blocks are assumed free.
 */
import type { CalendarDate, TimeOfDay, UtcTimestamp } from './time';
import { addDays, expandDailyWindow, localToUtc } from './time';

/** A busy/free interval in absolute UTC. */
export interface UtcInterval {
	start_ts: UtcTimestamp;
	end_ts: UtcTimestamp;
}

/** A user's availability inputs for a single event. */
export interface AvailabilityInput {
	/** The user's recurring daily sleep window, or null if unset. */
	sleep: { start: TimeOfDay; end: TimeOfDay } | null;
	/** The user's IANA time zone id (used to expand the sleep window). */
	tz_id: string;
	/** Busy intervals from the user's calendar. */
	calendar_blocks: UtcInterval[];
	/** Manual busy overrides (busy: 1). */
	manual_busy: UtcInterval[];
	/** Manual free overrides (busy: 0). */
	manual_free: UtcInterval[];
}

/**
 * Expand the user's sleep window into UTC intervals for each day in the event's
 * date range (inclusive), using the DST-aware expansion in `expandDailyWindow`.
 */
export function expandSleepWindow(
	sleep: { start: TimeOfDay; end: TimeOfDay },
	tzId: string,
	dateRangeStart: CalendarDate,
	dateRangeEnd: CalendarDate
): UtcInterval[] {
	const out: UtcInterval[] = [];
	let date = dateRangeStart;
	while (date <= dateRangeEnd) {
		const { start_ts, end_ts } = expandDailyWindow(date, sleep.start, sleep.end, tzId);
		out.push({ start_ts, end_ts });
		date = addDays(date, 1);
	}
	return out;
}

/** True when interval `a` overlaps interval `b` (inclusive of touching edges). */
export function overlaps(a: UtcInterval, b: UtcInterval): boolean {
	return a.start_ts < b.end_ts && b.start_ts < a.end_ts;
}

/**
 * Compute a user's final busy intervals for an event, given the availability
 * inputs and the event's date range. Returns the merged busy intervals.
 */
export function computeBusyIntervals(
	input: AvailabilityInput,
	dateRangeStart: CalendarDate,
	dateRangeEnd: CalendarDate
): UtcInterval[] {
	const sleepBlocks =
		input.sleep && input.tz_id
			? expandSleepWindow(input.sleep, input.tz_id, dateRangeStart, dateRangeEnd)
			: [];

	const busySources: UtcInterval[] = [
		...sleepBlocks,
		...input.calendar_blocks,
		...input.manual_busy
	];

	// Union of busy sources.
	const union = mergeIntervals(busySources);

	// Subtract manual free overrides.
	const free = mergeIntervals(input.manual_free);
	const result: UtcInterval[] = [];
	for (const block of union) {
		result.push(...subtractInterval(block, free));
	}
	return mergeIntervals(result);
}

/** Merge a list of (possibly overlapping) intervals into a sorted, disjoint list. */
export function mergeIntervals(intervals: UtcInterval[]): UtcInterval[] {
	const sorted = [...intervals].sort((a, b) =>
		a.start_ts < b.start_ts ? -1 : a.start_ts > b.start_ts ? 1 : 0
	);
	const out: UtcInterval[] = [];
	for (const iv of sorted) {
		const last = out[out.length - 1];
		if (out.length > 0 && iv.start_ts <= last.end_ts) {
			if (iv.end_ts > last.end_ts) last.end_ts = iv.end_ts;
		} else {
			out.push({ ...iv });
		}
	}
	return out;
}

/** Subtract a set of free intervals from a single busy interval. */
function subtractInterval(busy: UtcInterval, free: UtcInterval[]): UtcInterval[] {
	const out: UtcInterval[] = [];
	let cursor = busy.start_ts;
	for (const f of free) {
		if (f.end_ts <= cursor) continue;
		if (f.start_ts >= busy.end_ts) break;
		if (f.start_ts > cursor) {
			out.push({ start_ts: cursor, end_ts: f.start_ts });
		}
		if (f.end_ts > cursor) cursor = f.end_ts;
	}
	if (cursor < busy.end_ts) {
		out.push({ start_ts: cursor, end_ts: busy.end_ts });
	}
	return out;
}

/** True when the given interval overlaps any busy block. */
export function isBusyAt(interval: UtcInterval, busyBlocks: UtcInterval[]): boolean {
	return busyBlocks.some((b) => overlaps(b, interval));
}

/**
 * Convert a local wall-clock time on a date to a UTC timestamp, re-exported for
 * callers that build grid cells.
 */
export { localToUtc };
