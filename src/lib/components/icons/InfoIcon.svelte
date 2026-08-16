<script lang="ts">
	interface Props {
		class?: string;
	}
	let { class: className = '' }: Props = $props();
</script>

<svg
	class={className}
	xmlns="http://www.w3.org/2000/svg"
	viewBox="0 0 24 24"
	fill="none"
	stroke="currentColor"
	stroke-width="2"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" />
	<path d="M12 8v4" />
	<path d="M12 16h.01" />
</svg>
