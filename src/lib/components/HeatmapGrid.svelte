<script lang="ts">
	import type { HeatmapData } from '$lib/types';
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

	function cellKey(row: number, day: number): string {
		return String(row) + ':' + String(day);
	}
</script>

<div class="overflow-x-auto">
	<div
		class="grid w-full"
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
					slot={heatmap.cells[r][d]}
					{editing}
					busy={busyCells[cellKey(r, d)]}
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
