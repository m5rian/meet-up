<script lang="ts">
	import type { SyncStatus } from '$lib/types';
	import { CheckIcon, InfoIcon, RefreshIcon } from './icons';

	interface Props {
		status: SyncStatus;
	}

	let { status }: Props = $props();

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
		status.last_error !== null &&
			(status.last_success_at === null ||
				(status.last_attempt_at !== null &&
					status.last_attempt_at.getTime() > status.last_success_at.getTime()))
	);
</script>

{#if failed}
	<span
		class="inline-flex items-center gap-1 text-xs text-red-600"
		title={status.last_error ?? 'Sync failed'}
	>
		<InfoIcon class="h-3.5 w-3.5 shrink-0" />
		Sync failed
	</span>
{:else if status.last_success_at}
	<span class="inline-flex items-center gap-1 text-xs text-gray-500">
		<CheckIcon class="h-3.5 w-3.5 shrink-0 text-green-600" />
		Synced {timeAgoLabel(status.last_success_at)}
	</span>
{:else}
	<span class="inline-flex items-center gap-1 text-xs text-gray-400">
		<RefreshIcon class="h-3.5 w-3.5 shrink-0" />
		Not synced yet
	</span>
{/if}
