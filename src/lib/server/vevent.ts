/**
 * Shared ICS (iCalendar) generation for finalized meetings (ARCHITECTURE.md §5,
 * PLAN.md Phase 3). The same helper powers the per-event ".ics invite" download
 * and will be reused by the per-user calendar feed (Phase 4).
 *
 * Only finalized one-off meetings are emitted: start/end as UTC, SUMMARY = title,
 * UID = event id, STATUS:CONFIRMED, and an organizer reference. No LOCATION
 * (decision: omitted). No RRULE (single instance).
 */
import type { UtcTimestamp } from './time';

export interface VEventData {
	/** The event id, used as the VEVENT UID. */
	id: string;
	/** The event title. */
	title: string;
	/** Meeting start, a UTC ISO string ('YYYY-MM-DDTHH:mm:ssZ'). */
	start_ts: UtcTimestamp;
	/** Meeting end, a UTC ISO string ('YYYY-MM-DDTHH:mm:ssZ'). */
	end_ts: UtcTimestamp;
	/** Display name of the organizer (used as the ORGANIZER CN). */
	organizer_name: string;
}

/** Convert 'YYYY-MM-DDTHH:mm:ssZ' to the ICS UTC form 'YYYYMMDDTHHMMSSZ'. */
function toIcsUtc(ts: UtcTimestamp): string {
	// Strip the '-' and ':' separators; keep the trailing 'Z'.
	return ts.replace(/[-:]/g, '').replace(/\.\d{3}(?=Z$)/, '');
}

/** Escape text values per RFC 5545 (backslash, semicolon, comma, newline). */
function escapeText(value: string): string {
	return value
		.replace(/\\/g, '\\\\')
		.replace(/;/g, '\\;')
		.replace(/,/g, '\\,')
		.replace(/\r?\n/g, '\\n');
}

/**
 * Fold long content lines at 75 octets, prefixing continuations with a single
 * space per RFC 5545. Short lines pass through untouched.
 */
function foldLines(block: string): string {
	return block
		.split('\n')
		.map((line) => {
			if (line.length <= 75) return line;
			const folded: string[] = [];
			let rest = line;
			folded.push(rest.slice(0, 75));
			rest = rest.slice(75);
			while (rest.length > 0) {
				folded.push(' ' + rest.slice(0, 74));
				rest = rest.slice(74);
			}
			return folded.join('\n');
		})
		.join('\n');
}

/** Build a single VEVENT block for a finalized meeting. */
export function buildVevent(ve: VEventData): string {
	const lines = [
		'BEGIN:VEVENT',
		`UID:${ve.id}`,
		`DTSTART:${toIcsUtc(ve.start_ts)}`,
		`DTEND:${toIcsUtc(ve.end_ts)}`,
		`SUMMARY:${escapeText(ve.title)}`,
		'STATUS:CONFIRMED',
		// No email on file, so use a neutral mailto; the display name carries the
		// organizer reference that calendar clients show.
		`ORGANIZER;CN=${escapeText(ve.organizer_name)}:mailto:no-reply@find-time.local`,
		'END:VEVENT'
	];
	return foldLines(lines.join('\n'));
}

/** Wrap one or more VEVENT blocks into a complete, valid VCALENDAR payload. */
export function wrapCalendar(vevents: string[]): string {
	const body = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Find-Time//Finalized meetings//EN',
		'CALSCALE:GREGORIAN',
		...vevents,
		'END:VCALENDAR'
	];
	return body.join('\r\n') + '\r\n';
}

/** Build the full .ics payload for a single finalized meeting. */
export function buildSingleEventIcs(ve: VEventData): string {
	return wrapCalendar([buildVevent(ve)]);
}
