<script lang="ts">
	interface Props {
		message: string;
	}
	let { message }: Props = $props();
</script>

<div class="rounded-md bg-green-50 p-3 text-sm text-green-700" role="status">
	{message}
</div>
