<script lang="ts">
	interface Props {
		src: string | null;
		username: string;
		size?: 'sm' | 'md' | 'lg';
		class?: string;
	}
	let { src, username, size = 'md', class: className = '' }: Props = $props();

	const sizes: Record<string, string> = {
		sm: 'h-6 w-6 text-xs',
		md: 'h-8 w-8 text-sm',
		lg: 'h-12 w-12 text-lg'
	};

	const initial = $derived(username.slice(0, 1).toUpperCase());
</script>

{#if src}
	<img {src} alt={username} class="rounded-full object-cover {sizes[size]} {className}" />
{:else}
	<span
		class="inline-flex items-center justify-center rounded-full bg-indigo-100 font-semibold text-indigo-700 {sizes[
			size
		]} {className}"
		aria-hidden="true"
	>
		{initial}
	</span>
{/if}
