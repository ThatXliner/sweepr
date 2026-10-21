import '$lib/server/tls';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createServerClient } from '@supabase/ssr';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	event.locals.supabase = createServerClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY, {
		cookies: {
			getAll: () => event.cookies.getAll(),
			/**
			 * SvelteKit's cookie API requires `path` to be explicitly set.
			 * Setting it to `/` replicates standard browser behaviour.
			 * https://kit.svelte.dev/docs/types#public-types-cookies
			 */
			setAll: (cookiesToSet) => {
				cookiesToSet.forEach(({ name, value, options }) => {
					event.cookies.set(name, value, { ...options, path: '/' });
				});
			}
		}
	});

	/**
	 * A little helper that validates the session via `getUser()` (which checks the
	 * JWT against the Supabase Auth server) instead of trusting the unverified
	 * session stored in the cookie. Returns the session only when the user is valid.
	 */
	event.locals.getSession = async () => {
		const {
			data: { user }
		} = await event.locals.supabase.auth.getUser();
		if (!user) return null;

		const {
			data: { session }
		} = await event.locals.supabase.auth.getSession();
		return session;
	};

	return resolve(event, {
		filterSerializedResponseHeaders(name) {
			return name === 'content-range';
		}
	});
};
