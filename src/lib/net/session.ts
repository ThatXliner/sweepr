import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Ensure the client has a Supabase session, signing in anonymously if not, and
 * return the user id. Called lazily when the player clicks "Find match" so the
 * solo modes stay login-free.
 */
export async function ensureAnonSession(supabase: SupabaseClient): Promise<string> {
	const {
		data: { session }
	} = await supabase.auth.getSession();
	if (session?.user) return session.user.id;

	const { data, error } = await supabase.auth.signInAnonymously();
	if (error || !data.user) {
		throw new Error(`anonymous sign-in failed: ${error?.message ?? 'no user'}`);
	}
	return data.user.id;
}

/**
 * A stable per-tab identity for matchmaking and Presence. Two tabs share one
 * anonymous user id, so we suffix a random token to keep them distinct (and to
 * disambiguate the rare anon-id collision).
 */
export function makeMemberId(userId: string): string {
	return `${userId}:${crypto.randomUUID()}`;
}
