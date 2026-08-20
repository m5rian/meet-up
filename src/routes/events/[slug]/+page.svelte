<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { HeatmapData, UserSummary } from '$lib/types';
	import { Button, Heatmap, InvitePicker } from '$lib/components';

	interface EventDetail {
		slug: string;
		title: string;
		visibility: 'private' | 'link';
		date_range_start: string;
		date_range_end: string;
		time_window_start: string;
		time_window_end: string;
		finalized_start_ts: string | null;
		finalized_end_ts: string | null;
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
			finalizeError?: string;
		};
	} = $props();

	let copied = $state(false);
	// Finalize mode: the organizer clicks a heatmap cell to pick the slot.
	let finalizeMode = $state(false);
	let selectedStart = $state<string | null>(null);
	let selectedEnd = $state<string | null>(null);

	const downloadUrl = $derived(resolve(`/events/${data.event.slug}/invite.ics`));

	function startFinalize(): void {
		finalizeMode = true;
		selectedStart = null;
		selectedEnd = null;
	}

	function cancelFinalize(): void {
		finalizeMode = false;
		selectedStart = null;
		selectedEnd = null;
	}

	function onSelectSlot(start: string, end: string): void {
		selectedStart = start;
		selectedEnd = end;
	}

	let selectedLabel = $derived.by(() => {
		if (!selectedStart || !selectedEnd) return null;
		return `${formatFinalized(selectedStart)} – ${formatFinalized(selectedEnd)}`;
	});

	async function copyLink(): Promise<void> {
		try {
			await navigator.clipboard.writeText(data.shareUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable; ignore.
		}
	}

	// A finalized meeting is shown to everyone; the organizer can also download it.
	const isFinalized = $derived(
		data.event.finalized_start_ts !== null && data.event.finalized_end_ts !== null
	);

	function formatFinalized(ts: string): string {
		return new Date(ts).toLocaleString(undefined, {
			dateStyle: 'medium',
			timeStyle: 'short'
		});
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

	{#if isFinalized}
		<section class="rounded-lg border border-green-200 bg-green-50 p-4 shadow-sm">
			<div class="flex flex-wrap items-center justify-between gap-3">
				<div>
					<h2 class="text-sm font-semibold text-green-900">Meeting scheduled</h2>
					<p class="mt-1 text-sm text-green-800">
						{data.event.finalized_start_ts ? formatFinalized(data.event.finalized_start_ts) : ''} –
						{data.event.finalized_end_ts ? formatFinalized(data.event.finalized_end_ts) : ''}
					</p>
				</div>
				<a href={downloadUrl}>
					<Button type="button" variant="secondary">Add to calendar (.ics)</Button>
				</a>
			</div>
		</section>
	{:else if data.isOrganizer}
		<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
			<h2 class="mb-3 text-sm font-semibold text-gray-900">Finalize the meeting</h2>
			{#if !finalizeMode}
				<p class="mb-3 text-sm text-gray-500">
					Pick a slot on the heatmap to set the meeting time. It must fall inside the availability
					window and date range.
				</p>
				<Button type="button" onclick={startFinalize}>Choose a slot</Button>
			{:else}
				<p class="mb-3 text-sm text-gray-500">
					Click a cell on the heatmap to pick the meeting time.
				</p>
				<div class="flex flex-wrap items-center gap-3">
					{#if selectedLabel}
						<span class="rounded-md bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-800">
							{selectedLabel}
						</span>
						<form method="POST" action="?/finalize" use:enhance class="contents">
							<input type="hidden" name="start_ts" value={selectedStart ?? ''} />
							<input type="hidden" name="end_ts" value={selectedEnd ?? ''} />
							<Button type="submit">Finalize meeting</Button>
						</form>
					{:else}
						<p class="text-sm text-gray-400">No slot selected yet.</p>
					{/if}
					<Button type="button" variant="secondary" onclick={cancelFinalize}>Cancel</Button>
				</div>
			{/if}
			{#if data.finalizeError}
				<p class="mt-3 text-sm text-red-600">{data.finalizeError}</p>
			{/if}
		</section>
	{/if}

	<section class="rounded-lg border border-gray-200 bg-white p-4 shadow-sm">
		<Heatmap heatmap={data.heatmap} {finalizeMode} {selectedStart} {onSelectSlot} />
	</section>
</div>
