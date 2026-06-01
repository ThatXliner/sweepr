import { describe, it, expect } from 'vitest';
import { Game } from '$lib/gameLogic.svelte';
import { deduce } from '$lib/opponent.svelte';

describe('Game.generateBoard seeding', () => {
	it('places the requested number of mines', () => {
		const game = new Game(9, 9, 10);
		const mines = game.board.flat().filter((c) => c.isMine).length;
		expect(mines).toBe(10);
	});

	it('is deterministic for a given seed', () => {
		const a = new Game(9, 9, 10, 42);
		const b = new Game(9, 9, 10, 42);
		const layout = (g: Game) => g.board.flat().map((c) => (c.isMine ? 1 : 0));
		expect(layout(a)).toEqual(layout(b));
	});

	it('differs across seeds', () => {
		const a = new Game(9, 9, 10, 1);
		const b = new Game(9, 9, 10, 2);
		const layout = (g: Game) => g.board.flat().map((c) => (c.isMine ? 1 : 0));
		expect(layout(a)).not.toEqual(layout(b));
	});
});

describe('Game.fromMines', () => {
	it('places mines exactly at the given coords and counts adjacency', () => {
		const game = Game.fromMines(3, 3, [
			[0, 0],
			[2, 2]
		]);
		expect(game.mines).toBe(2);
		expect(game.flags).toBe(2);
		expect(game.board[0][0].isMine).toBe(true);
		expect(game.board[2][2].isMine).toBe(true);
		// Center touches both mines.
		expect(game.board[1][1].adjacentMines).toBe(2);
		// A corner opposite the mines touches neither directly... (0,2) is adjacent
		// to neither (0,0) nor (2,2).
		expect(game.board[0][2].adjacentMines).toBe(0);
	});

	it('produces a winnable board (revealing all non-mines wins)', () => {
		const game = Game.fromMines(2, 2, [[0, 0]]);
		game.revealCell(0, 1);
		game.revealCell(1, 0);
		game.revealCell(1, 1);
		expect(game.checkWin()).toBe(true);
		expect(game.checkLose()).toBe(false);
	});
});

describe('Game.injectMine', () => {
	it('adds a mine on a covered cell with no revealed neighbor', () => {
		// 5x5, one corner mine. Reveal a numbered cell next to it (adjacency 1, so
		// no flood-fill), leaving the rest of the board covered and far away.
		const game = Game.fromMines(5, 5, [[0, 0]]);
		const before = game.board.flat().filter((c) => c.isMine).length;
		game.revealCell(1, 1);

		const placed = game.injectMine();
		expect(placed).not.toBeNull();

		const after = game.board.flat();
		expect(after.filter((c) => c.isMine).length).toBe(before + 1);
		expect(game.mines).toBe(before + 1);

		// The new mine must not sit next to an already-revealed cell.
		for (let r = 0; r < 5; r++) {
			for (let c = 0; c < 5; c++) {
				if (!game.board[r][c].isMine) continue;
				if (r === 0 && c === 0) continue; // the original mine
				for (let i = Math.max(r - 1, 0); i <= Math.min(r + 1, 4); i++) {
					for (let j = Math.max(c - 1, 0); j <= Math.min(c + 1, 4); j++) {
						expect(game.board[i][j].isRevealed).toBe(false);
					}
				}
			}
		}
	});

	it('does not change adjacency numbers on already-revealed cells', () => {
		const game = Game.fromMines(5, 5, [[0, 0]]);
		game.revealCell(1, 1);
		const revealedBefore = game.board
			.flat()
			.filter((c) => c.isRevealed)
			.map((c) => c.adjacentMines);
		game.injectMine();
		const revealedAfter = game.board
			.flat()
			.filter((c) => c.isRevealed)
			.map((c) => c.adjacentMines);
		expect(revealedAfter).toEqual(revealedBefore);
	});

	it('returns null when no eligible cell exists', () => {
		// Tiny board fully revealed: nothing covered to inject into.
		const game = Game.fromMines(1, 2, [[0, 0]]);
		game.revealCell(0, 1);
		expect(game.injectMine()).toBeNull();
	});

	it('injectMineAt is deterministic across identical boards (no desync)', () => {
		// Two clients build the same board and apply the same attack cell — their
		// mine layouts and adjacency must end up byte-identical.
		const a = Game.fromMines(5, 5, [[0, 0]]);
		const b = Game.fromMines(5, 5, [[0, 0]]);
		a.injectMineAt(3, 3);
		b.injectMineAt(3, 3);
		const layout = (g: Game) => g.board.flat().map((c) => [c.isMine, c.adjacentMines]);
		expect(layout(a)).toEqual(layout(b));
		expect(a.board[3][3].isMine).toBe(true);
		// A neighbor of the new mine gains one adjacency.
		expect(a.board[2][2].adjacentMines).toBe(1);
	});
});

describe('bot deduction', () => {
	it('flags a cell it can prove is a mine', () => {
		// 1x2 with one mine. Reveal the safe cell: it reads "1", and its only
		// covered neighbor must be the mine.
		const game = Game.fromMines(1, 2, [[0, 0]]);
		game.revealCell(0, 1);
		const { mines, safe } = deduce(game);
		expect(mines).toContainEqual([0, 0]);
		expect(safe).toHaveLength(0);
	});

	it('marks remaining neighbors safe once the mine is flagged', () => {
		// 1x3, mine at the left end. Reveal the middle ("1") and flag the mine;
		// the right cell is then provably safe.
		const game = Game.fromMines(1, 3, [[0, 0]]);
		game.revealCell(0, 1);
		game.flagCell(0, 0);
		const { safe } = deduce(game);
		expect(safe).toContainEqual([0, 2]);
	});

	it('finds nothing certain on an ambiguous board', () => {
		// 1x3 with one mine somewhere in {0,2}; revealing the middle "1" can't
		// distinguish which end is the mine, so no certainty either way.
		const game = Game.fromMines(1, 3, [[0, 2]]);
		game.revealCell(0, 1);
		const { safe, mines } = deduce(game);
		// The "1" sees two covered neighbors and one mine — neither rule fires.
		expect(safe).toHaveLength(0);
		expect(mines).toHaveLength(0);
	});
});
