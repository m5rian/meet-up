import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.user) throw redirect(302, '/events');

	// Surface a reason from a failed OIDC callback (e.g. the IdP didn't provide a
	// usable username). The value is only used to pick a message in the UI.
	let error: string | null = null;
	const reason = url.searchParams.get('error');
	if (reason === 'missing_username' || reason === 'username_taken') error = reason;

	return { error };
};
