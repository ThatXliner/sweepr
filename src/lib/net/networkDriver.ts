import type { RealtimeChannel } from '@supabase/supabase-js';
import { Game } from '$lib/gameLogic.svelte';
import type { OpponentDriver } from '$lib/opponent.svelte';

// Coordinates as a plain tuple travel well over JSON broadcast.
export type Coord = [number, number];

/**
 * Every gameplay message a peer broadcasts. One Realtime event (`move`) carries
 * all of them, discriminated by `kind`, so a single listener handles the lot.
 * `from` is the sender's memberId; `slot` (where present) is the player index.
 */
export type NetMsg =
	| { kind: 'reveal'; from: string; r: number; c: number }
	| { kind: 'flag'; from: string; r: number; c: number }
	// Blitz: the sender's board for this round, as a seed (peers rebuild it).
	| { kind: 'seed'; from: string; seed: number }
	// Tactical placement phase: mines this player dropped, keyed by target slot.
	| { kind: 'placement'; from: string; byTarget: Record<number, Coord[]> }
	// Tactical attack: the exact cell to inject on each target slot's board.
	| { kind: 'attack'; from: string; cells: Record<number, Coord> }
	// Tactical board regen on clear: the fresh board's mine coordinates.
	| { kind: 'newboard'; from: string; mines: Coord[] }
	// Player hit a mine / was eliminated.
	| { kind: 'dead'; from: string }
	// Score readout (Blitz progress, lightweight).
	| { kind: 'score'; from: string; cleared: number; alive: boolean };

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
				// attack, seed and score are handled by the host's own listener.
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
