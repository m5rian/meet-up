<script lang="ts">
	import type { Snippet } from 'svelte';
	import { SpinnerIcon } from './icons';

	interface Props {
		type?: 'submit' | 'button' | 'reset';
		variant?: 'primary' | 'secondary' | 'danger';
		disabled?: boolean;
		pending?: boolean;
		class?: string;
		formaction?: string;
		children: Snippet;
		onclick?: (event: MouseEvent) => void;
	}

	let {
		type = 'submit',
		variant = 'primary',
		disabled = false,
		pending = false,
		class: className = '',
		formaction,
		children,
		onclick
	}: Props = $props();

	const variants: Record<string, string> = {
		primary: 'bg-indigo-600 text-white hover:bg-indigo-500 focus-visible:outline-indigo-600',
		secondary:
			'bg-white text-gray-700 ring-1 ring-inset ring-gray-300 hover:bg-gray-50 focus-visible:outline-gray-400',
		danger: 'bg-red-600 text-white hover:bg-red-500 focus-visible:outline-red-600'
	};
</script>

<button
	{type}
	{disabled}
	{onclick}
	{formaction}
	class="inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-60 {variants[
		variant
	]} {className}"
>
	{#if pending}
		<SpinnerIcon class="h-4 w-4 animate-spin" />
	{:else}
		{@render children()}
	{/if}
</button>
