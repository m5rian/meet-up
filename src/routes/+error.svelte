<script lang="ts">
	import { resolve } from '$app/paths';

	let {
		error
	}: {
		error: { status?: number; message?: string } | null;
	} = $props();

	const status = $derived(error?.status ?? 500);
	const message = $derived(
		status === 404 ? 'That page could not be found.' : 'Something went wrong. Please try again.'
	);
</script>

<div class="mx-auto flex max-w-md flex-col items-center text-center">
	<h1 class="text-4xl font-bold text-gray-900">{status}</h1>
	<p class="mt-3 text-gray-600">{message}</p>
	<a
		href={resolve('/events')}
		class="mt-6 inline-flex items-center justify-center rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500"
	>
		Back to events
	</a>
</div>
