import { Game } from '$lib/gameLogic.svelte';
import { deduce, findGuesslessSeed, findSafeOpeningSeed } from '$lib/solver';

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

// Difficulty is how fast the bots move — they always play with the same
// (perfect) deduction skill. Each tier maps to a tick-delay range in ms.
export const DIFFICULTY_DELAYS: Record<Difficulty, { minDelay: number; maxDelay: number }> = {
	easy: { minDelay: 1200, maxDelay: 2000 },
	medium: { minDelay: 600, maxDelay: 1200 },
	hard: { minDelay: 250, maxDelay: 500 }
};

// ...with one humanizing exception: easy bots occasionally misclick — they
// reveal a random covered cell instead of their deduced move, which can kill
// them. Probability per move; zero for the serious tiers.
export const DIFFICULTY_MISCLICK: Record<Difficulty, number> = {
	easy: 0.04,
	medium: 0,
	hard: 0
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
	// Guessless mode: the bot's first move re-deals its board (same mine count)
	// to be fully solvable from its chosen opening — the same guarantee humans
	// get. On such boards the bot is a perfect solver and never guesses.
	guessless?: boolean;
	// Chance per move that the bot misclicks (reveals a random covered cell
	// instead of its deduced move). The easy tier's beatable-bot lever.
	misclickChance?: number;
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
 * A self-pacing sweeping bot driven by the shared solver (`$lib/solver`): it
 * opens cells it can prove are safe and flags cells it can prove are mines,
 * and only guesses when deduction is exhausted. With `guessless` on, its first
 * move re-deals the board to be solvable from its opening, so deduction is
 * NEVER exhausted — the bot is a perfect solver and difficulty comes solely
 * from how fast it ticks. Drives `game` via the same `revealCell`/`flagCell` a
 * human would. Reused by Blitz and Tactical.
 *
 * Stops on its own once the game is won or lost; the host observes that via
 * the `onChange` callback (which fires after every move).
 */
export function makeSweepBot(game: Game, opts: BotOptions): OpponentDriver {
	const minDelay = opts.minDelay ?? 600;
	const maxDelay = opts.maxDelay ?? 1200;
	let timer: ReturnType<typeof setTimeout> | undefined;
	let stopped = false;

	function step() {
		if (stopped) return;
		if (game.checkLose() || game.checkWin()) return;

		if (opts.guessless && game.isFirstClick) {
			// Same first-click guarantee the human gets: pick an opening, re-deal
			// the board (same mine count) until it's guessless from there — or, past
			// guessless density, at least safely openable.
			game.isFirstClick = false;
			const r = Math.floor(Math.random() * game.board.length);
			const c = Math.floor(Math.random() * game.board[0].length);
			const seed =
				findGuesslessSeed(game.rows, game.cols, game.mines, r, c) ??
				findSafeOpeningSeed(game.rows, game.cols, game.mines, r, c);
			if (seed !== null) {
				game.board = game.generateBoard(game.rows, game.cols, game.mines, seed);
			}
			game.revealCell(r, c);
			opts.onChange();
			if (!game.checkLose() && !game.checkWin()) schedule();
			return;
		}

		if ((opts.misclickChance ?? 0) > 0 && Math.random() < opts.misclickChance!) {
			// Fumble: open a random covered cell, deductions be damned. May die.
			const target = pick(unrevealedCells(game));
			if (target) {
				game.revealCell(target[0], target[1]);
				opts.onChange();
				if (!game.checkLose() && !game.checkWin()) schedule();
				return;
			}
		}

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
