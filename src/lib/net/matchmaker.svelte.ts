import type { RealtimeChannel, SupabaseClient } from '@supabase/supabase-js';
import { ensureAnonSession, makeMemberId } from './session';
import {
	type Mode,
	type Member,
	type MatchProposal,
	shouldPropose,
	buildSeeds,
	onMatchMessage,
	slotOf,
	MATCH_SIZE
} from './matchmaker';

export interface MatchResult {
	matchId: string;
	mode: Mode;
	channel: RealtimeChannel; // the game channel, already subscribed
	members: string[]; // memberIds by slot
	seeds: number[]; // board seed per slot
	you: number; // your slot index
	yourMemberId: string;
}

export type MatchStatus = 'searching' | 'matched' | 'fallback' | 'error' | 'cancelled';

// How long to wait before giving up to bots, and the short-wait after which
// Tactical will start with a partial human roster.
const TIMEOUT_MS: Record<Mode, number> = { blitz: 10_000, tactical: 15_000 };
const SHORT_WAIT_MS: Record<Mode, number> = { blitz: 10_000, tactical: 8_000 };
const PROPOSE_DEBOUNCE_MS = 300;

/**
 * Reactive quick-match controller. Opens a per-mode lobby channel, rendezvouses
 * via Presence, and forms a match with the race-safe proposer/accept rule. On
 * success `result` holds the game channel + slot assignment; on timeout `status`
 * becomes 'fallback' (caller starts a local bot game).
 */
export function createMatchmaker(supabase: SupabaseClient, mode: Mode) {
	let status = $state<MatchStatus>('searching');
	let result = $state<MatchResult | null>(null);

	let lobby: RealtimeChannel | undefined;
	let memberId = '';
	let userId = '';
	const joinedAt = Date.now();
	const acceptState = { acceptedMatchId: null as string | null };
	let proposeTimer: ReturnType<typeof setTimeout> | undefined;
	let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
	let shortWaitElapsed = false;
	let disposed = false;

	function presenceMembers(): Member[] {
		if (!lobby) return [];
		const state = lobby.presenceState<{ memberId: string; userId: string; joinedAt: number }>();
		return Object.values(state)
			.flat()
			.map((m) => ({ memberId: m.memberId, userId: m.userId, joinedAt: m.joinedAt }));
	}

	function maybePropose() {
		if (disposed || acceptState.acceptedMatchId || !lobby) return;
		clearTimeout(proposeTimer);
		// Debounce so Presence settles and the queue head is stable.
		proposeTimer = setTimeout(() => {
			if (disposed || acceptState.acceptedMatchId || !lobby) return;
			const members = presenceMembers();
			const chosen = shouldPropose(memberId, members, mode, shortWaitElapsed);
			if (!chosen) return;
			const proposal: MatchProposal = {
				matchId: crypto.randomUUID(),
				mode,
				members: chosen,
				seeds: buildSeeds(chosen.length, () => Math.floor(Math.random() * 0x1_0000_0000))
			};
			lobby.send({ type: 'broadcast', event: 'match', payload: proposal });
		}, PROPOSE_DEBOUNCE_MS);
	}

	async function accept(proposal: MatchProposal) {
		const taken = onMatchMessage(acceptState, memberId, proposal);
		if (!taken || disposed) return;
		clearTimeout(proposeTimer);
		clearTimeout(giveUpTimer);
		// Leave the lobby so we vanish from everyone's queue.
		if (lobby) {
			await lobby.untrack();
			await supabase.removeChannel(lobby);
			lobby = undefined;
		}
		// Open and subscribe the dedicated game channel.
		const game = supabase.channel(`game:${taken.matchId}`, {
			config: { broadcast: { self: false }, presence: { key: memberId } }
		});
		await new Promise<void>((resolve) => {
			game.subscribe((s) => {
				if (s === 'SUBSCRIBED') resolve();
			});
		});
		await game.track({ memberId, userId });
		if (disposed) {
			await supabase.removeChannel(game);
			return;
		}
		result = {
			matchId: taken.matchId,
			mode,
			channel: game,
			members: taken.members,
			seeds: taken.seeds,
			you: slotOf(taken, memberId),
			yourMemberId: memberId
		};
		status = 'matched';
	}

	async function start() {
		try {
			userId = await ensureAnonSession(supabase);
		} catch {
			status = 'error';
			return;
		}
		if (disposed) return;
		memberId = makeMemberId(userId);

		lobby = supabase.channel(`lobby:${mode}`, {
			config: { broadcast: { self: true }, presence: { key: memberId } }
		});

		lobby.on('broadcast', { event: 'match' }, ({ payload }) => {
			void accept(payload as MatchProposal);
		});
		lobby.on('presence', { event: 'sync' }, () => maybePropose());

		lobby.subscribe(async (s) => {
			if (s === 'SUBSCRIBED' && lobby) {
				await lobby.track({ memberId, userId, joinedAt, status: 'looking' });
				maybePropose();
			}
		});

		// Tactical can start partially-filled after the short wait.
		setTimeout(() => {
			shortWaitElapsed = true;
			maybePropose();
		}, SHORT_WAIT_MS[mode]);

		// Hard give-up → caller falls back to bots.
		giveUpTimer = setTimeout(() => {
			if (!acceptState.acceptedMatchId && !disposed) {
				status = 'fallback';
			}
		}, TIMEOUT_MS[mode]);
	}

	void start();

	async function cancel() {
		disposed = true;
		clearTimeout(proposeTimer);
		clearTimeout(giveUpTimer);
		if (lobby) {
			await supabase.removeChannel(lobby);
			lobby = undefined;
		}
		if (status === 'searching') status = 'cancelled';
	}

	return {
		get status() {
			return status;
		},
		get result() {
			return result;
		},
		matchSize: MATCH_SIZE[mode],
		cancel
	};
}
