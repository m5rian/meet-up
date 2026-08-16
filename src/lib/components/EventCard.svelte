<script lang="ts">
	import { resolve } from '$app/paths';
	import type { EventSummary } from '$lib/types';
	import { Avatar } from './';

	interface Props {
		event: EventSummary;
	}

	let { event }: Props = $props();

	const visibilityLabel = $derived(event.visibility === 'private' ? 'Private' : 'Link');
</script>

<a
	href={resolve(`/events/${event.slug}`)}
	class="block rounded-lg border border-gray-200 bg-white p-4 shadow-sm transition-shadow hover:shadow-md"
>
	<div class="flex items-start justify-between gap-3">
		<div>
			<h3 class="font-semibold text-gray-900">{event.title}</h3>
			<p class="mt-1 text-sm text-gray-500">
				{event.date_range_start} → {event.date_range_end} · {event.time_window_start.slice(0, 5)}–
				{event.time_window_end.slice(0, 5)}
			</p>
		</div>
		<span
			class="rounded-full px-2 py-0.5 text-xs font-medium {event.visibility === 'private'
				? 'bg-amber-100 text-amber-800'
				: 'bg-blue-100 text-blue-800'}"
		>
			{visibilityLabel}
		</span>
	</div>
	<div class="mt-3 flex items-center gap-2 text-sm text-gray-600">
		<Avatar src={null} username={event.organizer_username} size="sm" />
		<span>Organized by {event.organizer_username}</span>
		{#if event.is_organizer}
			<span class="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-700">You</span
			>
		{/if}
	</div>
</a>
