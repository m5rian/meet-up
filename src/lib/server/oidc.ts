/**
 * OIDC Relying Party client (ARCHITECTURE.md §1 "Authentication").
 *
 * All accounts authenticate through a single external OIDC provider (Google,
 * Keycloak, Auth0, ...). The app never sees a password; the IdP's `sub` claim is
 * the unique link to a user, and the `username` is taken verbatim from a
 * configurable profile claim (`OIDC_USERNAME_CLAIM`, default `preferred_username`).
 *
 * Uses `openid-client` (authorization code + PKCE flow with discovery). The
 * existing DB-backed cookie session system is reused; this module only handles
 * the OIDC handshake and identity extraction.
 */
import { env } from '$env/dynamic/private';
import {
	allowInsecureRequests,
	authorizationCodeGrant,
	buildAuthorizationUrl,
	calculatePKCECodeChallenge,
	discovery,
	randomNonce,
	randomPKCECodeVerifier,
	randomState,
	type Configuration
} from 'openid-client';
import type { Cookies } from '@sveltejs/kit';

const DEFAULT_SCOPE = 'openid profile';
const DEFAULT_USERNAME_CLAIM = 'preferred_username';

/** Name of the cookie that carries the in-progress OIDC handshake values. */
export const OIDC_STATE_COOKIE = 'ft_oidc_state';

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface OidcHandshake {
	state: string;
	nonce: string;
	codeVerifier: string;
}

export interface OidcIdentity {
	/** The IdP's subject claim — the unique link to the user. */
	sub: string;
	/** The issuer the subject belongs to (normalized discovery issuer URL). */
	issuer: string;
	/** The username, taken verbatim from the configured claim. */
	username: string;
}

export type OidcCallbackError = 'missing_state' | 'exchange_failed' | 'missing_username';

/**
 * Read OIDC configuration from env and validate that required values are present.
 * Fails fast at first use (startup) so misconfiguration surfaces immediately.
 */
function readConfig() {
	const issuer = env.OIDC_ISSUER;
	const clientId = env.OIDC_CLIENT_ID;
	const clientSecret = env.OIDC_CLIENT_SECRET;
	if (!issuer || !clientId || !clientSecret) {
		throw new Error(
			'OIDC_ISSUER, OIDC_CLIENT_ID, and OIDC_CLIENT_SECRET must be set to enable OIDC auth.'
		);
	}
	const scope = env.OIDC_SCOPE || DEFAULT_SCOPE;
	const usernameClaim = env.OIDC_USERNAME_CLAIM || DEFAULT_USERNAME_CLAIM;
	const baseUrl = (env.BASE_URL || '').replace(/\/$/, '');
	const redirectUri = env.OIDC_REDIRECT_URI || `${baseUrl}/auth/callback`;
	return { issuer, clientId, clientSecret, scope, usernameClaim, redirectUri };
}

let configPromise: Promise<Configuration> | null = null;

/**
 * Lazily discover the IdP metadata and build the client (cached per process).
 *
 * By default `openid-client` refuses to talk to plain `http://` issuers. For
 * local development against an http-only IdP, set `OIDC_ALLOW_INSECURE=true`
 * to disable that guard (for discovery and all subsequent requests). Never
 * enable it in production.
 */
function getConfig(): Promise<Configuration> {
	if (!configPromise) {
		const { issuer, clientId, clientSecret } = readConfig();
		const insecure = env.OIDC_ALLOW_INSECURE === 'true';
		const execute = insecure
			? // eslint-disable-next-line @typescript-eslint/no-deprecated -- intentional dev-only escape hatch
				[allowInsecureRequests]
			: undefined;
		configPromise = discovery(new URL(issuer), clientId, clientSecret, undefined, {
			execute
		});
	}
	return configPromise;
}

function setStateCookie(cookies: Cookies, handshake: OidcHandshake): void {
	const origin = env.ORIGIN;
	const secure = origin ? origin.startsWith('https://') : false;
	cookies.set(OIDC_STATE_COOKIE, JSON.stringify(handshake), {
		path: '/auth/callback',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: STATE_TTL_MS / 1000
	});
}

function clearStateCookie(cookies: Cookies): void {
	cookies.delete(OIDC_STATE_COOKIE, { path: '/auth/callback' });
}

/**
 * Begin the authorization code flow: generate a fresh state/nonce/PKCE verifier,
 * persist them in a cookie, and return the URL to redirect the user to the IdP.
 */
export async function startLogin(cookies: Cookies): Promise<URL> {
	const config = await getConfig();
	const { scope, redirectUri } = readConfig();

	const state = randomState();
	const nonce = randomNonce();
	const codeVerifier = randomPKCECodeVerifier();
	const codeChallenge = await calculatePKCECodeChallenge(codeVerifier);

	setStateCookie(cookies, { state, nonce, codeVerifier });

	return buildAuthorizationUrl(config, {
		redirect_uri: redirectUri,
		scope,
		state,
		nonce,
		code_challenge: codeChallenge,
		code_challenge_method: 'S256'
	});
}

/**
 * Complete the authorization code flow. `url` is the full callback URL the IdP
 * redirected the browser to. Validates state/nonce/PKCE, exchanges the code,
 * and extracts the identity from the ID token.
 *
 * Returns `err` when the handshake is invalid (missing/invalid state cookie, or
 * the exchange fails) or when the username claim is absent.
 */
export async function handleCallback(
	cookies: Cookies,
	url: URL
): Promise<{ ok: true; identity: OidcIdentity } | { ok: false; error: OidcCallbackError }> {
	const config = await getConfig();

	const raw = cookies.get(OIDC_STATE_COOKIE);
	if (!raw) return { ok: false, error: 'missing_state' };

	let handshake: OidcHandshake;
	try {
		handshake = JSON.parse(raw) as OidcHandshake;
	} catch {
		clearStateCookie(cookies);
		return { ok: false, error: 'missing_state' };
	}

	// Always consume the one-time handshake cookie.
	clearStateCookie(cookies);

	let tokens;
	try {
		tokens = await authorizationCodeGrant(config, url, {
			expectedState: handshake.state,
			expectedNonce: handshake.nonce,
			pkceCodeVerifier: handshake.codeVerifier
		});
	} catch {
		return { ok: false, error: 'exchange_failed' };
	}

	const claims = tokens.claims();
	if (!claims?.sub || typeof claims.sub !== 'string') {
		return { ok: false, error: 'exchange_failed' };
	}

	const { usernameClaim } = readConfig();
	const username = claims[usernameClaim];
	if (typeof username !== 'string' || username.length === 0) {
		return { ok: false, error: 'missing_username' };
	}

	return {
		ok: true,
		identity: {
			sub: claims.sub,
			issuer: config.serverMetadata().issuer,
			username
		}
	};
}
