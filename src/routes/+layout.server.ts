import type { LayoutServerLoad } from './$types';
import { db } from '$lib/server/db';
import { users } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const load: LayoutServerLoad = ({ locals }) => {
	if (!locals.user) return { user: null, profilePicture: null };

	const row = db
		.select({ profile_picture: users.profile_picture })
		.from(users)
		.where(eq(users.id, locals.user.id))
		.get();

	return {
		user: locals.user,
		profilePicture: row?.profile_picture ?? null
	};
};
