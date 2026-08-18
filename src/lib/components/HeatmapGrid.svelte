<script lang="ts">
	import type { HeatmapData, HeatmapSlot } from '$lib/types';
	import HeatmapCell from './HeatmapCell.svelte';

	interface Props {
		heatmap: HeatmapData;
		editing: boolean;
		busyCells: Record<string, boolean>;
		onToggle: (row: number, day: number) => void;
		onHover: (row: number, day: number) => void;
		onLeave: () => void;
	}

	let { heatmap, editing, busyCells, onToggle, onHover, onLeave }: Props = $props();

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
</script>

<div class="grow overflow-x-auto">
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
					busy={busyCells[cellKey(r, d)]}
					colorClass={cellColor(heatmap.cells[r][d])}
					onToggle={() => {
						onToggle(r, d);
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
