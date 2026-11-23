<script lang="ts">
	import type { ParticipantSummary } from '$lib/types';
	import Avatar from './Avatar.svelte';

	interface Props {
		participants: ParticipantSummary[];
		/** Participant ids that are unavailable in the hovered slot; dimmed when set. */
		unavailableIds?: Set<string>;
		/** Participant ids the heatmap is filtered to. */
		selectedIds: Set<string>;
		onToggleSelect: (id: string) => void;
		onClearSelect: () => void;
		emptyText?: string;
		class?: string;
	}

	let {
		participants,
		unavailableIds = new Set(),
		selectedIds,
		onToggleSelect,
		onClearSelect,
		emptyText = 'No members yet',
		class: className = ''
	}: Props = $props();
</script>

<div class="p-3 {className}">
	<div class="mb-2 flex items-center justify-between">
		<span class="text-sm font-medium text-gray-900">Members</span>
		{#if selectedIds.size > 0}
			<button
				type="button"
				class="cursor-pointer text-xs text-indigo-600 hover:underline"
				onclick={onClearSelect}
			>
				Show all
			</button>
		{/if}
	</div>
	{#if participants.length > 1}
		<p class="mb-2 text-xs text-gray-500">Click members to show only their availability.</p>
	{/if}
	{#if participants.length === 0}
		<p class="text-sm text-gray-500">{emptyText}</p>
	{:else}
		<ul class="space-y-1">
			{#each participants as participant (participant.id)}
				{@const dimmed = unavailableIds.has(participant.id)}
				{@const selected = selectedIds.has(participant.id)}
				<li class="transition-opacity {dimmed ? 'opacity-40' : 'opacity-100'}">
					<button
						type="button"
						aria-pressed={selected}
						class="flex w-full cursor-pointer items-center gap-2 rounded px-1 py-0.5 text-left text-sm {selected
							? 'bg-indigo-50 ring-1 ring-indigo-300'
							: 'hover:bg-gray-50'}"
						onclick={() => {
							onToggleSelect(participant.id);
						}}
					>
						<Avatar src={participant.profile_picture} username={participant.username} size="sm" />
						<span class="truncate text-gray-700">{participant.username}</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</div>
