<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './';
	import { UploadIcon } from './icons';

	interface Props {
		error?: string | null;
	}

	let { error = null }: Props = $props();
</script>

<form
	method="POST"
	action="?/update-profile-picture"
	enctype="multipart/form-data"
	use:enhance
	class="space-y-3"
>
	<label class="block">
		<span class="mb-1 block text-sm font-medium text-gray-700">Profile picture</span>
		<input
			type="file"
			name="picture"
			accept="image/*"
			class="block w-full text-sm text-gray-700 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-indigo-700 hover:file:bg-indigo-100"
		/>
	</label>
	{#if error}
		<p class="text-sm text-red-600">{error}</p>
	{/if}
	<p class="text-sm text-gray-500">Resized to 32×32 on upload.</p>
	<Button type="submit">
		<UploadIcon class="h-4 w-4" />
		Upload
	</Button>
</form>
