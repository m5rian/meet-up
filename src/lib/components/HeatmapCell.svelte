<script lang="ts">
	interface Props {
		editing: boolean;
		/** When true, the cell is clickable to select it as the final meeting slot. */
		selectable: boolean;
		/** When true, this cell is the currently selected final slot. */
		selected: boolean;
		busy: boolean;
		/** `row:day` key, read by the grid to resolve the cell under a drag pointer. */
		cellKey: string;
		colorClass: string;
		onToggle: () => void;
		onPaintStart: () => void;
		onSelect: () => void;
		onHover: () => void;
		onLeave: () => void;
	}

	let {
		editing,
		selectable,
		selected,
		busy,
		cellKey,
		colorClass,
		onToggle,
		onPaintStart,
		onSelect,
		onHover,
		onLeave
	}: Props = $props();
</script>

{#if editing}
	<button
		type="button"
		role="gridcell"
		aria-label="Toggle availability"
		aria-selected={busy}
		data-cell={cellKey}
		class="h-8 w-full cursor-pointer touch-none transition-colors {busy
			? 'bg-indigo-500 hover:bg-indigo-400'
			: 'bg-white hover:bg-indigo-100'}"
		onpointerdown={(e) => {
			if (e.button === 0) onPaintStart();
		}}
		onclick={(e) => {
			// Pointer clicks are handled by the drag on pointerdown; only keyboard
			// activation (Enter/Space, detail === 0) toggles here.
			if (e.detail === 0) onToggle();
		}}
	></button>
{:else if selectable}
	<button
		type="button"
		role="gridcell"
		aria-label="Select this slot as the meeting time"
		class="h-8 w-full cursor-pointer transition-colors {selected
			? 'bg-indigo-600 ring-2 ring-indigo-400 hover:bg-indigo-500'
			: 'hover:ring-2 hover:ring-indigo-300'} {colorClass}"
		onclick={onSelect}
		onmouseenter={onHover}
		onmouseleave={onLeave}
	></button>
{:else}
	<div
		role="gridcell"
		tabindex="0"
		class="h-8 w-full {colorClass}"
		onmouseenter={onHover}
		onmouseleave={onLeave}
	></div>
{/if}
