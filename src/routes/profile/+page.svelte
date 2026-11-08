<script lang="ts">
	import type { CalendarConnection, UserProfile } from '$lib/types';
	import {
		Avatar,
		Button,
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
			timezoneError?: string;
			timezoneSaved?: boolean;
		};
	} = $props();
</script>

<div class="mx-auto max-w-2xl space-y-6">
	<h1 class="text-xl font-bold text-gray-900">Profile</h1>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Account</h2>
		<div class="flex items-center gap-4">
			<Avatar src={data.profile.profile_picture} username={data.profile.username} size="lg" />
			<p class="font-medium text-gray-900">{data.profile.username}</p>
		</div>
	</section>

	<section class="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
		<h2 class="mb-4 text-lg font-semibold text-gray-900">Time zone</h2>
		{#if data.timezoneSaved}
			<div class="mb-3 rounded-md bg-green-50 p-3 text-sm text-green-700">Time zone saved.</div>
		{/if}
		{#if data.timezoneError}
			<div class="mb-3 rounded-md bg-red-50 p-3 text-sm text-red-700">{data.timezoneError}</div>
		{/if}
		<form method="POST" action="?/update-timezone" class="space-y-4">
			<select
				name="timezone"
				class="block w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
			>
				{#each Intl.supportedValuesOf('timeZone') as tz (tz)}
					<option value={tz} selected={data.profile.tz_id === tz}>{tz}</option>
				{/each}
			</select>
			<Button type="submit" class="w-full">Save time zone</Button>
		</form>
		<p class="mt-2 text-xs text-gray-500">
			Used to interpret your sleep schedule and to show event times in your zone.
		</p>
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
