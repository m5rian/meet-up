<script lang="ts">
	import { enhance } from '$app/forms';
	import type { UserSummary } from '$lib/types';
	import { Button } from './';

	interface Props {
		users: UserSummary[];
		/** Users already invited/joined, excluded from the picker. */
		excludedIds: string[];
		error?: string | null;
	}

	let { users, excludedIds, error = null }: Props = $props();

	const available = $derived(users.filter((u) => !excludedIds.includes(u.id)));
</script>

<form method="POST" action="?/invite" use:enhance class="space-y-3">
	<label class="block">
		<span class="mb-1 block text-sm font-medium text-gray-700">Invite by name</span>
		<select
			name="username"
			class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm"
		>
			<option value="" disabled selected>Select a user…</option>
			{#each available as user (user.id)}
				<option value={user.username}>{user.username}</option>
			{/each}
		</select>
	</label>
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
	{#if available.length > 0}
		<Button type="submit">Invite</Button>
	{:else}
		<p class="text-sm text-gray-500">No more users to invite.</p>
	{/if}
</form>
