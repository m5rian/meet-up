<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './';
	import { CalendarIcon, CloseIcon, UploadIcon } from './icons';

	interface Props {
		open: boolean;
		error?: string | null;
		onClose: () => void;
	}

	let { open, error = null, onClose }: Props = $props();

	let source: 'url' | 'file' = $state('url');
	let pending = $state(false);
</script>

{#if open}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
		role="dialog"
		aria-modal="true"
		aria-label="Add calendar"
		tabindex="-1"
		onclick={(e) => {
			if (e.target === e.currentTarget) onClose();
		}}
		onkeydown={(e) => {
			if (e.key === 'Escape') onClose();
		}}
	>
		<div class="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
			<div class="mb-4 flex items-center justify-between">
				<h3 class="text-lg font-semibold text-gray-900">Add a calendar</h3>
				<button
					type="button"
					onclick={onClose}
					aria-label="Close"
					class="text-gray-400 hover:text-gray-600"
				>
					<CloseIcon class="h-5 w-5" />
				</button>
			</div>

			<form
				method="POST"
				action="?/add-calendar"
				enctype="multipart/form-data"
				use:enhance={() => {
					pending = true;
					return async ({ update }) => {
						pending = false;
						await update();
					};
				}}
				class="space-y-4"
			>
				<label class="block">
					<span class="mb-1 block text-sm font-medium text-gray-700">Calendar name</span>
					<input
						type="text"
						name="name"
						placeholder="e.g. Work, Personal"
						class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
					/>
				</label>

				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => (source = 'url')}
						class="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors {source ===
						'url'
							? 'border-indigo-600 bg-indigo-50 text-indigo-700'
							: 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
					>
						<CalendarIcon class="h-4 w-4" />
						Live URL
					</button>
					<button
						type="button"
						onclick={() => (source = 'file')}
						class="flex flex-1 items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors {source ===
						'file'
							? 'border-indigo-600 bg-indigo-50 text-indigo-700'
							: 'border-gray-300 text-gray-600 hover:bg-gray-50'}"
					>
						<UploadIcon class="h-4 w-4" />
						Upload file
					</button>
				</div>

				<input type="hidden" name="source" value={source} />

				{#if source === 'url'}
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-gray-700">ICS URL</span>
						<input
							type="url"
							name="ics_url"
							placeholder="https://calendar.example.com/secret.ics"
							class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
						/>
					</label>
					<p class="text-xs text-gray-500">
						Only https:// URLs are accepted. We poll it periodically and store only free/busy
						intervals.
					</p>
				{:else}
					<label class="block">
						<span class="mb-1 block text-sm font-medium text-gray-700">.ics file</span>
						<input
							type="file"
							name="ics_file"
							accept=".ics,text/calendar"
							class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
						/>
					</label>
					<p class="text-xs text-gray-500">
						Parsed once, no auto-refresh. Remove and re-add to update.
					</p>
				{/if}

				{#if error}
					<p class="text-sm text-red-600">{error}</p>
				{/if}

				<div class="flex justify-end gap-2">
					<Button type="button" variant="secondary" onclick={onClose}>Cancel</Button>
					<Button type="submit" {pending}>Add calendar</Button>
				</div>
			</form>
		</div>
	</div>
{/if}
