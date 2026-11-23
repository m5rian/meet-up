<script lang="ts">
	import { DateTime } from 'luxon';
	import type { HeatmapData, HeatmapSlot } from '$lib/types';
	import HeatmapCell from './HeatmapCell.svelte';

	interface Props {
		heatmap: HeatmapData;
		editing: boolean;
		/** When true, cells are clickable to select the final meeting slot. */
		selectable: boolean;
		/** The selected final slot as a UTC ISO start timestamp, or null. */
		selectedStart: string | null;
		busyCells: Record<string, boolean>;
		onToggle: (row: number, day: number) => void;
		/** Begin a drag-paint from this cell (editing mode). */
		onPaintStart: (row: number, day: number) => void;
		/** Extend the active drag-paint to this cell (editing mode). */
		onPaintMove: (row: number, day: number) => void;
		onSelect: (row: number, day: number) => void;
		onHover: (row: number, day: number) => void;
		onLeave: () => void;
	}

	let {
		heatmap,
		editing,
		selectable,
		selectedStart,
		busyCells,
		onToggle,
		onPaintStart,
		onPaintMove,
		onSelect,
		onHover,
		onLeave
	}: Props = $props();

	// Discrete green scale, lightest first. The slot with the fewest free
	// participants (least overlap) starts at the lightest color, and each higher
	// distinct count steps one shade darker as overlap increases. Every
	// availability count maps to its own bucket.
	const PALETTE = [
		'bg-green-50',
		'bg-green-200',
		'bg-green-300',
		'bg-green-400',
		'bg-green-500',
		'bg-green-600',
		'bg-green-700',
		'bg-green-800',
		'bg-green-900'
	];

	const colorByCount = (() => {
		const counts: Record<number, true> = {};
		for (const row of heatmap.cells) {
			for (const cell of row) {
				counts[cell.free.length] = true;
			}
		}
		const sorted = Object.keys(counts)
			.map(Number)
			.sort((a, b) => a - b);
		const map: Record<number, string> = {};
		sorted.forEach((count, i) => {
			map[count] = PALETTE[Math.min(i, PALETTE.length - 1)];
		});
		return map;
	})();

	function cellColor(cell: HeatmapSlot): string {
		return colorByCount[cell.free.length] ?? 'bg-white';
	}

	function cellKey(row: number, day: number): string {
		return String(row) + ':' + String(day);
	}

	// The cell's UTC start timestamp, used to highlight the selected final slot.
	function cellStart(row: number, day: number): string {
		const dayStart = heatmap.days[day].start_ts;
		const dt = DateTime.fromISO(dayStart, { zone: 'utc' }).plus({
			minutes: heatmap.rows[row].offset_minutes
		});
		return dt.toISO({ suppressMilliseconds: true }) ?? '';
	}

	// Resolve the cell under the pointer via hit-testing rather than per-cell
	// pointerenter: touch pointers are implicitly captured by the element they
	// started on, so enter events never fire on the cells a finger slides over.
	function handlePointerMove(e: PointerEvent): void {
		if (!editing) return;
		const el = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>('[data-cell]');
		const key = el?.dataset.cell;
		if (!key) return;
		const [r, d] = key.split(':').map(Number);
		onPaintMove(r, d);
	}
</script>

<div
	role="presentation"
	class="grow overflow-x-auto {editing ? 'select-none' : ''}"
	onpointermove={handlePointerMove}
>
	<div
		class="grid w-full gap-px"
		style="grid-template-columns: auto repeat({heatmap.days.length}, minmax(0, 1fr));"
	>
		<!-- Corner cell -->
		<div class="sticky left-0 bg-white px-2 py-1"></div>

		{#each heatmap.days as day (day.date)}
			<div class="px-1 py-1 text-center text-xs font-medium text-gray-500">{day.label}</div>
		{/each}

		{#each heatmap.rows as row, r (row.offset_minutes)}
			<div class="sticky left-0 bg-white px-2 py-1 text-right text-xs font-medium text-gray-500">
				{row.label}
			</div>
			{#each heatmap.days as day, d (day.date)}
				<HeatmapCell
					{editing}
					{selectable}
					selected={selectedStart === cellStart(r, d)}
					busy={busyCells[cellKey(r, d)]}
					cellKey={cellKey(r, d)}
					colorClass={cellColor(heatmap.cells[r][d])}
					onToggle={() => {
						onToggle(r, d);
					}}
					onPaintStart={() => {
						onPaintStart(r, d);
					}}
					onSelect={() => {
						onSelect(r, d);
					}}
					onHover={() => {
						onHover(r, d);
					}}
					{onLeave}
				/>
			{/each}
		{/each}
	</div>
</div>
