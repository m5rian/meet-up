<script lang="ts">
	import { enhance } from '$app/forms';
	import type { SyncStatus } from '$lib/types';
	import { Button } from './';
	import { UploadIcon, CalendarIcon } from './icons';
	import SyncStatusIndicator from './SyncStatusIndicator.svelte';

	interface Props {
		icsUrl: string | null;
		icsSource: 'url' | 'file' | null;
		syncStatus: SyncStatus | null;
		error?: string | null;
	}

	let { icsUrl, icsSource, syncStatus, error = null }: Props = $props();
</script>

<section class="space-y-4">
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}

	<SyncStatusIndicator status={syncStatus} isUrlSource={icsSource === 'url'} />

	{#if icsSource === 'url' && icsUrl}
		<div class="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
			<div class="flex items-center gap-2 font-medium text-gray-800">
				<CalendarIcon class="h-4 w-4" />
				Live calendar connected
			</div>
			<p class="mt-1 break-all">{icsUrl}</p>
			<p class="mt-1 text-xs text-gray-500">
				We only store free/busy intervals — never your event titles or details.
			</p>
		</div>
		<form method="POST" action="?/disconnect-calendar" use:enhance>
			<Button type="submit" variant="secondary">Disconnect</Button>
		</form>
	{:else if icsSource === 'file'}
		<div class="rounded-md bg-gray-50 p-3 text-sm text-gray-600">
			<div class="flex items-center gap-2 font-medium text-gray-800">
				<UploadIcon class="h-4 w-4" />
				Calendar uploaded from file
			</div>
			<p class="mt-1 text-xs text-gray-500">
				File-based calendars are parsed once and don't auto-refresh. Upload a new file to update.
			</p>
		</div>
		<form method="POST" action="?/disconnect-calendar" use:enhance>
			<Button type="submit" variant="secondary">Disconnect</Button>
		</form>
	{/if}

	<div class="grid gap-4 sm:grid-cols-2">
		<form method="POST" action="?/submit-ics-url" use:enhance class="space-y-3">
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-gray-700">Live ICS URL</span>
				<input
					type="url"
					name="ics_url"
					value={icsUrl ?? ''}
					placeholder="https://calendar.example.com/secret.ics"
					class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
				/>
			</label>
			<p class="text-xs text-gray-500">
				Only https:// URLs are accepted. We poll it periodically and store only free/busy intervals.
			</p>
			<Button type="submit">
				<CalendarIcon class="h-4 w-4" />
				Connect calendar
			</Button>
		</form>

		<form
			method="POST"
			action="?/upload-ics-file"
			enctype="multipart/form-data"
			use:enhance
			class="space-y-3"
		>
			<label class="block">
				<span class="mb-1 block text-sm font-medium text-gray-700">Or upload an .ics file</span>
				<input
					type="file"
					name="ics_file"
					accept=".ics,text/calendar"
					class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
				/>
			</label>
			<p class="text-xs text-gray-500">
				Parsed once, no polling. Uploading a file replaces any live URL.
			</p>
			<Button type="submit">
				<UploadIcon class="h-4 w-4" />
				Upload calendar
			</Button>
		</form>
	</div>
</section>
