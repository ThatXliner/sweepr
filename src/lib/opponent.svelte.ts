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

export type Difficulty = 'easy' | 'medium' | 'hard';

// Difficulty is purely how fast the bots move — they always play with the same
// deduction skill. Each tier maps to a tick-delay range in ms.
export const DIFFICULTY_DELAYS: Record<Difficulty, { minDelay: number; maxDelay: number }> = {
	easy: { minDelay: 1200, maxDelay: 2000 },
	medium: { minDelay: 600, maxDelay: 1200 },
	hard: { minDelay: 250, maxDelay: 500 }
};

export const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

export interface BotOptions {
	// Tick interval bounds in ms; each tick waits a random delay in [min, max].
	// This is the ONLY difficulty lever — a slower bot is easier to beat. The
	// bot always plays as well as single-cell deduction allows.
	minDelay?: number;
	maxDelay?: number;
	// Called after every move so the host can re-read `game.board` and check
	// win/lose (game.board is not itself reactive).
	onChange: () => void;
	// Called when the bot correctly flags a mine (it always flags only cells it
	// has proven are mines). Tactical uses this to send a mine to opponents.
	onCorrectFlag?: () => void;
}

function key(r: number, c: number) {
	return `${r},${c}`;
}

function neighbors(game: Game, r: number, c: number): Array<[number, number]> {
	const out: Array<[number, number]> = [];
	for (let i = Math.max(r - 1, 0); i <= Math.min(r + 1, game.board.length - 1); i++) {
		for (let j = Math.max(c - 1, 0); j <= Math.min(c + 1, game.board[0].length - 1); j++) {
			if (i !== r || j !== c) out.push([i, j]);
		}
	}
	return out;
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
 * The "frontier": unrevealed, unflagged cells adjacent to a revealed cell —
 * where a guess is least bad when no deduction is available.
 */
function frontierCells(game: Game): Array<[number, number]> {
	return unrevealedCells(game).filter(([r, c]) =>
		neighbors(game, r, c).some(([i, j]) => game.board[i][j].isRevealed)
	);
}

function pick<T>(arr: T[]): T | undefined {
	return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * One pass of classic single-cell minesweeper deduction over every revealed
 * number, returning provably-safe cells to open and provably-mined cells to
 * flag. Two rules:
 *   - if a number already touches as many flags as its count, its remaining
 *     covered neighbors are all safe;
 *   - if a number's covered (incl. flagged) neighbor count equals its count,
 *     those covered neighbors are all mines.
 */
export function deduce(game: Game): {
	safe: Array<[number, number]>;
	mines: Array<[number, number]>;
} {
	// Plain dedup maps, not reactive state.
	/* eslint-disable svelte/prefer-svelte-reactivity */
	const safe = new Map<string, [number, number]>();
	const mines = new Map<string, [number, number]>();
	/* eslint-enable svelte/prefer-svelte-reactivity */
	for (let r = 0; r < game.board.length; r++) {
		for (let c = 0; c < game.board[0].length; c++) {
			const cell = game.board[r][c];
			if (!cell.isRevealed || cell.adjacentMines === 0) continue;
			const covered = neighbors(game, r, c).filter(([i, j]) => !game.board[i][j].isRevealed);
			const flagged = covered.filter(([i, j]) => game.board[i][j].isFlagged);
			const unflagged = covered.filter(([i, j]) => !game.board[i][j].isFlagged);
			if (flagged.length === cell.adjacentMines) {
				for (const [i, j] of unflagged) safe.set(key(i, j), [i, j]);
			} else if (covered.length === cell.adjacentMines) {
				for (const [i, j] of unflagged) mines.set(key(i, j), [i, j]);
			}
		}
	}
	return { safe: [...safe.values()], mines: [...mines.values()] };
}

/**
 * A self-pacing sweeping bot that plays with basic deduction: it opens cells it
 * can prove are safe and flags cells it can prove are mines, and only guesses
 * when deduction is exhausted (so it can still die on a forced guess). Skill is
 * fixed; difficulty comes solely from how fast it ticks. Drives `game` via the
 * same `revealCell`/`flagCell` a human would. Reused by Blitz and Tactical.
 *
 * Stops on its own once the game is won or lost; the host observes that via the
 * `onChange` callback (which fires after every move).
 */
export function makeSweepBot(game: Game, opts: BotOptions): OpponentDriver {
	const minDelay = opts.minDelay ?? 600;
	const maxDelay = opts.maxDelay ?? 1200;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	function step() {
		if (stopped) return;
		if (game.checkLose() || game.checkWin()) return;

		const { safe, mines } = deduce(game);

		if (mines.length > 0) {
			// Provably a mine — flag it. In Tactical this attacks opponents.
			const [r, c] = pick(mines)!;
			game.flagCell(r, c);
			opts.onCorrectFlag?.();
		} else if (safe.length > 0) {
			// Provably safe — open it, no risk.
			const [r, c] = pick(safe)!;
			game.revealCell(r, c);
		} else {
			// Deduction exhausted: guess a frontier cell, or open a random cell to
			// get started / when the frontier is empty.
			const frontier = frontierCells(game);
			const target = frontier.length > 0 ? pick(frontier) : pick(unrevealedCells(game));
			if (!target) return;
			game.revealCell(target[0], target[1]);
		}

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
