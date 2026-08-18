<script lang="ts">
	import type { CalendarConnection } from '$lib/types';
	import { Button } from './';
	import { PlusIcon } from './icons';
	import CalendarRow from './CalendarRow.svelte';
	import AddCalendarModal from './AddCalendarModal.svelte';

	interface Props {
		calendars: CalendarConnection[];
		error?: string | null;
	}

	let { calendars, error = null }: Props = $props();

	let modalOpen = $state(false);
</script>

<section class="space-y-4">
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}

	<div class="flex items-center justify-between">
		<p class="text-sm text-gray-500">
			Connect as many calendars as you like — your availability merges all of them together.
		</p>
		<Button type="button" onclick={() => (modalOpen = true)}>
			<PlusIcon class="h-4 w-4" />
			Add calendar
		</Button>
	</div>

	{#if calendars.length > 0}
		<div class="space-y-2">
			{#each calendars as calendar (calendar.id)}
				<CalendarRow {calendar} />
			{/each}
		</div>
	{:else}
		<p class="rounded-md bg-gray-50 p-3 text-sm text-gray-500">
			No calendars connected yet. Add a live ICS URL or upload an .ics file.
		</p>
	{/if}

	{#if modalOpen}
		<AddCalendarModal open={modalOpen} {error} onClose={() => (modalOpen = false)} />
	{/if}
</section>
