// The guessless-mode deduction engine. One solver, two jobs:
//   1. Board generation — `findGuesslessSeed` rerolls seeds until the board is
//      provably solvable from the first click with no guessing.
//   2. Bots — `deduce` is the bot's brain. Because generation and bots share
//      the same deduction closure, a bot on a guessless board is a perfect
//      solver BY CONSTRUCTION: it can never reach a state the generator
//      didn't already prove solvable. Speed is the only difficulty lever.
//
// Deduction strength (and therefore board difficulty ceiling):
//   - single-cell rules (a number's covered neighbors all mines / all safe),
//   - the subset rule (constraint A ⊆ B ⇒ B−A carries B−A's count difference,
//     which cracks the classic 1-2 patterns),
//   - the global mine count (0 mines left ⇒ all covered safe; mines left =
//     covered left ⇒ all covered mines), which closes out endgames.
//
// Plain .ts on purpose: no reactivity, trivially unit-testable.

import { Game, type Board } from '$lib/gameLogic.svelte';

export type Coord = [number, number];

// Everything the solver needs from a game. `Game` satisfies this, as do the
// throwaway simulation copies below. NOTE: the global mine-count rule trusts
// flags, so callers must only flag proven mines (true for bots and sims).
export interface GameView {
	board: Board;
	mines: number;
}

function key(r: number, c: number) {
	return `${r},${c}`;
}

function neighbors(board: Board, r: number, c: number): Coord[] {
	const out: Coord[] = [];
	for (let i = Math.max(r - 1, 0); i <= Math.min(r + 1, board.length - 1); i++) {
		for (let j = Math.max(c - 1, 0); j <= Math.min(c + 1, board[0].length - 1); j++) {
			if (i !== r || j !== c) out.push([i, j]);
		}
	}
	return out;
}

interface Constraint {
	cells: Coord[]; // covered, unflagged neighbors of a revealed number
	keys: Set<string>;
	need: number; // mines still unaccounted for among `cells`
}

/**
 * Full deduction pass: returns every cell provably safe and every cell
 * provably a mine from the current visible state. Each call is one fixpoint
 * step — callers loop until no progress (bots apply one move per tick instead,
 * which reaches the same closure).
 */
export function deduce(game: GameView): { safe: Coord[]; mines: Coord[] } {
	const board = game.board;
	const safe = new Map<string, Coord>();
	const mines = new Map<string, Coord>();

	// Build one constraint per revealed number that still has covered neighbors.
	const constraints: Constraint[] = [];
	for (let r = 0; r < board.length; r++) {
		for (let c = 0; c < board[0].length; c++) {
			const cell = board[r][c];
			if (!cell.isRevealed || cell.adjacentMines === 0) continue;
			const covered = neighbors(board, r, c).filter(([i, j]) => !board[i][j].isRevealed);
			const flagged = covered.filter(([i, j]) => board[i][j].isFlagged).length;
			const cells = covered.filter(([i, j]) => !board[i][j].isFlagged);
			if (cells.length === 0) continue;
			constraints.push({
				cells,
				keys: new Set(cells.map(([i, j]) => key(i, j))),
				need: cell.adjacentMines - flagged
			});
		}
	}

	const markSafe = (cs: Coord[]) => cs.forEach(([i, j]) => safe.set(key(i, j), [i, j]));
	const markMines = (cs: Coord[]) => cs.forEach(([i, j]) => mines.set(key(i, j), [i, j]));

	// Single-cell rules.
	for (const con of constraints) {
		if (con.need <= 0) markSafe(con.cells);
		else if (con.need === con.cells.length) markMines(con.cells);
	}

	// Subset rule: if A's cells ⊆ B's cells, the difference B−A needs exactly
	// B.need − A.need mines.
	for (const a of constraints) {
		for (const b of constraints) {
			if (a === b || a.cells.length >= b.cells.length) continue;
			if (![...a.keys].every((k) => b.keys.has(k))) continue;
			const diff = b.cells.filter(([i, j]) => !a.keys.has(key(i, j)));
			const need = b.need - a.need;
			if (need === 0) markSafe(diff);
			else if (need === diff.length) markMines(diff);
		}
	}

	// Global mine count over ALL covered cells (not just the frontier).
	const covered: Coord[] = [];
	let flaggedTotal = 0;
	for (let r = 0; r < board.length; r++) {
		for (let c = 0; c < board[0].length; c++) {
			const cell = board[r][c];
			if (cell.isRevealed) continue;
			if (cell.isFlagged) flaggedTotal++;
			else covered.push([r, c]);
		}
	}
	const remaining = game.mines - flaggedTotal;
	if (remaining === 0) markSafe(covered);
	else if (remaining === covered.length && covered.length > 0) markMines(covered);

	return { safe: [...safe.values()], mines: [...mines.values()] };
}

/**
 * A throwaway simulation copy of a board: same reveals, flags wiped (flags are
 * claims, not knowledge). Built on `Game` so flood-fill reveals come for free.
 */
function simFrom(view: GameView): Game {
	const sim = new Game(view.board.length, view.board[0].length, 0);
	sim.board = view.board.map((row) => row.map((cell) => ({ ...cell, isFlagged: false })));
	sim.mines = view.mines;
	sim.flags = view.mines;
	return sim;
}

/** Run deduction to fixpoint on a sim; true iff the whole board gets solved. */
function closure(sim: Game): boolean {
	for (;;) {
		if (sim.checkWin()) return true;
		const { safe, mines } = deduce(sim);
		let progress = false;
		for (const [r, c] of mines) {
			if (!sim.board[r][c].isFlagged) {
				sim.flagCell(r, c);
				progress = true;
			}
		}
		for (const [r, c] of safe) {
			if (!sim.board[r][c].isRevealed) {
				sim.board = sim.revealCell(r, c);
				progress = true;
			}
		}
		if (!progress) return sim.checkWin();
	}
}

/** Is the board fully solvable by pure logic after opening (r, c)? */
export function isSolvableFrom(view: GameView, r: number, c: number): boolean {
	const sim = simFrom(view);
	sim.board = sim.revealCell(r, c);
	if (sim.checkLose()) return false;
	return closure(sim);
}

/** Is the board still fully solvable by pure logic from its current state? */
export function isSolvableNow(view: GameView): boolean {
	return closure(simFrom(view));
}

/**
 * Does the current board already satisfy guessless mode for this opening —
 * the click opens a flood region AND the whole board solves without guessing?
 * Lets callers skip the seed search when the dealt board happens to be good
 * (and, online, keep the matchmaker-agreed seed when possible).
 */
export function isGuesslessOpening(view: GameView, r: number, c: number): boolean {
	const cell = view.board[r][c];
	if (cell.isMine || cell.adjacentMines !== 0) return false;
	return isSolvableFrom(view, r, c);
}

/**
 * Search random seeds for a board that's guessless from the given first click.
 * Returns the seed (the caller regenerates with it — and, online, broadcasts
 * it) or null if the cap runs out, in which case callers degrade to plain
 * first-click safety rather than hanging.
 */
export function findGuesslessSeed(
	rows: number,
	cols: number,
	mines: number,
	row: number,
	col: number,
	maxAttempts = 3000
): number | null {
	for (let i = 0; i < maxAttempts; i++) {
		const seed = Math.floor(Math.random() * 0xffffffff);
		const game = new Game(rows, cols, mines, seed);
		const cell = game.board[row][col];
		// Cheap filter first: the opening must be a flood cell.
		if (cell.isMine || cell.adjacentMines !== 0) continue;
		if (isSolvableFrom(game, row, col)) return seed;
	}
	return null;
}

/**
 * Fallback dealer for densities beyond what guessless generation can satisfy
 * (e.g. a Tactical board late in a long match, swollen with attack mines):
 * prefer a seed whose opening floods (a zero cell), else one where the opening
 * at least isn't a mine. Null only when the board is practically all mines.
 */
export function findSafeOpeningSeed(
	rows: number,
	cols: number,
	mines: number,
	row: number,
	col: number,
	maxAttempts = 600
): number | null {
	let nonMine: number | null = null;
	for (let i = 0; i < maxAttempts; i++) {
		const seed = Math.floor(Math.random() * 0xffffffff);
		const game = new Game(rows, cols, mines, seed);
		const cell = game.board[row][col];
		if (!cell.isMine && cell.adjacentMines === 0) return seed;
		if (!cell.isMine && nonMine === null) nonMine = seed;
	}
	return nonMine;
}

/**
 * Pick an injection cell (Tactical attack) that keeps the victim's board
 * solvable: try a bounded number of eligible cells and return the first whose
 * hypothetical mine leaves the board guessless from its current state. Returns
 * null when none qualifies — the caller falls back to a plain random
 * injection (or, if there are no eligible cells at all, buries the victim).
 * Boards with nothing revealed yet skip the search: they re-deal guessless on
 * their first click anyway, so any spot is fine.
 */
export function pickGuesslessInjection(game: Game, maxTries = 12): Coord | null {
	const anyRevealed = game.board.some((row) => row.some((c) => c.isRevealed));
	if (!anyRevealed) return null;
	const candidates = game.injectMineCandidates();
	// Partial Fisher–Yates: sample up to maxTries candidates without bias.
	const n = Math.min(maxTries, candidates.length);
	for (let i = 0; i < n; i++) {
		const j = i + Math.floor(Math.random() * (candidates.length - i));
		[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
		const [r, c] = candidates[i];
		const sim = simFrom(game);
		sim.injectMineAt(r, c);
		if (closure(sim)) return [r, c];
	}
	return null;
}
