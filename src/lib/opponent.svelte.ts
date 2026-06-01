import { Game } from '$lib/gameLogic.svelte';

/**
 * The single seam between local bots and (future) networked opponents. Both a
 * local bot and a Supabase Realtime driver implement `start`/`stop`; the host
 * doesn't care which is mutating the opponent's `Game`. To swap in real
 * multiplayer later, write a driver whose tick applies *remote* moves instead
 * of generating them locally — nothing else changes.
 */
export interface OpponentDriver {
	start(): void;
	stop(): void;
}

export interface BotOptions {
	// Tick interval bounds in ms; each tick waits a random delay in [min, max].
	minDelay?: number;
	maxDelay?: number;
	// Probability (0..1) of ignoring the safe-ish frontier and picking a fully
	// random unrevealed cell — i.e. how often the bot takes a fatal risk.
	riskiness?: number;
	// Called after every move so the host can re-read `game.board` and check
	// win/lose (game.board is not itself reactive).
	onChange: () => void;
}

function key(r: number, c: number) {
	return `${r},${c}`;
}

/** All unrevealed, unflagged cells on the board. */
function unrevealedCells(game: Game): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let r = 0; r < game.board.length; r++) {
		for (let c = 0; c < game.board[0].length; c++) {
			const cell = game.board[r][c];
			if (!cell.isRevealed && !cell.isFlagged) out.push([r, c]);
		}
	}
	return out;
}

/**
 * The "frontier": unrevealed cells adjacent to an already-revealed cell. A
 * human expands from what they've opened, so this is where the bot plays. It's
 * not guaranteed safe (the bot has no solver), so it dies now and then — which
 * is the behavior we want.
 */
function frontierCells(game: Game): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	const rows = game.board.length;
	const cols = game.board[0].length;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < cols; c++) {
			const cell = game.board[r][c];
			if (cell.isRevealed || cell.isFlagged) continue;
			let adjacentRevealed = false;
			for (let i = Math.max(r - 1, 0); i <= Math.min(r + 1, rows - 1); i++) {
				for (let j = Math.max(c - 1, 0); j <= Math.min(c + 1, cols - 1); j++) {
					if (game.board[i][j].isRevealed) adjacentRevealed = true;
				}
			}
			if (adjacentRevealed) out.push([r, c]);
		}
	}
	return out;
}

function pick<T>(arr: T[]): T | undefined {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * A self-pacing sweeping bot. Drives `game` by calling the same `revealCell`
 * a human click would. Reused by both Blitz and Tactical's sweep phase.
 *
 * Stops on its own once the game is won or lost; the host observes that via the
 * `onChange` callback (which fires after every move).
 */
export function makeSweepBot(game: Game, opts: BotOptions): OpponentDriver {
	const minDelay = opts.minDelay ?? 600;
	const maxDelay = opts.maxDelay ?? 1200;
	const riskiness = opts.riskiness ?? 0.15;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	function step() {
		if (stopped) return;
		if (game.checkLose() || game.checkWin()) return;

		// First move: the board is untouched, so just open a random cell to get a
		// flood-fill frontier going (mirrors a human's blind opening click).
		const frontier = frontierCells(game);
		const useRandom = frontier.length === 0 || Math.random() < riskiness;
		const target = useRandom ? pick(unrevealedCells(game)) : pick(frontier);
		if (!target) return;

		game.revealCell(target[0], target[1]);
		opts.onChange();

		if (game.checkLose() || game.checkWin()) return;
		schedule();
	}

	function schedule() {
		const delay = minDelay + Math.random() * (maxDelay - minDelay);
		timer = setTimeout(step, delay);
	}

	return {
		start() {
			stopped = false;
			schedule();
		},
		stop() {
			stopped = true;
			if (timer) clearTimeout(timer);
		}
	};
}

// Blitz and Tactical use the same sweeping bot; named exports keep call sites
// self-documenting and give a place to diverge later if needed.
export const makeBlitzBot = makeSweepBot;
export const makeTacticalBot = makeSweepBot;

/**
 * Tactical placement: distribute `count` mines at random distinct cells of a
 * `rows`×`cols` board. Used to author the mines a bot drops on each opponent.
 */
export function randomMinePlacement(
	rows: number,
	cols: number,
	count: number,
	// Plain non-reactive dedup tracker, not reactive state.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	taken: Set<string> = new Set()
): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	let guard = 0;
	while (out.length < count && guard < count * 100) {
		guard++;
		const r = Math.floor(Math.random() * rows);
		const c = Math.floor(Math.random() * cols);
		const k = key(r, c);
		if (taken.has(k)) continue;
		taken.add(k);
		out.push([r, c]);
	}
	return out;
}
