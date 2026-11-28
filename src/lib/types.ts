/**
 * Shared domain types used across server loaders and Svelte components.
 *
 * These live under `src/lib` so both the server (`src/lib/server`) and the UI
 * (`src/lib/components`) can import them without a server-only import chain
 * (see UI_COMPONENTS.md §3).
 */

/** A user as exposed to the UI (never includes password_hash or ics_url_enc). */
export interface UserProfile {
	id: string;
	username: string;
	profile_picture: string | null;
	tz_id: string | null;
	sleep_start: string | null; // local wall-clock 'HH:mm:ss'
	sleep_end: string | null; // local wall-clock 'HH:mm:ss'
}

/** The current user's calendar sync status (from the `sync_jobs` table). */
export interface SyncStatus {
	last_success_at: Date | null;
	last_attempt_at: Date | null;
	last_error: string | null;
}

/** A calendar the user has connected (a live ICS URL or an uploaded .ics file). */
export interface CalendarConnection {
	id: string;
	name: string;
	source: 'url' | 'file';
	/** The decrypted live URL, when this is a URL calendar. */
	url: string | null;
	/** This calendar's sync status (per-calendar, from `sync_jobs`). */
	syncStatus: SyncStatus;
}

/** A user as shown in the invite picker (username + picture). */
export interface UserSummary {
	id: string;
	username: string;
	profile_picture: string | null;
}

export type EventVisibility = 'private' | 'link';

/** An event row as loaded for the events list. */
export interface EventSummary {
	id: string;
	slug: string;
	title: string;
	visibility: EventVisibility;
	organizer_id: string;
	organizer_username: string;
	tz_id: string;
	date_range_start: string; // 'YYYY-MM-DD'
	date_range_end: string; // 'YYYY-MM-DD'
	time_window_start: string; // local wall-clock 'HH:mm:ss'
	time_window_end: string; // local wall-clock 'HH:mm:ss'
	slot_granularity_minutes: number;
	finalized_start_ts: string | null;
	finalized_end_ts: string | null;
	created_at: number;
	/** True when the current user is the organizer. */
	is_organizer: boolean;
	/** True when the current user has a participants row for this event. */
	joined: boolean;
}

/** A participant on an event, with their availability-relevant data. */
export interface ParticipantSummary {
	id: string;
	user_id: string;
	username: string;
	profile_picture: string | null;
	has_opened: boolean;
	/** True when this participant is the event organizer. */
	is_organizer: boolean;
}

/** A single grid cell's availability breakdown for the hover tooltip. */
export interface HeatmapSlot {
	/** 0..1 fraction of counted participants who are free. */
	free_ratio: number;
	free: ParticipantSummary[];
	busy: ParticipantSummary[];
	not_responded: ParticipantSummary[];
}

/** A day column in the heatmap grid. */
export interface HeatmapDay {
	/** 'YYYY-MM-DD' in the viewer's local time zone. */
	date: string;
	/** Display label, e.g. 'Mon 17'. */
	label: string;
	/** The viewer-local start of the day as a UTC ISO timestamp. */
	start_ts: string;
	/** The viewer-local end of the day as a UTC ISO timestamp. */
	end_ts: string;
}

/** A row (time slot) in the heatmap grid. */
export interface HeatmapRow {
	/** Minutes from the viewer's local midnight to this slot's start. */
	offset_minutes: number;
	/** Slot duration in minutes (the event's granularity). */
	duration_minutes: number;
	/** Display label, e.g. '09:00'. */
	label: string;
}

/** The organizer's daily availability window projected into the viewer's local axis. */
export interface OrganizerWindow {
	/** Viewer-local start time-of-day, e.g. '14:00'. */
	start_label: string;
	/** Viewer-local end time-of-day, e.g. '23:00'. */
	end_label: string;
	/** Human-readable reference, e.g. '9:00 AM – 6:00 PM EDT'. */
	reference_label: string;
	/** The window's start offset in minutes from viewer-local midnight, aligned to grid row offsets. */
	start_offset_minutes: number;
	/** The window's end offset in minutes from viewer-local midnight, aligned to grid row offsets. */
	end_offset_minutes: number;
}

/** The fully-shaped data the heatmap component renders. */
export interface HeatmapData {
	event_id: string;
	title: string;
	visibility: EventVisibility;
	/** True when the current user can edit availability (they are a counted participant). */
	can_edit: boolean;
	/** True when the current user is the organizer. */
	is_organizer: boolean;
	/** True when the current user has joined/opened this event. */
	has_joined: boolean;
	/** True when the current user is a pending invite on a private event. */
	is_pending_invite: boolean;
	/** The current user's participant id, when they have one. */
	participant_id: string | null;
	days: HeatmapDay[];
	rows: HeatmapRow[];
	/** cells[rowIndex][dayIndex] */
	cells: HeatmapSlot[][];
	/** The counted participants shown in the grid, used for the member list. */
	participants: ParticipantSummary[];
	organizer_window: OrganizerWindow | null;
	/** The current user's manual busy blocks for this event, as [start,end] UTC ISO pairs. */
	my_manual_busy: [string, string][];
	/** The current user's manual free blocks for this event, as [start,end] UTC ISO pairs. */
	my_manual_free: [string, string][];
	/** The current user's sleep window projected onto this event, as [start,end] UTC ISO pairs. */
	my_sleep_blocks: [string, string][];
	/** The current user's calendar busy blocks clipped to this event, as [start,end] UTC ISO pairs. */
	my_calendar_blocks: [string, string][];
	/** The current user's final busy blocks for this event (union minus manual free). */
	my_busy_blocks: [string, string][];
	/** The finalized meeting's start timestamp (UTC ISO), or null when not yet finalized. */
	finalized_start_ts: string | null;
}
