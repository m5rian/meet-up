<script lang="ts">
	import type { HeatmapSlot } from '$lib/types';

	interface Props {
		slot: HeatmapSlot;
	}

	let { slot }: Props = $props();

	function names(participants: { username: string }[]): string {
		if (participants.length === 0) return 'Nobody';
		return participants.map((p) => p.username).join(', ');
	}
</script>

<div class="rounded-md border border-gray-200 bg-white p-3 shadow-sm">
	<div class="mb-2 text-sm font-medium text-gray-900">
		{Math.round(slot.free_ratio * 100)}% free
	</div>
	<div class="space-y-2 text-sm">
		<div>
			<span class="font-medium text-green-700">Free:</span>
			<span class="text-gray-700">{names(slot.free)}</span>
		</div>
		<div>
			<span class="font-medium text-red-700">Busy:</span>
			<span class="text-gray-700">{names(slot.busy)}</span>
		</div>
		{#if slot.not_responded.length > 0}
			<div>
				<span class="font-medium text-gray-500">Not responded:</span>
				<span class="text-gray-500">{names(slot.not_responded)}</span>
			</div>
		{/if}
	</div>
</div>
