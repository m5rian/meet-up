<script lang="ts">
	interface Props {
		editing: boolean;
		busy: boolean;
		colorClass: string;
		onToggle: () => void;
		onHover: () => void;
		onLeave: () => void;
	}

	let { editing, busy, colorClass, onToggle, onHover, onLeave }: Props = $props();
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
		class="h-8 w-full {colorClass}"
		onmouseenter={onHover}
		onmouseleave={onLeave}
	></div>
{/if}
