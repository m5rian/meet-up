<script lang="ts">
	import type { ParticipantSummary } from '$lib/types';
	import Avatar from './Avatar.svelte';

	interface Props {
		participants: ParticipantSummary[];
		/** Participant ids that are unavailable in the hovered slot; dimmed when set. */
		unavailableIds?: Set<string>;
		emptyText?: string;
		class?: string;
	}

	let {
		participants,
		unavailableIds = new Set(),
		emptyText = 'No members yet',
		class: className = ''
	}: Props = $props();
</script>

<div class="p-3 {className}">
	<div class="mb-2 text-sm font-medium text-gray-900">Members</div>
	{#if participants.length === 0}
		<p class="text-sm text-gray-500">{emptyText}</p>
	{:else}
		<ul class="space-y-1">
			{#each participants as participant (participant.id)}
				{@const dimmed = unavailableIds.has(participant.id)}
				<li
					class="flex items-center gap-2 text-sm transition-opacity {dimmed
						? 'opacity-40'
						: 'opacity-100'}"
				>
					<Avatar src={participant.profile_picture} username={participant.username} size="sm" />
					<span class="truncate text-gray-700">{participant.username}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
