import type { RealtimeChannel } from '@supabase/supabase-js';
import { Game } from '$lib/gameLogic.svelte';
import type { OpponentDriver } from '$lib/opponent.svelte';

// Coordinates as a plain tuple travel well over JSON broadcast.
export type Coord = [number, number];

/**
 * Every gameplay message a peer broadcasts. One Realtime event (`move`) carries
 * all of them, discriminated by `kind`, so a single listener handles the lot.
 * `from` is the sender's memberId.
 */
export type NetMsg =
	| { kind: 'reveal'; from: string; r: number; c: number }
	| { kind: 'flag'; from: string; r: number; c: number }
	// Blitz: the sender's board for this round, as a seed (peers rebuild it).
	| { kind: 'seed'; from: string; seed: number }
	// Tactical placement phase: mines this player dropped, keyed by the TARGET's
	// memberId. Slot indices are local to each client (slot 0 = self), so only
	// memberIds have a shared meaning on the wire.
	| { kind: 'placement'; from: string; byTarget: Record<string, Coord[]> }
	// Tactical attack hit: the single listed target adds one hit to their own
	// incoming charge. The target's client creates and broadcasts a mine only
	// when its quarter-pool threshold is reached.
	| { kind: 'attack'; from: string; targets: string[] }
	| { kind: 'mine'; from: string; r: number; c: number }
	// Tactical: the sender's CURRENT board layout — broadcast once after the
	// initial build and again on every regen, so peers' mirrors stay exact even
	// though each client's local bots mine the sender's board with local RNG.
	| { kind: 'newboard'; from: string; mines: Coord[] }
	// Player hit a mine / was eliminated.
	| { kind: 'dead'; from: string };

/** Validate broadcast payloads before they reach board mutations. */
export function isNetMsg(value: unknown): value is NetMsg {
	if (!value || typeof value !== 'object') return false;
	const msg = value as Record<string, unknown>;
	if (typeof msg.from !== 'string' || !msg.from) return false;
	const coord = (v: unknown): v is Coord =>
		Array.isArray(v) && v.length === 2 && v.every((n) => Number.isInteger(n) && n >= 0);
	const coords = (v: unknown) => Array.isArray(v) && v.length <= 1024 && v.every(coord);
	switch (msg.kind) {
		case 'reveal':
		case 'flag':
		case 'mine':
			return coord([msg.r, msg.c]);
		case 'dead':
			return true;
		case 'seed':
			return Number.isInteger(msg.seed) && Number(msg.seed) >= 0;
		case 'newboard':
			return coords(msg.mines);
		case 'attack':
			return (
				Array.isArray(msg.targets) &&
				msg.targets.length === 1 &&
				msg.targets.every((id) => typeof id === 'string')
			);
		case 'placement':
			return (
				!!msg.byTarget &&
				typeof msg.byTarget === 'object' &&
				!Array.isArray(msg.byTarget) &&
				Object.values(msg.byTarget).every(coords)
			);
		default:
			return false;
	}
}

export const MOVE_EVENT = 'move';

/** Broadcast one move to the game channel. `self: false` keeps it off the sender. */
export function broadcastMove(channel: RealtimeChannel, msg: NetMsg): void {
	channel.send({ type: 'broadcast', event: MOVE_EVENT, payload: msg });
}

export interface NetworkDriverOptions {
	// Re-read game.board + check win/lose, same contract as the bot's onChange.
	onChange: () => void;
	// Apply a reveal/flag to the mirror game (so the host can mirror its own
	// reveal side effects like flood-fill). Defaults to the game's own methods.
	onReveal?: (r: number, c: number) => void;
	onFlag?: (r: number, c: number) => void;
	// Tactical: peer reported elimination.
	onDead?: () => void;
	// Tactical: peer rebuilt its board (regen on clear).
	onNewBoard?: (mines: Coord[]) => void;
	onMine?: (r: number, c: number) => void;
}

/**
 * A network-backed OpponentDriver: instead of generating moves like the bot, it
 * applies the moves a specific peer broadcasts to the mirror `Game`. Because it
 * implements the same `OpponentDriver` interface, BlitzGame/TacticalGame use it
 * wherever they'd use a bot — no host changes.
 */
export function makeNetworkDriver(
	game: Game,
	channel: RealtimeChannel,
	peerMemberId: string,
	opts: NetworkDriverOptions
): OpponentDriver {
	let stopped = true;

	const reveal = opts.onReveal ?? ((r: number, c: number) => game.revealCell(r, c));
	const flag = opts.onFlag ?? ((r: number, c: number) => game.flagCell(r, c));

	function handler({ payload }: { payload: NetMsg }) {
		if (stopped || !isNetMsg(payload)) return;
		if (payload.from !== peerMemberId) return;
		switch (payload.kind) {
			case 'reveal':
				if (
					!Number.isInteger(payload.r) ||
					!Number.isInteger(payload.c) ||
					!game.board[payload.r]?.[payload.c]
				)
					return;
				reveal(payload.r, payload.c);
				break;
			case 'flag':
				if (
					!Number.isInteger(payload.r) ||
					!Number.isInteger(payload.c) ||
					!game.board[payload.r]?.[payload.c]
				)
					return;
				flag(payload.r, payload.c);
				break;
			case 'mine':
				(opts.onMine ?? ((r, c) => game.injectMineAt(r, c)))(payload.r, payload.c);
				break;
			case 'newboard':
				opts.onNewBoard?.(payload.mines);
				break;
			case 'dead':
				opts.onDead?.();
				break;
			default:
				// reveal/flag/newboard/dead are this driver's concern; placement,
				// attack and seed are handled by the host's own listener.
				return;
		}
		opts.onChange();
	}

	channel.on('broadcast', { event: MOVE_EVENT }, handler);

	return {
		start() {
			stopped = false;
		},
		stop() {
			stopped = true;
		}
	};
}
