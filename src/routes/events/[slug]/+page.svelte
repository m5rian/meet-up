<script lang="ts">
	import { enhance } from '$app/forms';
	import type { HeatmapData, UserSummary } from '$lib/types';
	import { Button, Heatmap, InvitePicker } from '$lib/components';

	interface EventDetail {
		title: string;
		visibility: 'private' | 'link';
		date_range_start: string;
		date_range_end: string;
		time_window_start: string;
		time_window_end: string;
	}

	let {
		data
	}: {
		data: {
			event: EventDetail;
			heatmap: HeatmapData;
			isOrganizer: boolean;
			joined: boolean;
			inviteCandidates: UserSummary[];
			invitedUserIds: string[];
			shareUrl: string;
		};
	} = $props();

	let copied = $state(false);

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(data.shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable; ignore.
		}
	}
</script>

<div class="space-y-6">
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-xl font-bold text-gray-900">{data.event.title}</h1>
			<p class="mt-1 text-sm text-gray-500">
				{data.event.date_range_start} → {data.event.date_range_end} · daily
				{data.event.time_window_start.slice(0, 5)}–{data.event.time_window_end.slice(0, 5)} ·
				{data.event.visibility === 'private' ? 'Private' : 'Link'} event
			</p>
		</div>
		<div class="flex items-center gap-2">
			<Button type="button" variant="secondary" onclick={copyLink}>
				{copied ? 'Copied!' : 'Copy link'}
			</Button>
		</div>
	</div>

	{#if data.isOrganizer && data.event.visibility === 'private'}
		<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-3 text-sm font-semibold text-gray-900">Invite people</h2>
			<InvitePicker users={data.inviteCandidates} excludedIds={data.invitedUserIds} />
		</section>
	{/if}

	{#if !data.joined && data.event.visibility === 'link'}
		<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<p class="mb-3 text-sm text-gray-600">
				Join this event to mark your availability and be counted in the heatmap.
			</p>
			<form method="POST" action="?/join" use:enhance>
				<Button type="submit">Join event</Button>
			</form>
		</section>
	{/if}

	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<Heatmap heatmap={data.heatmap} />
	</section>
</div>
