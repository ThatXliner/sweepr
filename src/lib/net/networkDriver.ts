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
	// Tactical attack hit: each listed target adds one shared hit to their own
	// incoming charge. The target's client creates and broadcasts a mine only
	// when its quarter-pool threshold is reached.
	| { kind: 'attack'; from: string; targets: string[] }
	// Tactical: the sender's CURRENT board layout — broadcast once after the
	// initial build and again on every regen, so peers' mirrors stay exact even
	// though each client's local bots mine the sender's board with local RNG.
	| { kind: 'newboard'; from: string; mines: Coord[] }
	// Player hit a mine / was eliminated.
	| { kind: 'dead'; from: string };

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
		if (stopped) return;
		if (payload.from !== peerMemberId) return;
		switch (payload.kind) {
			case 'reveal':
				reveal(payload.r, payload.c);
				break;
			case 'flag':
				flag(payload.r, payload.c);
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
