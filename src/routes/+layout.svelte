<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';
	import type { Snippet } from 'svelte';
	import { AppHeader } from '$lib/components';

	let {
		children,
		data
	}: {
		children: Snippet;
		data: { user: { id: string; username: string } | null; profilePicture: string | null } | null;
	} = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

{#if data?.user}
	<AppHeader username={data.user.username} profilePicture={data.profilePicture} />
{/if}

<main class="mx-auto max-w-5xl px-4 py-6">
	{@render children()}
</main>
