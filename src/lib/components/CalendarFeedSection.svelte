<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button } from './';
	import { CopyIcon, RefreshIcon } from './icons';

	interface Props {
		feedUrl: string;
		/** True when the token was just regenerated (so the new URL is shown). */
		regenerated?: boolean;
	}

	let { feedUrl, regenerated = false }: Props = $props();

	let copied = $state(false);

	async function copyFeedUrl(): Promise<void> {
		try {
			await navigator.clipboard.writeText(feedUrl);
			copied = true;
			setTimeout(() => (copied = false), 2000);
		} catch {
			// Clipboard unavailable; ignore.
		}
	}
</script>

<section class="space-y-3">
	{#if regenerated}
		<div class="rounded-md bg-green-50 p-3 text-sm text-green-700">
			Feed URL regenerated. The old URL no longer works.
		</div>
	{/if}

	<p class="text-sm text-gray-600">
		Subscribe to this private feed in your calendar app to get your finalized meetings
		automatically. New meetings appear once your provider re-polls.
	</p>

	<div class="flex items-center gap-2">
		<code
			class="min-w-0 flex-1 truncate rounded-md bg-gray-50 px-3 py-2 text-xs text-gray-700 ring-1 ring-gray-200 ring-inset"
			title={feedUrl}>{feedUrl}</code
		>
		<Button type="button" variant="secondary" onclick={copyFeedUrl} class="shrink-0">
			<CopyIcon class="h-4 w-4" />
			{copied ? 'Copied!' : 'Copy'}
		</Button>
	</div>

	<p class="text-xs text-gray-500">
		This URL is secret — anyone with it can read your finalized meetings. Regenerate it to
		invalidate the old link.
	</p>

	<form method="POST" action="?/regenerate-calendar-token" use:enhance>
		<Button type="submit" variant="secondary">
			<RefreshIcon class="h-4 w-4" />
			Regenerate feed URL
		</Button>
	</form>
</section>
