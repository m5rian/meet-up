<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EventSummary } from '$lib/types';
	import { Button, EventCard } from '$lib/components';

	let { data }: { data: { events: EventSummary[] } } = $props();
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h1 class="text-xl font-bold text-gray-900">Your events</h1>
		<a href={resolve('/events/new')}>
			<Button type="button">New event</Button>
		</a>
	</div>

	{#if data.events.length === 0}
		<div class="rounded-lg border border-dashed border-gray-300 bg-white p-8 text-center">
			<p class="text-gray-500">You're not part of any events yet.</p>
			<p class="mt-1 text-sm text-gray-400">
				Create an event or open a shared link to get started.
			</p>
		</div>
	{:else}
		<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
			{#each data.events as event (event.id)}
				<EventCard {event} />
			{/each}
		</div>
	{/if}
</div>
