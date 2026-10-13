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
	MATCH_SIZE,
	privateRoomMembers
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

// Bound the search so a missing opponent cannot leave the menu stuck.
const TIMEOUT_MS: Record<Mode, number> = { blitz: 10_000, tactical: 15_000 };
const PROPOSE_DEBOUNCE_MS = 300;

/**
 * Reactive quick-match controller. Opens a per-mode lobby channel, rendezvouses
 * via Presence, and forms a match with the race-safe proposer/accept rule. On
 * success `result` holds the game channel + slot assignment; on timeout `status`
 * becomes 'fallback' (caller starts a local bot game).
 */
export function createMatchmaker(
	supabase: SupabaseClient,
	mode: Mode,
	options: { room?: { code: string; host: boolean } } = {}
) {
	let status = $state<MatchStatus>('searching');
	let result = $state<MatchResult | null>(null);

	let lobby: RealtimeChannel | undefined;
	let memberId = '';
	let userId = '';
	let errorMessage = $state('');
	let gameChannel: RealtimeChannel | undefined;
	const joinedAt = Date.now();
	const acceptState = { acceptedMatchId: null as string | null };
	let proposeTimer: ReturnType<typeof setTimeout> | undefined;
	let giveUpTimer: ReturnType<typeof setTimeout> | undefined;
	let disposed = false;
	let shortWaitElapsed = false;
	let shortWaitTimer: ReturnType<typeof setTimeout> | undefined;

	function presenceMembers(): Member[] {
		if (!lobby) return [];
		const state = lobby.presenceState<{
			memberId: string;
			userId: string;
			joinedAt: number;
			host?: boolean;
		}>();
		return Object.values(state)
			.flat()
			.map((m) => ({ memberId: m.memberId, userId: m.userId, joinedAt: m.joinedAt, host: m.host }));
	}

	function maybePropose() {
		if (disposed || acceptState.acceptedMatchId || !lobby) return;
		clearTimeout(proposeTimer);
		// Debounce so Presence settles and the queue head is stable.
		proposeTimer = setTimeout(() => {
			if (disposed || acceptState.acceptedMatchId || !lobby) return;
			const members = presenceMembers();
			const chosen = options.room
				? privateRoomMembers(memberId, members)
				: shouldPropose(memberId, members, mode, shortWaitElapsed);
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
		if (
			!proposal ||
			proposal.mode !== mode ||
			typeof proposal.matchId !== 'string' ||
			!Array.isArray(proposal.members) ||
			!proposal.members.every((id) => typeof id === 'string') ||
			proposal.members.length < 2 ||
			proposal.members.length > (options.room ? 2 : MATCH_SIZE[mode]) ||
			// eslint-disable-next-line svelte/prefer-svelte-reactivity
			new Set(proposal.members).size !== proposal.members.length ||
			!Array.isArray(proposal.seeds) ||
			proposal.seeds.length !== proposal.members.length ||
			!proposal.seeds.every((seed) => Number.isInteger(seed) && seed >= 0)
		)
			return;
		if (options.room && !proposal.members.includes(memberId)) {
			errorMessage = 'Room is full. Create another room to play.';
			status = 'error';
			return;
		}
		const taken = onMatchMessage(acceptState, memberId, proposal);
		if (!taken || disposed) return;
		clearTimeout(proposeTimer);
		clearTimeout(giveUpTimer);
		clearTimeout(shortWaitTimer);
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
		gameChannel = game;
		try {
			await new Promise<void>((resolve, reject) => {
				const timeout = setTimeout(
					() => reject(new Error('Opponent did not join the match. Please try again.')),
					15_000
				);
				let tracked = false;
				const checkRoster = () => {
					const present = Object.values(game.presenceState<{ memberId: string }>())
						.flat()
						.map((p) => p.memberId);
					if (tracked && taken.members.every((id) => present.includes(id))) {
						clearTimeout(timeout);
						resolve();
					}
				};
				game.on('presence', { event: 'sync' }, checkRoster);
				game.subscribe(async (state) => {
					if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
						clearTimeout(timeout);
						reject(new Error('Could not connect to the match. Please try again.'));
					} else if (state === 'SUBSCRIBED') {
						const response = await game.track({ memberId, userId });
						if (response !== 'ok') {
							clearTimeout(timeout);
							reject(new Error('Could not join the match. Please try again.'));
							return;
						}
						tracked = true;
						checkRoster();
					}
				});
			});
		} catch (error) {
			await supabase.removeChannel(game);
			if (!disposed) {
				errorMessage = error instanceof Error ? error.message : 'Match connection failed.';
				status = 'error';
			}
			return;
		}
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
		} catch (error) {
			if (disposed) return;
			errorMessage = error instanceof Error ? error.message : 'Sign-in failed.';
			status = 'error';
			return;
		}
		if (disposed) return;
		memberId = makeMemberId(userId);

		lobby = supabase.channel(options.room ? `room:${mode}:${options.room.code}` : `lobby:${mode}`, {
			config: { broadcast: { self: true }, presence: { key: memberId } }
		});

		lobby.on('broadcast', { event: 'match' }, ({ payload }) => {
			void accept(payload as MatchProposal);
		});
		lobby.on('presence', { event: 'sync' }, () => maybePropose());

		lobby.subscribe(async (s) => {
			if (s === 'SUBSCRIBED' && lobby) {
				await lobby.track({
					memberId,
					userId,
					joinedAt,
					status: 'looking',
					host: options.room?.host ?? false
				});
				maybePropose();
			}
		});

		if (!options.room && mode === 'tactical') {
			shortWaitTimer = setTimeout(() => {
				shortWaitElapsed = true;
				maybePropose();
			}, 8_000);
		}

		// Private rooms allow time to share a code and ready a friend.
		giveUpTimer = setTimeout(
			() => {
				if (!acceptState.acceptedMatchId && !disposed) {
					errorMessage = options.room
						? 'Room timed out. Check the code or create a new room.'
						: 'No opponent found. Try again or practice against a bot.';
					status = 'fallback';
				}
			},
			options.room ? (options.room.host ? 300_000 : 30_000) : TIMEOUT_MS[mode]
		);
	}

	void start();

	async function cancel() {
		disposed = true;
		clearTimeout(proposeTimer);
		clearTimeout(giveUpTimer);
		clearTimeout(shortWaitTimer);
		if (lobby) {
			await supabase.removeChannel(lobby);
			lobby = undefined;
		}
		if (gameChannel) await supabase.removeChannel(gameChannel);
		if (status === 'searching') status = 'cancelled';
	}

	return {
		get status() {
			return status;
		},
		get result() {
			return result;
		},
		get errorMessage() {
			return errorMessage;
		},
		matchSize: options.room ? 2 : MATCH_SIZE[mode],
		cancel
	};
}
