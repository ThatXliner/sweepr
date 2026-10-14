import { describe, it, expect } from 'vitest';
import { Game } from '$lib/gameLogic.svelte';
import {
	deduce,
	isSolvableFrom,
	isSolvableNow,
	isGuesslessOpening,
	findGuesslessSeed,
	pickGuesslessInjection
} from './solver';

describe('deduce — subset rule', () => {
	it('cracks the classic 1-2 pattern', () => {
		// 2x3, mines in the top corners:
		//   M . M      revealed bottom row reads  1 2 1
		//   1 2 1
		// Single-cell rules see "1 touches 2 covered" (no call) and "2 touches 3
		// covered" (no call). The subset rule (left 1 ⊆ middle 2) proves the
		// corner mines and the safe top-middle.
		const game = Game.fromMines(2, 3, [
			[0, 0],
			[0, 2]
		]);
		game.revealCell(1, 0);
		game.revealCell(1, 1);
		game.revealCell(1, 2);
		const { mines } = deduce(game);
		expect(mines).toContainEqual([0, 0]);
		expect(mines).toContainEqual([0, 2]);
		// With the corner mines flagged, the next pass proves the top-middle safe.
		game.flagCell(0, 0);
		game.flagCell(0, 2);
		expect(deduce(game).safe).toContainEqual([0, 1]);
	});

	it('uses the global mine count to close out an endgame', () => {
		// 1x4 with one mine at the far end, middle two revealed. The frontier
		// numbers alone can't place the mine, but mines-left == covered-on-the-
		// right... actually: reveal (0,1) shows 0 -> floods (0,0)..(0,2). One
		// covered cell remains and one mine remains: provably a mine.
		const game = Game.fromMines(1, 4, [[0, 3]]);
		game.revealCell(0, 1);
		const { mines } = deduce(game);
		expect(mines).toContainEqual([0, 3]);
	});

	it('finds nothing certain on an ambiguous board', () => {
		// 1x3 with one mine somewhere in {0,2}; revealing the middle "1" can't
		// distinguish which end is the mine.
		const game = Game.fromMines(1, 3, [[0, 2]]);
		game.revealCell(0, 1);
		const { safe, mines } = deduce(game);
		expect(safe).toHaveLength(0);
		expect(mines).toHaveLength(0);
	});
});

describe('solvability', () => {
	it('accepts a board the deduction closure fully solves', () => {
		const game = Game.fromMines(2, 3, [
			[0, 0],
			[0, 2]
		]);
		// Opening the bottom row via the (1,1) "2"... that cell is not a flood
		// cell, so reveal each bottom cell to set up, then ask "solvable now?".
		game.revealCell(1, 0);
		game.revealCell(1, 1);
		game.revealCell(1, 2);
		expect(isSolvableNow(game)).toBe(true);
	});

	it('rejects a forced 50/50', () => {
		// 1x3, mine at one end, middle revealed: the two ends are symmetric and
		// undecidable -> not solvable without guessing.
		const game = Game.fromMines(1, 3, [[0, 2]]);
		game.revealCell(0, 1);
		// Global count CAN'T help: 1 mine, 2 covered.
		expect(isSolvableNow(game)).toBe(false);
	});

	it('isSolvableFrom does not mutate the real board', () => {
		const game = Game.fromMines(3, 3, [[0, 0]]);
		isSolvableFrom(game, 2, 2);
		expect(game.board.flat().every((c) => !c.isRevealed && !c.isFlagged)).toBe(true);
	});

	it('treats player flags as claims, not knowledge', () => {
		// A wrong flag must not poison the simulation: solvability is judged from
		// reveals alone.
		const game = Game.fromMines(1, 4, [[0, 3]]);
		game.revealCell(0, 1); // floods 0..2
		game.flagCell(0, 3); // (happens to be right, but sim re-derives it)
		expect(isSolvableNow(game)).toBe(true);
	});
});

describe('findGuesslessSeed', () => {
	it('produces a Blitz board solvable by pure logic from the first click', () => {
		const seed = findGuesslessSeed(16, 16, 40, 8, 8);
		expect(seed).not.toBeNull();
		const game = new Game(16, 16, 40, seed!);
		expect(isGuesslessOpening(game, 8, 8)).toBe(true);
	});

	it('produces a Tactical-sized board (9x9) quickly', () => {
		const seed = findGuesslessSeed(9, 9, 10, 4, 4);
		expect(seed).not.toBeNull();
		const game = new Game(9, 9, 10, seed!);
		expect(isGuesslessOpening(game, 4, 4)).toBe(true);
	});

	it('handles an expert-density Classic board within the attempt cap', () => {
		const start = Date.now();
		const seed = findGuesslessSeed(16, 30, 99, 8, 15);
		const ms = Date.now() - start;
		expect(seed).not.toBeNull();
		// Generation happens on the first click; keep it comfortably interactive.
		expect(ms).toBeLessThan(5000);
	});

	it('returns null instead of hanging when no qualifying board exists', () => {
		// 27 mines on 28 free cells around a fixed opening: a zero-opening is
		// impossible, so every attempt fails the cheap filter.
		expect(findGuesslessSeed(2, 14, 27, 0, 0, 50)).toBeNull();
	});
});

describe('perfect bots by construction', () => {
	it('the deduction closure (the bot brain) fully solves a generated board', () => {
		// The bot applies exactly this closure one move at a time, so closure
		// success here == the bot never needing to guess on a guessless board.
		const seed = findGuesslessSeed(16, 16, 40, 3, 3);
		expect(seed).not.toBeNull();
		const game = new Game(16, 16, 40, seed!);
		game.revealCell(3, 3);
		for (;;) {
			const { safe, mines } = deduce(game);
			let progress = false;
			for (const [r, c] of mines) {
				if (!game.board[r][c].isFlagged) {
					game.flagCell(r, c);
					progress = true;
				}
			}
			for (const [r, c] of safe) {
				if (!game.board[r][c].isRevealed) {
					game.revealCell(r, c);
					progress = true;
				}
			}
			if (!progress) break;
		}
		expect(game.checkWin()).toBe(true);
		expect(game.checkLose()).toBe(false);
	});
});

describe('pickGuesslessInjection', () => {
	it('keeps the victim board solvable after the injected mine', () => {
		// This solvable fixture has eligible landing spots. Search all candidates
		// so the production helper's bounded random sampling cannot flake the test.
		const game = new Game(9, 9, 10, 2);
		expect(isGuesslessOpening(game, 4, 4)).toBe(true);
		game.revealCell(4, 4);
		const cell = pickGuesslessInjection(game, 81);
		expect(cell).not.toBeNull();
		game.injectMineAt(cell![0], cell![1]);
		expect(isSolvableNow(game)).toBe(true);
	});

	it('skips the search on boards with nothing revealed (they re-deal anyway)', () => {
		const game = new Game(9, 9, 10, 42);
		expect(pickGuesslessInjection(game)).toBeNull();
	});
});
