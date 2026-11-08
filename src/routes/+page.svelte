<script lang="ts">
	import { resolve } from '$app/paths';
	import { Button } from '$lib/components';

	let {
		data
	}: {
		data: { error: string | null };
	} = $props();

	const errorMessage = $derived(
		data.error === 'missing_username'
			? 'Sign-in failed: the account did not provide a valid username. Contact your administrator to fix the identity provider profile.'
			: data.error === 'username_taken'
				? 'Sign-in failed: this username is already in use. Contact your administrator to resolve the conflict.'
				: data.error
					? 'Sign-in failed. Please try again.'
					: null
	);
</script>

<div class="mx-auto max-w-md">
	<h1 class="mb-1 text-center text-2xl font-bold text-gray-900">Meet-Up</h1>
	<p class="mb-6 text-center text-sm text-gray-500">
		Schedule meetings with a heatmap of everyone's availability.
	</p>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-1 text-lg font-semibold text-gray-900">Sign in</h2>
		<p class="mb-4 text-sm text-gray-500">Use your organization's account to sign in.</p>

		{#if errorMessage}
			<div class="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-700">{errorMessage}</div>
		{/if}

		<a href={resolve('/auth')} class="block w-full">
			<Button class="w-full">Sign in with your account</Button>
		</a>
	</section>
</div>
