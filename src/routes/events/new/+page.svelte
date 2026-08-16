<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, FormField } from '$lib/components';

	let { form }: { form: { error?: string } | null } = $props();

	// Default date range: today through +7 days.
	const today = new Date();
	const end = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
	const fmt = (d: Date) => d.toISOString().slice(0, 10);
</script>

<div class="mx-auto max-w-xl">
	<h1 class="mb-6 text-xl font-bold text-gray-900">Create an event</h1>

	{#if form?.error}
		<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{form.error}</div>
	{/if}

	<form method="POST" use:enhance class="space-y-4">
		<FormField label="Title" name="title" required placeholder="e.g. Team sync" />

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Visibility</span>
			<select
				name="visibility"
				class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
			>
				<option value="link">Link — anyone with the link can join</option>
				<option value="private">Private — only invited users can see it</option>
			</select>
		</label>

		<div class="grid grid-cols-2 gap-3">
			<FormField
				label="Start date"
				type="date"
				name="date_range_start"
				value={fmt(today)}
				required
			/>
			<FormField label="End date" type="date" name="date_range_end" value={fmt(end)} required />
		</div>

		<div class="grid grid-cols-2 gap-3">
			<FormField
				label="Daily window start"
				type="time"
				name="time_window_start"
				value="09:00"
				required
			/>
			<FormField
				label="Daily window end"
				type="time"
				name="time_window_end"
				value="18:00"
				required
			/>
		</div>

		<label class="block">
			<span class="mb-1 block text-sm font-medium text-gray-700">Slot granularity</span>
			<select
				name="slot_granularity_minutes"
				class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
			>
				<option value="15">15 minutes</option>
				<option value="30">30 minutes</option>
				<option value="60">60 minutes</option>
			</select>
		</label>

		<Button type="submit" class="w-full">Create event</Button>
	</form>
</div>
