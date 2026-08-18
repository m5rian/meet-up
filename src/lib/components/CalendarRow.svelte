<script lang="ts">
	import { enhance } from '$app/forms';
	import type { CalendarConnection } from '$lib/types';
	import { Button } from './';
	import { CalendarIcon, RefreshIcon, UploadIcon } from './icons';
	import CalendarSyncBadge from './CalendarSyncBadge.svelte';

	interface Props {
		calendar: CalendarConnection;
	}

	let { calendar }: Props = $props();
</script>

<div class="flex flex-wrap items-center gap-3 rounded-md bg-gray-50 p-3">
	<div class="min-w-0 flex-1">
		<div class="flex items-center gap-2 font-medium text-gray-800">
			{#if calendar.source === 'url'}
				<CalendarIcon class="h-4 w-4 shrink-0 text-indigo-600" />
			{:else}
				<UploadIcon class="h-4 w-4 shrink-0 text-indigo-600" />
			{/if}
			<span class="truncate">{calendar.name}</span>
		</div>
		{#if calendar.url}
			<p class="mt-0.5 text-xs break-all text-gray-500">{calendar.url}</p>
		{:else}
			<p class="mt-0.5 text-xs text-gray-500">Uploaded .ics file — parsed once, no auto-refresh.</p>
		{/if}
	</div>

	<div class="flex items-center gap-2">
		<CalendarSyncBadge status={calendar.syncStatus} />
		<form method="POST" action="?/resync-calendar" use:enhance>
			<input type="hidden" name="calendar_id" value={calendar.id} />
			<Button type="submit" variant="secondary" class="px-2 py-1 text-xs">
				<RefreshIcon class="h-3.5 w-3.5" />
				Sync
			</Button>
		</form>
		<form method="POST" action="?/remove-calendar" use:enhance>
			<input type="hidden" name="calendar_id" value={calendar.id} />
			<Button type="submit" variant="secondary" class="px-2 py-1 text-xs">Remove</Button>
		</form>
	</div>
</div>
