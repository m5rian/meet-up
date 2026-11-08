import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { startLogin } from '$lib/server/oidc';

export const GET: RequestHandler = async ({ cookies }) => {
	const url = await startLogin(cookies);
	throw redirect(302, url.toString());
};
