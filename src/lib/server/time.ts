/**
 * Time-zone-aware helpers for converting local wall-clock times to UTC.
 *
 * Implements ARCHITECTURE.md §3.2: recurring daily time windows are stored as
 * local wall-clock times-of-day ('HH:mm:ss') alongside an IANA tz_id, and are
 * expanded to UTC dynamically per date. DST edge cases (ambiguous fall-back
 * times resolve to the first occurrence; invalid spring-forward times advance
 * to the first valid time) are handled by Luxon's zone conversion.
 */
import { DateTime } from 'luxon';

/** A local wall-clock time-of-day, 'HH:mm:ss'. */
export type TimeOfDay = string;

/** A calendar date, 'YYYY-MM-DD'. */
export type CalendarDate = string;

/** A UTC timestamp, 'YYYY-MM-DDTHH:mm:ssZ'. */
export type UtcTimestamp = string;

const TIME_RE = /^(\d{2}):(\d{2}):(\d{2})$/;
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isTimeOfDay(value: string): value is TimeOfDay {
	return TIME_RE.test(value);
}

export function isCalendarDate(value: string): value is CalendarDate {
	return DATE_RE.test(value);
}

/** Parse a 'HH:mm:ss' string into {hour, minute, second}. */
function parseTime(value: TimeOfDay): { hour: number; minute: number; second: number } {
	const match = TIME_RE.exec(value);
	if (!match) throw new Error(`Invalid time-of-day: ${value}`);
	return { hour: Number(match[1]), minute: Number(match[2]), second: Number(match[3]) };
}

/** Parse a 'YYYY-MM-DD' string into {year, month, day}. */
function parseDate(value: CalendarDate): { year: number; month: number; day: number } {
	const match = DATE_RE.exec(value);
	if (!match) throw new Error(`Invalid date: ${value}`);
	return { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
}

/**
 * Convert a local wall-clock time on a given date to a UTC timestamp.
 *
 * Luxon resolves DST ambiguity (fall-back repeated hour → first occurrence /
 * standard time) and invalid times (spring-forward gap → first valid time),
 * matching ARCHITECTURE.md §3.2.
 */
export function localToUtc(date: CalendarDate, time: TimeOfDay, tzId: string): UtcTimestamp {
	const { year, month, day } = parseDate(date);
	const { hour, minute, second } = parseTime(time);
	const dt = DateTime.fromObject({ year, month, day, hour, minute, second }, { zone: tzId });
	if (!dt.isValid) throw new Error(`Invalid local time in ${tzId}: ${date} ${time}`);
	const iso = dt.toUTC().toISO({ suppressMilliseconds: true });
	if (!iso) throw new Error(`Failed to convert to UTC: ${date} ${time}`);
	return iso;
}

/**
 * Expand a recurring daily window [start,end] (local wall-clock) to a UTC range
 * for a given date. Overnight windows (end < start) span midnight, so the end
 * belongs to date + 1 day (ARCHITECTURE.md §3.2).
 */
export function expandDailyWindow(
	date: CalendarDate,
	start: TimeOfDay,
	end: TimeOfDay,
	tzId: string
): { start_ts: UtcTimestamp; end_ts: UtcTimestamp } {
	const startTs = localToUtc(date, start, tzId);
	const endTs = localToUtc(date, end, tzId);
	if (end < start) {
		// Overnight window: end belongs to the next day.
		const next = DateTime.fromISO(date, { zone: tzId }).plus({ days: 1 });
		const nextDate = next.toISODate();
		if (!nextDate) throw new Error(`Failed to compute next date for ${date}`);
		return { start_ts: startTs, end_ts: localToUtc(nextDate, end, tzId) };
	}
	return { start_ts: startTs, end_ts: endTs };
}

/** Add a number of days to a 'YYYY-MM-DD' date. */
export function addDays(date: CalendarDate, days: number): CalendarDate {
	const iso = DateTime.fromISO(date, { zone: 'utc' }).plus({ days }).toISODate();
	if (!iso) throw new Error(`Failed to add days to ${date}`);
	return iso;
}

/** The IANA time zone id for the local machine (used as a fallback). */
export function localTzId(): string {
	return DateTime.local().zoneName;
}

/** Short display name (e.g. 'EDT', 'BST') for a zone at a given instant. */
export function tzShortName(tzId: string, ts: UtcTimestamp): string {
	const dt = DateTime.fromISO(ts, { zone: tzId });
	return dt.isValid ? dt.toFormat('ZZZZ') || tzId : tzId;
}

/** Format a UTC timestamp as a short time label in a given zone, e.g. '09:00'. */
export function formatTimeInZone(ts: UtcTimestamp, tzId: string): string {
	const dt = DateTime.fromISO(ts, { zone: tzId });
	return dt.isValid ? dt.toFormat('HH:mm') : ts;
}

/** Format a UTC timestamp as a 12-hour label with AM/PM in a given zone. */
export function formatTime12InZone(ts: UtcTimestamp, tzId: string): string {
	const dt = DateTime.fromISO(ts, { zone: tzId });
	return dt.isValid ? dt.toFormat('h:mm a') : ts;
}

/** Format a UTC timestamp as a day label in a given zone, e.g. 'Mon 17'. */
export function formatDayLabel(ts: UtcTimestamp, tzId: string): string {
	const dt = DateTime.fromISO(ts, { zone: tzId });
	return dt.isValid ? dt.toFormat('ccc d') : ts.slice(0, 10);
}
