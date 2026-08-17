<script lang="ts">
	import type { SyncStatus } from '$lib/types';
	import { CheckIcon, InfoIcon, RefreshIcon } from './icons';

	interface Props {
		status: SyncStatus | null;
		/** True when a live ICS URL is configured (so polling applies). */
		isUrlSource: boolean;
	}

	let { status, isUrlSource }: Props = $props();

	function minutesAgo(ts: Date | null): number | null {
		if (!ts) return null;
		return Math.max(0, Math.floor((Date.now() - ts.getTime()) / 60_000));
	}

	function timeAgoLabel(ts: Date | null): string {
		const mins = minutesAgo(ts);
		if (mins === null) return 'never';
		if (mins < 1) return 'just now';
		if (mins < 60) return String(mins) + 'm ago';
		const hours = Math.floor(mins / 60);
		if (hours < 24) return String(hours) + 'h ago';
		const days = Math.floor(hours / 24);
		return String(days) + 'd ago';
	}

	// A failed attempt is shown when the last attempt failed (no success after it).
	const failed = $derived(
		status?.last_error !== null &&
			status?.last_error !== undefined &&
			(status.last_success_at === null ||
				(status.last_attempt_at !== null &&
					status.last_attempt_at.getTime() > status.last_success_at.getTime()))
	);
</script>

{#if failed}
	<div class="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-700">
		<InfoIcon class="h-4 w-4 shrink-0" />
		<span>
			Sync failed — check your ICS URL.
			{#if status?.last_error}
				<span class="text-red-600">({status.last_error})</span>
			{/if}
		</span>
	</div>
{:else}
	<div class="flex items-center gap-2 text-sm text-gray-500">
		{#if status?.last_success_at}
			<CheckIcon class="h-4 w-4 shrink-0 text-green-600" />
			<span>Last synced {timeAgoLabel(status.last_success_at)}</span>
			{#if isUrlSource}
				<span class="text-gray-400">· auto-refreshes periodically</span>
			{/if}
		{:else}
			<RefreshIcon class="h-4 w-4 shrink-0 text-gray-400" />
			<span>Not synced yet</span>
		{/if}
	</div>
{/if}
