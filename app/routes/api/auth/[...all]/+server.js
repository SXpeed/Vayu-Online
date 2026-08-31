/**
 * Vayu — Better Auth's own endpoints, at /api/auth/*.
 *
 * Better Auth ships a framework-agnostic handler. Its SvelteKit binding
 * (better-auth/svelte-kit) declares `peerOptional @sveltejs/kit: ^2.0.0` and
 * does not support Kit 3, so the core handler is called directly rather than
 * through toSvelteKitHandler.
 *
 * This route is matched ahead of the generic /api dispatcher because
 * SvelteKit prefers the more specific route over [...path].
 */

import { error } from '@sveltejs/kit';
import { getAuth, upgradeLegacyPassword } from '#lib/server/auth.js';

const SIGN_IN_EMAIL = '/api/auth/sign-in/email';

async function handleAuth({ request, platform, url }) {
    const env = platform?.env;
    if (!env?.DB) error(503, 'Bindings unavailable.');

    const auth = getAuth(env);

    // A sign-in with email and password is the one moment we hold the
    // plaintext and know whose it is, so it is the only place a legacy scrypt
    // hash can be quietly upgraded. Read from a clone — the handler still
    // needs the original body stream.
    const isSignIn = request.method === 'POST' && url.pathname === SIGN_IN_EMAIL;
    let submitted = null;
    if (isSignIn) {
        try {
            submitted = await request.clone().json();
        } catch {
            submitted = null;
        }
    }

    const response = await auth.handler(request);

    if (isSignIn && response.ok && submitted?.password) {
        // The signed-in user's id comes back in the response body. Reading it
        // from a clone leaves the original stream intact for the caller.
        try {
            const body = await response.clone().json();
            const userId = body?.user?.id;
            if (userId) {
                platform.ctx.waitUntil(
                    upgradeLegacyPassword(env, userId, submitted.password),
                );
            }
        } catch (err) {
            // The upgrade is opportunistic and must never affect the sign-in.
            console.error('[vayu] legacy password upgrade skipped', err);
        }
    }

    return response;
}

/**
 * Declared as named functions rather than aliases of one handler: SvelteKit
 * validates a route's exports against the compiled output, where two consts
 * pointing at the same function collapse to a single minified name it does
 * not recognise.
 */
export async function GET(event) {
    const { request, url, platform } = event;

    // Intercept GET requests for social sign in (made by standard <a> links)
    // and convert them to POST for better-auth.
    if (url.pathname === '/api/auth/sign-in/social') {
        const provider = url.searchParams.get('provider');
        const callbackURL = url.searchParams.get('callbackURL');

        if (provider) {
            const env = platform?.env;
            if (!env?.DB) error(503, 'Bindings unavailable.');
            
            const postReq = new Request(request.url, {
                method: 'POST',
                headers: request.headers,
                body: JSON.stringify({ provider, callbackURL })
            });
            // Ensure the content-type is json since we added a json body
            postReq.headers.set('content-type', 'application/json');

            const auth = getAuth(env);
            const response = await auth.handler(postReq);
            
            if (response.ok) {
                const data = await response.clone().json().catch(() => null);
                if (data?.url) {
                    const redirect = new Response(null, { 
                        status: 302, 
                        headers: response.headers 
                    });
                    redirect.headers.set('Location', data.url);
                    return redirect;
                }
            }
            return response;
        }
    }

    return handleAuth(event);
}

export async function POST(event) {
    return handleAuth(event);
}
