/**
 * Assembles the full heatmap grid for an event, in the viewer's local time zone.
 *
 * The grid is participant-centric (ARCHITECTURE.md §3.3): rows and day columns
 * are rendered in the viewer's local time zone, while the organizer's daily
 * availability window is projected onto the viewer's local axis.
 */
import { DateTime } from 'luxon';
import { and, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { calendarBlocks, events, manualBlocks, participants, users } from './db/schema';
import type {
	HeatmapData,
	HeatmapDay,
	HeatmapRow,
	HeatmapSlot,
	ParticipantSummary
} from '$lib/types';
import type { CalendarDate, TimeOfDay, UtcTimestamp } from './time';
import {
	addDays,
	expandDailyWindow,
	formatDayLabel,
	formatTime12InZone,
	formatTimeInZone,
	localToUtc,
	tzShortName
} from './time';
import { computeBusyIntervals, isBusyAt, type UtcInterval } from './free-busy';

export interface EventRow {
	id: string;
	slug: string;
	title: string;
	visibility: 'private' | 'link';
	organizer_id: string;
	tz_id: string;
	date_range_start: CalendarDate;
	date_range_end: CalendarDate;
	time_window_start: TimeOfDay;
	time_window_end: TimeOfDay;
	slot_granularity_minutes: number;
	finalized_start_ts: string | null;
	finalized_end_ts: string | null;
}

interface ParticipantAvailability {
	participant: ParticipantSummary;
	sleep: { start: TimeOfDay; end: TimeOfDay } | null;
	tz_id: string;
	calendar_blocks: UtcInterval[];
	manual_busy: UtcInterval[];
	manual_free: UtcInterval[];
}

/**
 * Load an event by slug. Returns null when not found.
 */
export function getEventBySlug(slug: string): EventRow | null {
	const row = db.select().from(events).where(eq(events.slug, slug)).get();
	if (!row) return null;
	return {
		id: row.id,
		slug: row.slug,
		title: row.title,
		visibility: row.visibility,
		organizer_id: row.organizer_id,
		tz_id: row.tz_id,
		date_range_start: row.date_range_start,
		date_range_end: row.date_range_end,
		time_window_start: row.time_window_start,
		time_window_end: row.time_window_end,
		slot_granularity_minutes: row.slot_granularity_minutes,
		finalized_start_ts: row.finalized_start_ts,
		finalized_end_ts: row.finalized_end_ts
	};
}

/**
 * Load the participants of an event with their availability inputs, plus the
 * current user's participant row (if any).
 */
function loadParticipants(
	eventId: string,
	viewerId: string
): {
	availabilities: ParticipantAvailability[];
	viewerParticipantId: string | null;
	viewerHasOpened: boolean;
} {
	const participantRows = db
		.select({
			id: participants.id,
			event_id: participants.event_id,
			user_id: participants.user_id,
			has_opened: participants.has_opened,
			created_at: participants.created_at
		})
		.from(participants)
		.where(eq(participants.event_id, eventId))
		.all();

	const userIds = participantRows.map((p) => p.user_id);
	const userRows = userIds.length
		? db
				.select({
					id: users.id,
					username: users.username,
					profile_picture: users.profile_picture,
					tz_id: users.tz_id,
					sleep_start: users.sleep_start,
					sleep_end: users.sleep_end
				})
				.from(users)
				.where(inArray(users.id, userIds))
				.all()
		: [];
	const userById = new Map(userRows.map((u) => [u.id, u]));

	const participantIds = participantRows.map((p) => p.id);
	const manualRows = participantIds.length
		? db
				.select({
					participant_id: manualBlocks.participant_id,
					start_ts: manualBlocks.start_ts,
					end_ts: manualBlocks.end_ts,
					busy: manualBlocks.busy
				})
				.from(manualBlocks)
				.where(inArray(manualBlocks.participant_id, participantIds))
				.all()
		: [];
	const manualByParticipant = new Map<string, { busy: UtcInterval[]; free: UtcInterval[] }>();
	for (const m of manualRows) {
		const entry = manualByParticipant.get(m.participant_id) ?? { busy: [], free: [] };
		if (m.busy) entry.busy.push({ start_ts: m.start_ts, end_ts: m.end_ts });
		else entry.free.push({ start_ts: m.start_ts, end_ts: m.end_ts });
		manualByParticipant.set(m.participant_id, entry);
	}

	const calendarRows = userIds.length
		? db
				.select({
					user_id: calendarBlocks.user_id,
					start_ts: calendarBlocks.start_ts,
					end_ts: calendarBlocks.end_ts,
					is_floating: calendarBlocks.is_floating
				})
				.from(calendarBlocks)
				.where(inArray(calendarBlocks.user_id, userIds))
				.all()
		: [];
	// Floating blocks are stored as wall-clock times; convert them to UTC in the
	// calendar owner's time zone so they can be compared against the UTC grid
	// slots (ARCHITECTURE.md §3.4).
	const tzByUser = new Map(userRows.map((u) => [u.id, u.tz_id ?? 'UTC']));
	const calendarByUser = new Map<string, UtcInterval[]>();
	for (const c of calendarRows) {
		const list = calendarByUser.get(c.user_id) ?? [];
		if (c.is_floating) {
			const converted = floatingToUtc(c.start_ts, c.end_ts, tzByUser.get(c.user_id) ?? 'UTC');
			if (converted) list.push(converted);
		} else {
			list.push({ start_ts: c.start_ts, end_ts: c.end_ts });
		}
		calendarByUser.set(c.user_id, list);
	}

	const availabilities: ParticipantAvailability[] = [];
	let viewerParticipantId: string | null = null;
	let viewerHasOpened = false;

	for (const p of participantRows) {
		const user = userById.get(p.user_id);
		if (!user) continue;
		const manual = manualByParticipant.get(p.id) ?? { busy: [], free: [] };
		availabilities.push({
			participant: {
				id: p.id,
				user_id: p.user_id,
				username: user.username,
				profile_picture: user.profile_picture,
				has_opened: p.has_opened,
				is_organizer: false
			},
			sleep:
				user.sleep_start && user.sleep_end
					? { start: user.sleep_start, end: user.sleep_end }
					: null,
			tz_id: user.tz_id ?? 'UTC',
			calendar_blocks: calendarByUser.get(p.user_id) ?? [],
			manual_busy: manual.busy,
			manual_free: manual.free
		});
		if (p.user_id === viewerId) {
			viewerParticipantId = p.id;
			viewerHasOpened = p.has_opened;
		}
	}

	return { availabilities, viewerParticipantId, viewerHasOpened };
}

/**
 * Build the heatmap data for an event as seen by `viewerId` in `viewerTzId`.
 */
export function buildHeatmap(event: EventRow, viewerId: string, viewerTzId: string): HeatmapData {
	const { availabilities, viewerParticipantId, viewerHasOpened } = loadParticipants(
		event.id,
		viewerId
	);

	const isOrganizer = event.organizer_id === viewerId;
	const hasJoined = viewerParticipantId !== null;
	const isPendingInvite = hasJoined && !viewerHasOpened && event.visibility === 'private';

	// Which participants are counted in the grid?
	//  - private events: only those who have opened the invite (has_opened = 1)
	//  - link events: everyone who has joined
	const counted = availabilities.filter((a) => {
		if (event.visibility === 'private') return a.participant.has_opened;
		return true;
	});

	// Build the grid in the viewer's local time zone.
	const days = buildDays(event.date_range_start, event.date_range_end, viewerTzId);
	const rows = buildRows(event, viewerTzId);

	const cells: HeatmapSlot[][] = [];
	for (const row of rows) {
		const rowCells: HeatmapSlot[] = [];
		for (const day of days) {
			// The cell's actual UTC interval = viewer-local midnight of that day + row offset.
			const slot: UtcInterval = {
				start_ts: addMinutesUtc(day.start_ts, row.offset_minutes),
				end_ts: addMinutesUtc(day.start_ts, row.offset_minutes + row.duration_minutes)
			};
			const free: ParticipantSummary[] = [];
			const busy: ParticipantSummary[] = [];
			const notResponded: ParticipantSummary[] = [];
			for (const a of counted) {
				const busyBlocks = computeBusyIntervals(
					{
						sleep: a.sleep,
						tz_id: a.tz_id,
						calendar_blocks: a.calendar_blocks,
						manual_busy: a.manual_busy,
						manual_free: a.manual_free
					},
					event.date_range_start,
					event.date_range_end
				);
				if (isBusyAt(slot, busyBlocks)) busy.push(a.participant);
				else free.push(a.participant);
			}
			// Not-responded participants (pending invites on private events) are
			// excluded from the grid entirely and shown separately.
			for (const a of availabilities) {
				if (!counted.includes(a)) notResponded.push(a.participant);
			}
			const freeRatio =
				free.length + busy.length > 0 ? free.length / (free.length + busy.length) : 0;
			rowCells.push({ free_ratio: freeRatio, free, busy, not_responded: notResponded });
		}
		cells.push(rowCells);
	}

	// The organizer's daily availability window projected onto the viewer's axis.
	const organizerWindow = buildOrganizerWindow(event, viewerTzId);

	// The current user's own blocks, for the editing overlay.
	const viewerAvail = availabilities.find((a) => a.participant.id === viewerParticipantId);
	const mySleepBlocks = viewerAvail?.sleep
		? expandSleepWindowForEvent(viewerAvail.sleep, viewerAvail.tz_id, event)
		: [];
	const myCalendarBlocks = viewerAvail?.calendar_blocks ?? [];
	const myManualBusy = viewerAvail?.manual_busy ?? [];
	const myManualFree = viewerAvail?.manual_free ?? [];
	const myBusyBlocks = viewerAvail
		? computeBusyIntervals(
				{
					sleep: viewerAvail.sleep,
					tz_id: viewerAvail.tz_id,
					calendar_blocks: viewerAvail.calendar_blocks,
					manual_busy: viewerAvail.manual_busy,
					manual_free: viewerAvail.manual_free
				},
				event.date_range_start,
				event.date_range_end
			)
		: [];

	return {
		event_id: event.id,
		title: event.title,
		visibility: event.visibility,
		can_edit: hasJoined && !isPendingInvite,
		is_organizer: isOrganizer,
		has_joined: hasJoined,
		is_pending_invite: isPendingInvite,
		participant_id: viewerParticipantId,
		days,
		rows,
		cells,
		participants: counted.map((a) => a.participant),
		organizer_window: organizerWindow,
		my_manual_busy: myManualBusy.map((b) => [b.start_ts, b.end_ts]),
		my_manual_free: myManualFree.map((b) => [b.start_ts, b.end_ts]),
		my_sleep_blocks: mySleepBlocks.map((b) => [b.start_ts, b.end_ts]),
		my_calendar_blocks: myCalendarBlocks.map((b) => [b.start_ts, b.end_ts]),
		my_busy_blocks: myBusyBlocks.map((b) => [b.start_ts, b.end_ts])
	};
}

/** Build the day columns in the viewer's local time zone. */
function buildDays(start: CalendarDate, end: CalendarDate, viewerTzId: string): HeatmapDay[] {
	const days: HeatmapDay[] = [];
	let date = start;
	while (date <= end) {
		const dayStart = localToUtc(date, '00:00:00', viewerTzId);
		const dayEnd = localToUtc(addDays(date, 1), '00:00:00', viewerTzId);
		days.push({
			date,
			label: formatDayLabel(dayStart, viewerTzId),
			start_ts: dayStart,
			end_ts: dayEnd
		});
		date = addDays(date, 1);
	}
	return days;
}

/**
 * Build the time rows for a single day, in the viewer's local time zone.
 *
 * Rows are expressed as offsets from the viewer's local midnight so the same
 * clock times apply to every day column (the day columns are handled
 * separately by `buildDays`).
 */
function buildRows(event: EventRow, viewerTzId: string): HeatmapRow[] {
	const granularity = event.slot_granularity_minutes;
	const rows: HeatmapRow[] = [];
	// Use the first day of the range as the reference date for generating labels.
	const refDate = event.date_range_start;
	const dayStart = localToUtc(refDate, '00:00:00', viewerTzId);
	const dayEnd = localToUtc(addDays(refDate, 1), '00:00:00', viewerTzId);
	let offset = 0;
	while (offset < 24 * 60) {
		const slotStart = addMinutesUtc(dayStart, offset);
		if (slotStart >= dayEnd) break;
		rows.push({
			offset_minutes: offset,
			duration_minutes: granularity,
			label: formatTimeInZone(slotStart, viewerTzId)
		});
		offset += granularity;
	}
	return rows;
}

/**
 * Convert a floating (wall-clock) calendar block to a UTC interval in the
 * calendar owner's time zone. Floating times carry no offset, so they are
 * interpreted as local wall-clock times in `tzId` (ARCHITECTURE.md §3.4).
 * Returns null when the wall-clock strings are malformed.
 */
function floatingToUtc(startWall: string, endWall: string, tzId: string): UtcInterval | null {
	const start = wallClockToUtc(startWall, tzId);
	const end = wallClockToUtc(endWall, tzId);
	if (!start || !end) return null;
	return { start_ts: start, end_ts: end };
}

/** Convert a 'YYYY-MM-DDTHH:mm:ss' wall-clock string to a UTC timestamp in `tzId`. */
function wallClockToUtc(wall: string, tzId: string): UtcTimestamp | null {
	const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})$/.exec(wall);
	if (!match) return null;
	return localToUtc(match[1], match[2], tzId);
}

/** Add a number of minutes to a UTC ISO timestamp. */
function addMinutesUtc(ts: UtcTimestamp, minutes: number): UtcTimestamp {
	const iso = DateTime.fromISO(ts, { zone: 'utc' })
		.plus({ minutes })
		.toISO({ suppressMilliseconds: true });
	if (!iso) throw new Error(`Failed to add minutes to ${ts}`);
	return iso;
}

/** Project the organizer's daily availability window onto the viewer's local axis. */
function buildOrganizerWindow(
	event: EventRow,
	viewerTzId: string
): HeatmapData['organizer_window'] {
	// Use the first day of the range as the reference date for the projection.
	const refDate = event.date_range_start;
	const { start_ts, end_ts } = expandDailyWindow(
		refDate,
		event.time_window_start,
		event.time_window_end,
		event.tz_id
	);
	const startLabel = formatTimeInZone(start_ts, viewerTzId);
	const endLabel = formatTimeInZone(end_ts, viewerTzId);
	const refStart = formatTime12InZone(start_ts, event.tz_id);
	const refEnd = formatTime12InZone(end_ts, event.tz_id);
	const tzShort = tzShortName(event.tz_id, start_ts);
	return {
		start_label: startLabel,
		end_label: endLabel,
		reference_label: `${refStart} – ${refEnd} ${tzShort}`
	};
}

/** Expand the sleep window for every day in the event's range. */
function expandSleepWindowForEvent(
	sleep: { start: TimeOfDay; end: TimeOfDay },
	tzId: string,
	event: EventRow
): UtcInterval[] {
	const out: UtcInterval[] = [];
	let date = event.date_range_start;
	while (date <= event.date_range_end) {
		const { start_ts, end_ts } = expandDailyWindow(date, sleep.start, sleep.end, tzId);
		out.push({ start_ts, end_ts });
		date = addDays(date, 1);
	}
	return out;
}

/** Load the organizer's username for an event. */
export function getOrganizerUsername(organizerId: string): string | null {
	const row = db
		.select({ username: users.username })
		.from(users)
		.where(eq(users.id, organizerId))
		.get();
	return row?.username ?? null;
}

/** Check whether a user is a participant of an event. */
export function isParticipant(eventId: string, userId: string): boolean {
	const row = db
		.select({ id: participants.id })
		.from(participants)
		.where(and(eq(participants.event_id, eventId), eq(participants.user_id, userId)))
		.get();
	return row !== undefined;
}

/** Mark a participant as having opened the event (has_opened = 1). */
export function markOpened(eventId: string, userId: string): void {
	db.update(participants)
		.set({ has_opened: true })
		.where(and(eq(participants.event_id, eventId), eq(participants.user_id, userId)))
		.run();
}
