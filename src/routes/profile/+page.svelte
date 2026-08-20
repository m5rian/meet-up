<script lang="ts">
	import type { CalendarConnection, UserProfile } from '$lib/types';
	import {
		Avatar,
		ProfilePictureForm,
		SleepScheduleForm,
		CalendarIntegrationForm,
		CalendarFeedSection
	} from '$lib/components';

	let {
		data
	}: {
		data: {
			profile: UserProfile;
			calendars: CalendarConnection[];
			feedUrl: string;
			pictureError?: string;
			pictureSaved?: boolean;
			sleepError?: string;
			sleepSaved?: boolean;
			calendarError?: string;
			calendarSaved?: boolean;
			tokenRegenerated?: boolean;
		};
	} = $props();
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-xl font-bold text-gray-900">Profile</h1>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Account</h2>
		<div class="flex items-center gap-4">
			<Avatar src={data.profile.profile_picture} username={data.profile.username} size="lg" />
			<div>
				<p class="font-medium text-gray-900">{data.profile.username}</p>
				<p class="text-sm text-gray-500">Time zone: {data.profile.tz_id ?? 'Unknown'}</p>
			</div>
		</div>
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Profile picture</h2>
		{#if data.pictureSaved}
			<div class="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">Picture updated.</div>
		{/if}
		<ProfilePictureForm error={data.pictureError} />
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Sleep schedule</h2>
		{#if data.sleepSaved}
			<div class="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">
				Sleep schedule saved.
			</div>
		{/if}
		<SleepScheduleForm
			sleepStart={data.profile.sleep_start}
			sleepEnd={data.profile.sleep_end}
			error={data.sleepError}
		/>
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Calendar</h2>
		{#if data.calendarSaved}
			<div class="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">Calendar updated.</div>
		{/if}
		<CalendarIntegrationForm calendars={data.calendars} error={data.calendarError} />
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Calendar feed</h2>
		<CalendarFeedSection feedUrl={data.feedUrl} regenerated={data.tokenRegenerated} />
	</section>
</div>
