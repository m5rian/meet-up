<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './';

	interface Props {
		sleepStart: string | null;
		sleepEnd: string | null;
		error?: string | null;
	}

	let { sleepStart, sleepEnd, error = null }: Props = $props();

	// Convert 'HH:mm:ss' to 'HH:mm' for the time input.
	function toTimeInput(value: string | null): string {
		return value ? value.slice(0, 5) : '';
	}
</script>

<form method="POST" action="?/update-sleep-schedule" use:enhance class="space-y-3">
	<div class="grid grid-cols-2 gap-3">
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Sleep start</span>
			<input
				type="time"
				name="sleep_start"
				value={toTimeInput(sleepStart)}
				class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
			/>
		</label>
		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Sleep end</span>
			<input
				type="time"
				name="sleep_end"
				value={toTimeInput(sleepEnd)}
				class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
			/>
		</label>
	</div>
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
	<p class="text-sm text-gray-500">
		Your sleep window is treated as a base busy block across all your events. Overnight windows (end
		before start) span midnight.
	</p>
	<div class="flex items-center gap-2">
		<Button type="submit">Save sleep schedule</Button>
		<Button type="submit" variant="secondary" formaction="?/clear-sleep-schedule">Clear</Button>
	</div>
</form>
