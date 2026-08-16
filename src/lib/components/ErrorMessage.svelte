<script lang="ts">
	interface Props {
		message: string;
	}
	let { message }: Props = $props();
</script>

<div class="rounded-md bg-red-50 p-3 text-sm text-red-700" role="alert">
	{message}
</div>
