// Pure matchmaking core — no Supabase, no DOM, no reactivity. The reactive
// controller (matchmaker.svelte.ts) wires these into a live lobby channel.
// Kept in a plain .ts so it's trivially unit-testable.

export type Mode = 'blitz' | 'tactical';

// Tactical fills a 16-player arena; private rooms pair two humans.
export const MATCH_SIZE: Record<Mode, number> = { blitz: 2, tactical: 16 };
// Never start an online match with a missing opponent.
export const MIN_HUMANS: Record<Mode, number> = { blitz: 2, tactical: 2 };

export interface Member {
	memberId: string;
	userId: string;
	joinedAt: number;
	host?: boolean;
}

export interface MatchProposal {
	matchId: string;
	mode: Mode;
	members: string[]; // memberIds, ordered by slot (index = slot)
	seeds: number[]; // one board seed per slot (Blitz uses [0],[1]; Tactical per-slot)
}

/** The waiting queue: looking members sorted by (joinedAt, memberId). */
export function waitingQueue(members: Member[]): Member[] {
	return [...members].sort((a, b) =>
		a.joinedAt !== b.joinedAt ? a.joinedAt - b.joinedAt : a.memberId < b.memberId ? -1 : 1
	);
}

/** The single deterministic proposer = the queue head. Every client computes the
 * same head from the same Presence snapshot, so exactly one client proposes. */
export function proposer(members: Member[]): string | undefined {
	return waitingQueue(members)[0]?.memberId;
}

/**
 * Decide whether `me` should propose a match now, and if so which members.
 * `shortWaitElapsed` becomes true after the per-mode short-wait so Tactical can
 * start with a partial human roster. Returns the chosen memberIds (slot order)
 * or null if it's not time / not my job.
 */
export function shouldPropose(
	me: string,
	members: Member[],
	mode: Mode,
	shortWaitElapsed: boolean
): string[] | null {
	if (proposer(members) !== me) return null;
	const queue = waitingQueue(members);
	const size = MATCH_SIZE[mode];
	if (queue.length >= size) {
		// Enough for a full human match.
		return queue.slice(0, size).map((m) => m.memberId);
	}
	if (shortWaitElapsed && queue.length >= MIN_HUMANS[mode]) {
		// Start with whoever's here; the component bot-fills the rest.
		return queue.map((m) => m.memberId);
	}
	return null;
}

/** Build a deterministic seed array for the proposed members. The proposer is
 * the sole source of randomness; `rand` yields uint32s. */
export function buildSeeds(memberCount: number, rand: () => number): number[] {
	return Array.from({ length: memberCount }, () => rand() >>> 0);
}

export interface AcceptState {
	acceptedMatchId: string | null;
}

/**
 * Idempotent acceptance: a member accepts a `match` only if it names them and
 * they haven't already accepted one. Returns the proposal to act on, or null to
 * ignore (not for me / already matched / duplicate). This makes concurrent
 * proposals converge — the first match a member sees wins; the rest are dropped.
 */
export function onMatchMessage(
	state: AcceptState,
	me: string,
	proposal: MatchProposal
): MatchProposal | null {
	if (state.acceptedMatchId) return null; // already in a match
	if (!proposal.members.includes(me)) return null; // not for me
	state.acceptedMatchId = proposal.matchId;
	return proposal;
}

/** This client's slot index within an accepted match. */
export function slotOf(proposal: MatchProposal, me: string): number {
	return proposal.members.indexOf(me);
}

export function normalizeRoomCode(value: string): string | null {
	const code = value.trim().toUpperCase();
	return /^[A-Z2-9]{8}$/.test(code) ? code : null;
}

export function makeRoomCode(): string {
	const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
	return Array.from(
		crypto.getRandomValues(new Uint8Array(8)),
		(n) => alphabet[n % alphabet.length]
	).join('');
}

/** Only the room creator pairs with the earliest guest; strangers stay queued. */
export function privateRoomMembers(me: string, members: Member[]): string[] | null {
	const queue = waitingQueue(members);
	const host = queue.find((member) => member.host);
	const guest = queue.find((member) => !member.host);
	return host?.memberId === me && guest ? [me, guest.memberId] : null;
}
