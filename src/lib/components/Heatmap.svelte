<script lang="ts">
	import { enhance } from '$app/forms';
	import { DateTime } from 'luxon';
	import type { HeatmapData, HeatmapSlot } from '$lib/types';
	import { Button } from './';
	import { EditIcon, CloseIcon } from './icons';
	import ParticipantList from './ParticipantList.svelte';
	import HeatmapGrid from './HeatmapGrid.svelte';

	interface Props {
		heatmap: HeatmapData;
		/** When true and the viewer is the organizer, cells can be clicked to select the final slot. */
		finalizeMode?: boolean;
		/** The selected final slot start (UTC ISO), highlighted when in finalize mode. */
		selectedStart?: string | null;
		onSelectSlot?: (start: string, end: string) => void;
	}

	let { heatmap, finalizeMode = false, selectedStart = null, onSelectSlot }: Props = $props();

	let editing = $state(false);
	// Cells the user has marked busy in editing mode, keyed by `${rowIdx}:${dayIdx}`.
	let busyCells = $state<Record<string, boolean>>({});
	let hovered = $state<{ row: number; day: number } | null>(null);
	let saveError = $state<string | null>(null);

	function cellKey(row: number, day: number): string {
		return String(row) + ':' + String(day);
	}

	// The cell's UTC interval = viewer-local midnight of that day + row offset.
	function cellInterval(row: number, day: number): [string, string] {
		const dayStart = heatmap.days[day].start_ts;
		const start = addMinutesUtc(dayStart, heatmap.rows[row].offset_minutes);
		const end = addMinutesUtc(
			dayStart,
			heatmap.rows[row].offset_minutes + heatmap.rows[row].duration_minutes
		);
		return [start, end];
	}

	function addMinutesUtc(ts: string, minutes: number): string {
		const iso = DateTime.fromISO(ts, { zone: 'utc' })
			.plus({ minutes })
			.toISO({ suppressMilliseconds: true });
		return iso ?? ts;
	}

	// The cells that are busy "by default" (sleep ∪ calendar), used to compute
	// the manual override deltas on save.
	function autoBusyCells(): Record<string, boolean> {
		const map: Record<string, boolean> = {};
		const blocks = [...heatmap.my_sleep_blocks, ...heatmap.my_calendar_blocks];
		for (let r = 0; r < heatmap.rows.length; r++) {
			for (let d = 0; d < heatmap.days.length; d++) {
				const [cellStart, cellEnd] = cellInterval(r, d);
				if (blocks.some(([s, e]) => s < cellEnd && cellStart < e)) {
					map[cellKey(r, d)] = true;
				}
			}
		}
		return map;
	}

	function enterEdit(): void {
		// Pre-fill from the user's final busy blocks (sleep ∪ calendar ∪ manual busy − manual free).
		const map: Record<string, boolean> = {};
		for (let r = 0; r < heatmap.rows.length; r++) {
			for (let d = 0; d < heatmap.days.length; d++) {
				const [cellStart, cellEnd] = cellInterval(r, d);
				if (heatmap.my_busy_blocks.some(([s, e]) => s < cellEnd && cellStart < e)) {
					map[cellKey(r, d)] = true;
				}
			}
		}
		busyCells = map;
		saveError = null;
		editing = true;
	}

	function toggleCell(row: number, day: number): void {
		const key = cellKey(row, day);
		busyCells[key] = !busyCells[key];
	}

	// Compute the manual override deltas and submit them.
	function onSave(event: SubmitEvent): void {
		const auto = autoBusyCells();
		const manualBusy: [string, string][] = [];
		const manualFree: [string, string][] = [];
		for (const key of Object.keys(busyCells)) {
			if (busyCells[key] && !auto[key]) {
				const [r, d] = key.split(':').map(Number);
				manualBusy.push(cellInterval(r, d));
			}
		}
		for (const key of Object.keys(auto)) {
			if (!busyCells[key]) {
				const [r, d] = key.split(':').map(Number);
				manualFree.push(cellInterval(r, d));
			}
		}
		const form = event.currentTarget as HTMLFormElement;
		const busyInput = form.querySelector<HTMLInputElement>('input[name="busy_cells"]');
		const freeInput = form.querySelector<HTMLInputElement>('input[name="free_cells"]');
		if (busyInput) busyInput.value = JSON.stringify(manualBusy);
		if (freeInput) freeInput.value = JSON.stringify(manualFree);
	}

	function hoveredSlot(): HeatmapSlot | null {
		if (!hovered) return null;
		return heatmap.cells[hovered.row]?.[hovered.day] ?? null;
	}

	let hoveredSlotValue = $derived(hoveredSlot());

	// The participant ids that are unavailable in the hovered slot (busy or not
	// responded). When nothing is hovered, all members stay fully visible.
	let unavailableIds = $derived.by(() => {
		const slot = hoveredSlotValue;
		if (!slot) return new Set<string>();
		return new Set([...slot.busy, ...slot.not_responded].map((p) => p.id));
	});

	// When in finalize mode, clicking a cell reports its UTC interval upward.
	function handleSelect(row: number, day: number): void {
		if (!finalizeMode || !onSelectSlot) return;
		const [start, end] = cellInterval(row, day);
		onSelectSlot(start, end);
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div class="flex items-center gap-3">
			<h2 class="text-lg font-semibold text-gray-900">{heatmap.title}</h2>
			{#if heatmap.organizer_window}
				<span class="rounded bg-gray-100 px-2 py-1 text-xs text-gray-600">
					Organizer window: {heatmap.organizer_window.reference_label}
					({heatmap.organizer_window.start_label} – {heatmap.organizer_window.end_label} your time)
				</span>
			{/if}
		</div>
		{#if heatmap.can_edit}
			{#if editing}
				<form method="POST" action="?/update-availability" use:enhance onsubmit={onSave}>
					<input type="hidden" name="busy_cells" value="" />
					<input type="hidden" name="free_cells" value="" />
					<div class="flex items-center gap-2">
						<Button type="submit">Save</Button>
						<Button type="button" variant="secondary" onclick={() => (editing = false)}>
							<CloseIcon class="h-4 w-4" />
							Cancel
						</Button>
					</div>
				</form>
			{:else}
				<Button type="button" variant="secondary" onclick={enterEdit}>
					<EditIcon class="h-4 w-4" />
					Edit availability
				</Button>
			{/if}
		{/if}
	</div>

	{#if saveError}
		<div class="rounded-md bg-red-50 p-3 text-sm text-red-700">{saveError}</div>
	{/if}

	{#if heatmap.is_pending_invite}
		<div class="rounded-md bg-amber-50 p-3 text-sm text-amber-800">
			You have a pending invite. Open the invite to mark your availability.
		</div>
	{:else if !heatmap.has_joined && heatmap.visibility === 'link'}
		<div class="rounded-md bg-blue-50 p-3 text-sm text-blue-800">
			You're viewing this event without joining. Join to mark your availability.
		</div>
	{/if}

	<div class="flex gap-6">
		<HeatmapGrid
			{heatmap}
			{editing}
			selectable={finalizeMode && !editing}
			{selectedStart}
			{busyCells}
			onToggle={toggleCell}
			onSelect={handleSelect}
			onHover={(row: number, day: number) => (hovered = { row, day })}
			onLeave={() => (hovered = null)}
		/>
		<ParticipantList participants={heatmap.participants} {unavailableIds} class="shrink-0" />
	</div>
</div>
