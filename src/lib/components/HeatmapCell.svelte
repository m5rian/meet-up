<script lang="ts">
	interface Props {
		editing: boolean;
		/** When true, the cell is clickable to select it as the final meeting slot. */
		selectable: boolean;
		/** When true (finalize mode), the cell is outside the organizer's window and disabled. */
		outOfWindow: boolean;
		/** When true, this cell is the currently selected final slot. */
		selected: boolean;
		/** When true, this cell is the finalized meeting slot, marked blue for everyone. */
		finalized: boolean;
		/** The UTC ISO start used to anchor auto-scroll, when this is the finalized slot. */
		finalizedKey: string | undefined;
		busy: boolean;
		/** `row:day` key, read by the grid to resolve the cell under a drag pointer. */
		cellKey: string;
		colorClass: string;
		onToggle: () => void;
		onPaintStart: (pointerType: string) => void;
		onSelect: () => void;
		onHover: () => void;
		onLeave: () => void;
	}

	let {
		editing,
		selectable,
		outOfWindow,
		selected,
		finalized,
		finalizedKey,
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
		class="h-8 w-full cursor-pointer transition-colors {finalized
			? 'bg-blue-600 ring-2 ring-blue-300 hover:bg-blue-500'
			: busy
				? 'bg-indigo-500 hover:bg-indigo-400'
				: 'bg-white hover:bg-indigo-100'}"
		onpointerdown={(e) => {
			if (e.button === 0) onPaintStart(e.pointerType);
		}}
		oncontextmenu={(e) => {
			// A touch long-press starts a drag; keep the OS menu from opening over it.
			e.preventDefault();
		}}
		onclick={(e) => {
			// Pointer input is handled on pointerdown/up (drag or touch tap); only
			// keyboard activation (Enter/Space, detail === 0) toggles here.
			if (e.detail === 0) onToggle();
		}}
	></button>
{:else if selectable && outOfWindow}
	<div class="h-8 w-full opacity-40 {colorClass}"></div>
{:else if selectable}
	<button
		type="button"
		role="gridcell"
		aria-label="Select this slot as the meeting time"
		class="h-8 w-full cursor-pointer transition-colors {finalized
			? 'bg-blue-600 ring-2 ring-blue-300 hover:bg-blue-500'
			: selected
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
		class="h-8 w-full {finalized ? 'bg-blue-600 ring-2 ring-blue-400' : colorClass}"
		data-finalized={finalizedKey}
		onmouseenter={onHover}
		onmouseleave={onLeave}
	></div>
{/if}
