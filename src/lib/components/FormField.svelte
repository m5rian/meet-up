<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props {
		label: string;
		type?: 'text' | 'password' | 'date' | 'time' | 'number' | 'email';
		name: string;
		value?: string;
		placeholder?: string;
		required?: boolean;
		min?: string;
		max?: string;
		step?: string;
		autocomplete?: HTMLInputAttributes['autocomplete'];
		hint?: string;
		error?: string;
		children?: Snippet;
	}

	let {
		label,
		type = 'text',
		name,
		value = '',
		placeholder,
		required = false,
		min,
		max,
		step,
		autocomplete,
		hint,
		error,
		children
	}: Props = $props();
</script>

<label class="block">
	<span class="mb-1 block text-sm font-medium text-gray-700">{label}</span>
	<input
		{type}
		{name}
		{value}
		{placeholder}
		{required}
		{min}
		{max}
		{step}
		{autocomplete}
		class="block w-full rounded-md border-0 px-3 py-2 text-gray-900 shadow-sm ring-1 ring-gray-300 ring-inset placeholder:text-gray-400 focus:ring-2 focus:ring-indigo-600 focus:ring-inset sm:text-sm {error
			? 'ring-red-500'
			: ''}"
	/>
	{#if error}
		<span class="mt-1 block text-sm text-red-600">{error}</span>
	{:else if hint}
		<span class="mt-1 block text-sm text-gray-500">{hint}</span>
	{/if}
	{@render children?.()}
</label>
