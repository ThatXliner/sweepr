import { describe, it, expect } from 'vitest';
import { Game } from '$lib/gameLogic.svelte';

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
