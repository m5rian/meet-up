<script lang="ts">
	import type { HeatmapSlot } from '$lib/types';

	interface Props {
		slot: HeatmapSlot;
		editing: boolean;
		busy: boolean;
		onToggle: () => void;
		onHover: () => void;
		onLeave: () => void;
	}

	let { slot, editing, busy, onToggle, onHover, onLeave }: Props = $props();
</script>

{#if editing}
	<button
		type="button"
		role="gridcell"
		aria-label="Toggle availability"
		class="h-8 w-full cursor-pointer transition-colors {busy
			? 'bg-indigo-500 hover:bg-indigo-400'
			: 'bg-white hover:bg-indigo-100'}"
		onclick={onToggle}
	></button>
{:else}
	<div
		role="gridcell"
		tabindex="0"
		class="h-8 w-full border border-gray-500"
		onmouseenter={onHover}
		onmouseleave={onLeave}
		style="background-color: rgb({255 - Math.round(slot.free_ratio * 255)} 255 {255 -
			Math.round(slot.free_ratio * 255)})"
	></div>
{/if}
