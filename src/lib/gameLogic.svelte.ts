export interface Cell {
	isMine: boolean;
	isRevealed: boolean;
	isFlagged: boolean;
	adjacentMines: number;
}

import { xoroshiro128plus } from 'pure-rand/generator/xoroshiro128plus';
import { uniformInt } from 'pure-rand/distribution/uniformInt';

export type Board = Cell[][];

/**
 * Returns a `(max) => int in [0, max)` function. When a seed is given it draws
 * from pure-rand's xoroshiro128+ so two players can get equally-difficult — or,
 * with the same seed, identical — boards; otherwise it falls back to the global
 * Math.random().
 */
function makeRandInt(seed: number | undefined): (max: number) => number {
	if (seed === undefined) return (max) => Math.floor(Math.random() * max);
	const rng = xoroshiro128plus(seed);
	return (max) => uniformInt(rng, 0, max - 1);
}

export class Game {
	public board: Board;
	public isFirstClick = true;
	public rows: number;
	public cols: number;
	public mines: number = $state(0);
	public flags: number = $state(0);

	constructor(rows: number, cols: number, mines: number, seed?: number) {
		this.board = this.generateBoard(rows, cols, mines, seed);
		this.rows = rows;
		this.cols = cols;
		this.mines = mines;
		this.flags = mines;
	}

	/**
	 * Build a Game from an explicit set of mine coordinates instead of random
	 * placement. Used by Tactical, where opponents author each other's mines.
	 */
	public static fromMines(rows: number, cols: number, mineCoords: Array<[number, number]>): Game {
		const game = new Game(rows, cols, 0);
		const board = game.board;
		for (const [row, col] of mineCoords) {
			if (Number.isInteger(row) && Number.isInteger(col) && board[row]?.[col])
				board[row][col].isMine = true;
		}
		game.computeAdjacency(board);
		game.mines = board.flat().filter((cell) => cell.isMine).length;
		game.flags = game.mines;
		return game;
	}
	public getBoard(): Board {
		return this.board;
	}
	public flagCell(row: number, col: number): Board {
		const cell = this.board[row][col];
		if (this.flags === 0 && !cell.isFlagged) return this.board;
		if (!cell.isRevealed) {
			this.flags += cell.isFlagged ? 1 : -1;
			cell.isFlagged = !cell.isFlagged;
		}
		return this.board;
	}

	public checkWin(): boolean {
		return this.board.every((row) => row.every((cell) => cell.isRevealed !== cell.isMine));
	}

	/** Tactical requires identifying the remaining mines before dealing again. */
	public checkTacticalClear(): boolean {
		return (
			!this.checkLose() &&
			this.board.every((row) =>
				row.every((cell) => (cell.isMine ? cell.isFlagged : cell.isRevealed && !cell.isFlagged))
			)
		);
	}

	public isSaturated(): boolean {
		return this.board.every((row) => row.every((cell) => cell.isRevealed || cell.isMine));
	}

	public checkLose(): boolean {
		return this.board.some((row) => row.some((cell) => cell.isRevealed && cell.isMine));
	}

	public revealCell(row: number, col: number): Board {
		const cell = this.board[row][col];
		if (cell.isRevealed) {
			let minesFlagged = 0;
			for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
				for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
					if (this.board[i][j].isRevealed) continue;
					minesFlagged += +this.board[i][j].isFlagged;
				}
			}
			if (minesFlagged == cell.adjacentMines) {
				for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
					for (
						let j = Math.max(col - 1, 0);
						j <= Math.min(col + 1, this.board[0].length - 1);
						j++
					) {
						if (this.board[i][j].isRevealed || this.board[i][j].isFlagged) continue;
						this.board = this.revealCell(i, j);
					}
				}
			}
			return this.board;
		}
		if (cell.isFlagged) return this.board;
		cell.isRevealed = true;
		if (cell.adjacentMines === 0 && !cell.isMine) {
			for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
				for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
					if (!this.board[i][j].isRevealed) {
						this.board = this.revealCell(i, j);
					}
				}
			}
		}
		return this.board;
	}

	public generateBoard(rows: number, cols: number, mines: number, seed?: number): Board {
		const board: Board = Array(rows)
			.fill(null)
			.map(() =>
				Array(cols)
					.fill(null)
					.map(
						(): Cell => ({
							isMine: false,
							isRevealed: false,
							isFlagged: false,
							adjacentMines: 0
						})
					)
			);
		// Seeded when a seed is given (so boards can be reproducible/equal across
		// players), otherwise the original global-random behavior.
		const randInt = makeRandInt(seed);
		let minesPlaced = 0;
		while (minesPlaced < mines) {
			const row = randInt(rows);
			const col = randInt(cols);
			if (!board[row][col].isMine) {
				board[row][col].isMine = true;
				minesPlaced++;
			}
		}
		this.computeAdjacency(board);
		return board;
	}

	/** Fill in each non-mine cell's adjacentMines from the placed mines. */
	private computeAdjacency(board: Board): void {
		const rows = board.length;
		const cols = board[0].length;
		for (let row = 0; row < rows; row++) {
			for (let col = 0; col < cols; col++) {
				if (board[row][col].isMine) continue;
				let count = 0;
				for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, rows - 1); i++) {
					for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, cols - 1); j++) {
						if (board[i][j].isMine) count++;
					}
				}
				board[row][col].adjacentMines = count;
			}
		}
	}

	private hasRevealedNeighbor(row: number, col: number): boolean {
		for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
			for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
				if (this.board[i][j].isRevealed) return true;
			}
		}
		return false;
	}

	/**
	 * Cells eligible to receive an injected mine: still-covered, unflagged, not
	 * already a mine, and with no revealed neighbor (so no visible number goes
	 * stale when a mine lands next to them).
	 */
	public injectMineCandidates(): Array<[number, number]> {
		const candidates: Array<[number, number]> = [];
		for (let row = 0; row < this.board.length; row++) {
			for (let col = 0; col < this.board[0].length; col++) {
				const cell = this.board[row][col];
				if (cell.isMine || cell.isRevealed || cell.isFlagged) continue;
				if (this.hasRevealedNeighbor(row, col)) continue;
				candidates.push([row, col]);
			}
		}
		return candidates;
	}

	/**
	 * Place a mine at an explicit cell and bump the adjacency of its covered
	 * neighbors. Used so online clients all inject at the SAME coordinates (the
	 * attacker picks the cell and broadcasts it) — random placement would desync.
	 */
	public injectMineAt(row: number, col: number): boolean {
		const cell = this.board[row]?.[col];
		if (
			!cell ||
			cell.isMine ||
			cell.isRevealed ||
			cell.isFlagged ||
			this.hasRevealedNeighbor(row, col)
		)
			return false;
		cell.isMine = true;
		this.mines++;
		this.flags++;
		// Only the new mine's covered neighbors change; recompute them.
		for (let i = Math.max(row - 1, 0); i <= Math.min(row + 1, this.board.length - 1); i++) {
			for (let j = Math.max(col - 1, 0); j <= Math.min(col + 1, this.board[0].length - 1); j++) {
				const c = this.board[i][j];
				if (!c.isMine) c.adjacentMines++;
			}
		}
		return true;
	}

	/**
	 * Drop a mine onto a random eligible cell and return where it landed (or null
	 * if the board is too full). Used by Tactical: a correct flag sends a mine to
	 * opponents. Online, the attacker calls this, then broadcasts the cell so
	 * peers apply it via `injectMineAt`.
	 */
	public injectMine(): [number, number] | null {
		const candidates = this.injectMineCandidates();
		if (candidates.length === 0) return null;
		const [row, col] = candidates[Math.floor(Math.random() * candidates.length)];
		this.injectMineAt(row, col);
		return [row, col];
	}
}
// Maps an adjacent-mine count to its number-color class. The `num-N` classes
// (defined in app.css) read from tokens, so they automatically follow the
// active light/dark theme and the colorblind-safe palette toggle.
export function getCellColor(mineCount: number) {
	return mineCount >= 1 && mineCount <= 8 ? `num-${mineCount}` : '';
}
