<script lang="ts">
	import { resolve } from '$app/paths';
	import { Avatar } from './';
	import { CalendarIcon, LogoutIcon } from './icons';

	interface Props {
		username: string;
		profilePicture: string | null;
	}

	let { username, profilePicture }: Props = $props();
</script>

<header class="border-b border-gray-200 bg-white">
	<div class="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
		<a
			href={resolve('/events')}
			class="flex items-center gap-2 text-lg font-semibold text-gray-900"
		>
			<CalendarIcon class="h-5 w-5 text-indigo-600" />
			Meet-Up
		</a>
		<nav class="flex items-center gap-3">
			<a
				href={resolve('/profile')}
				class="flex items-center gap-2 rounded-md px-2 py-1 text-sm font-medium text-gray-700 hover:bg-gray-100"
			>
				<Avatar src={profilePicture} {username} size="sm" />
				<span>{username}</span>
			</a>
			<form method="POST" action={resolve('/logout')}>
				<button
					type="submit"
					class="inline-flex items-center gap-1 rounded-md px-2 py-1 text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700"
					aria-label="Log out"
				>
					<LogoutIcon class="h-4 w-4" />
				</button>
			</form>
		</nav>
	</div>
</header>
