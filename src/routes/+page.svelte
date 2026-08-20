<script lang="ts">
	import { enhance } from '$app/forms';
	import { Button, FormField } from '$lib/components';

	let {
		form
	}: { form: { register?: boolean; login?: boolean; username?: string; error?: string } | null } =
		$props();

	const registerError = $derived(form?.register ? form.error : undefined);
	const loginError = $derived(form?.login ? form.error : undefined);
	const username = $derived(form?.username ?? '');
	const timezone = $derived(Intl.DateTimeFormat().resolvedOptions().timeZone);
</script>

<div class="mx-auto max-w-md">
	<h1 class="mb-1 text-center text-2xl font-bold text-gray-900">Meet-Up</h1>
	<p class="mb-6 text-center text-sm text-gray-500">
		Schedule meetings with a heatmap of everyone's availability.
	</p>

	<div class="grid grid-cols-1 gap-6">
		<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Create an account</h2>
			<form method="POST" action="?/register" use:enhance class="space-y-4">
				<FormField
					label="Username"
					name="username"
					value={username}
					required
					autocomplete="username"
					error={registerError}
				/>
				<FormField
					label="Password"
					type="password"
					name="password"
					required
					autocomplete="new-password"
					hint="At least 12 characters, with a number, a letter, and a symbol."
					error={registerError}
				/>
				<input type="hidden" name="timezone" value={timezone} />
				<Button type="submit" class="w-full">Register</Button>
			</form>
		</section>

		<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
			<h2 class="mb-4 text-lg font-semibold text-gray-900">Log in</h2>
			<form method="POST" action="?/login" use:enhance class="space-y-4">
				<FormField
					label="Username"
					name="username"
					value={username}
					required
					autocomplete="username"
					error={loginError}
				/>
				<FormField
					label="Password"
					type="password"
					name="password"
					required
					autocomplete="current-password"
					error={loginError}
				/>
				<input type="hidden" name="timezone" value={timezone} />
				<Button type="submit" class="w-full">Log in</Button>
			</form>
		</section>
	</div>
</div>
