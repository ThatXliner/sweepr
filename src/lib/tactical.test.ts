import { describe, expect, it } from 'vitest';
import {
	advanceIncomingCharge,
	attackThresholdFor,
	attackTargetFor,
	hitsPerMine,
	targetFallbackNotice
} from './tactical';

describe('Tactical attack charge', () => {
	it('uses one quarter of the player pool as the hit threshold', () => {
		expect(attackThresholdFor(16)).toBe(4);
		expect(attackThresholdFor(15)).toBe(4);
		expect(attackThresholdFor(2)).toBe(1);
	});

	it('combines all incoming hits on a target before creating a mine', () => {
		let charge = 0;
		for (let hit = 1; hit < 4; hit++) {
			const next = advanceIncomingCharge(charge, 4);
			expect(next.launch).toBe(false);
			charge = next.charge;
		}

		expect(advanceIncomingCharge(charge, 4)).toEqual({ charge: 0, launch: true });
	});
});

import { Game } from './gameLogic.svelte';
import { receiveMine } from './tactical';

describe('Tactical mine attacks and escape', () => {
	it('adds a hidden mine without changing any revealed number', () => {
		const game = Game.fromMines(5, 5, [[0, 1]]);
		game.revealCell(0, 0);
		const number = game.board[0][0].adjacentMines;
		const attack = receiveMine(game);
		expect(attack.kind).toBe('mine');
		expect(game.mines).toBe(2);
		expect(game.flags).toBe(2);
		expect(game.board[0][0].adjacentMines).toBe(number);
		if (attack.kind === 'mine') {
			game.revealCell(...attack.cell);
			expect(game.checkLose()).toBe(true);
		}
	});

	it('blocks a mine when only protected safe squares remain', () => {
		const game = Game.fromMines(2, 2, [[0, 0]]);
		game.revealCell(1, 1);
		expect(receiveMine(game)).toEqual({ kind: 'blocked' });
		expect(game.mines).toBe(1);
	});

	it('leaves an all-mine remainder vulnerable until every mine is flagged', () => {
		const game = Game.fromMines(2, 2, [
			[0, 0],
			[0, 1],
			[1, 0]
		]);
		game.revealCell(1, 1);
		expect(game.checkWin()).toBe(true);
		expect(game.checkTacticalClear()).toBe(false);
		expect(receiveMine(game)).toEqual({ kind: 'buried' });
		game.flagCell(0, 0);
		game.flagCell(0, 1);
		expect(game.checkTacticalClear()).toBe(false);
		game.flagCell(1, 0);
		expect(game.flags).toBe(0);
		expect(game.checkTacticalClear()).toBe(true);
		game.flagCell(1, 0);
		expect(game.flags).toBe(1);
		expect(game.checkTacticalClear()).toBe(false);
	});

	it('rejects injections on mines, flags, revealed cells and revealed neighbors', () => {
		const game = Game.fromMines(5, 5, [[0, 1]]);
		game.revealCell(0, 0);
		game.flagCell(4, 4);
		for (const [r, c] of [
			[0, 1],
			[0, 0],
			[1, 1],
			[4, 4],
			[-1, 0]
		]) {
			expect(game.injectMineAt(r, c)).toBe(false);
		}
		expect(game.mines).toBe(1);
	});
});

describe('single-opponent targeting', () => {
	it('selects just the preferred living opponent in a full arena', () => {
		expect(attackTargetFor(Array(16).fill(true), 0, 7)).toBe(7);
	});
	it('replaces eliminated, self, and invalid targets with a living opponent', () => {
		for (const target of [0, 1, 99, undefined]) {
			expect(attackTargetFor([true, false, true, true], 0, target)).toBe(2);
		}
	});
	it('returns no target when the attacker is eliminated or alone', () => {
		expect(attackTargetFor([false, true, true], 0, 1)).toBeNull();
		expect(attackTargetFor([true, false], 0, 1)).toBeNull();
	});
	it('falls back to the lowest-numbered living opponent, not the next seat', () => {
		expect(attackTargetFor([true, true, true, false, true], 0, 3)).toBe(1);
	});
});

describe('targeting copy', () => {
	it('uses singular hit text when one hit makes a mine', () => {
		expect(hitsPerMine(1)).toBe('every hit becomes');
		expect(hitsPerMine(4)).toBe('every 4 hits become');
	});
	it('names both the knocked-out and fallback targets', () => {
		expect(targetFallbackNotice(3, 1)).toBe('P3 is out — now targeting P1.');
	});
});
