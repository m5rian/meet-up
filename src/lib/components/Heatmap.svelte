<script lang="ts">
	import { enhance } from '$app/forms';
	import type { HeatmapData, HeatmapSlot } from '$lib/types';
	import { Button } from './';
	import { EditIcon, CloseIcon } from './icons';
	import ParticipantList from './ParticipantList.svelte';

	interface Props {
		heatmap: HeatmapData;
	}

	let { heatmap }: Props = $props();

	let editing = $state(false);
	// Cells the user has marked busy in editing mode, keyed by `${rowIdx}:${dayIdx}`.
	let busyCells = $state<Record<string, boolean>>({});
	let hovered = $state<{ row: number; day: number } | null>(null);
	let saveError = $state<string | null>(null);

	function cellKey(row: number, day: number): string {
		return String(row) + ':' + String(day);
	}

	// The cells that are busy "by default" (sleep ∪ calendar), used to compute
	// the manual override deltas on save.
	function autoBusyCells(): Record<string, boolean> {
		const map: Record<string, boolean> = {};
		const blocks = [...heatmap.my_sleep_blocks, ...heatmap.my_calendar_blocks];
		for (let r = 0; r < heatmap.rows.length; r++) {
			for (let d = 0; d < heatmap.days.length; d++) {
				const cellStart = heatmap.rows[r].start_ts;
				const cellEnd = heatmap.rows[r].end_ts;
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
				const cellStart = heatmap.rows[r].start_ts;
				const cellEnd = heatmap.rows[r].end_ts;
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
				const [r] = key.split(':').map(Number);
				manualBusy.push([heatmap.rows[r].start_ts, heatmap.rows[r].end_ts]);
			}
		}
		for (const key of Object.keys(auto)) {
			if (!busyCells[key]) {
				const [r] = key.split(':').map(Number);
				manualFree.push([heatmap.rows[r].start_ts, heatmap.rows[r].end_ts]);
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

	<div class="overflow-x-auto">
		<table class="border-collapse">
			<thead>
				<tr>
					<th class="sticky left-0 bg-white px-2 py-1 text-left text-xs font-medium text-gray-500"
					></th>
					{#each heatmap.days as day (day.date)}
						<th class="px-1 py-1 text-center text-xs font-medium text-gray-500">{day.label}</th>
					{/each}
				</tr>
			</thead>
			<tbody>
				{#each heatmap.rows as row, r (row.start_ts)}
					<tr>
						<th
							class="sticky left-0 bg-white px-2 py-1 text-right text-xs font-medium text-gray-500"
						>
							{row.label}
						</th>
						{#each heatmap.days as day, d (day.date)}
							{#if editing}
								<td
									class="h-4 w-8 cursor-pointer border border-gray-200 transition-colors {busyCells[
										cellKey(r, d)
									]
										? 'bg-indigo-500 hover:bg-indigo-400'
										: 'bg-white hover:bg-indigo-100'}"
									role="gridcell"
									aria-label="Toggle availability"
									onclick={() => {
										toggleCell(r, d);
									}}
								></td>
							{:else}
								<td
									class="h-4 w-8 border border-gray-100"
									role="gridcell"
									onmouseenter={() => (hovered = { row: r, day: d })}
									onmouseleave={() => (hovered = null)}
									style="background-color: rgb({255 -
										Math.round(heatmap.cells[r][d].free_ratio * 255)} 255 {255 -
										Math.round(heatmap.cells[r][d].free_ratio * 255)})"
								></td>
							{/if}
						{/each}
					</tr>
				{/each}
			</tbody>
		</table>
	</div>

	{#if hoveredSlotValue}
		<ParticipantList slot={hoveredSlotValue} />
	{/if}
</div>
