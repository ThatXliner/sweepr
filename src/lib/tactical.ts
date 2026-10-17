import type { Game } from './gameLogic.svelte';

export interface AttackChargeResult {
	charge: number;
	launch: boolean;
}

/** One mine is created for every quarter-pool of hits a target receives. */
export function attackThresholdFor(playerCount: number): number {
	return Math.max(1, Math.ceil(playerCount / 4));
}

/** Add one hit to a target's shared incoming charge. */
export function advanceIncomingCharge(current: number, threshold: number): AttackChargeResult {
	const next = current + 1;
	return next >= threshold ? { charge: 0, launch: true } : { charge: next, launch: false };
}

/** No legal landing spot is harmless unless every covered square is a mine. */
export function receiveMine(
	game: Game
): { kind: 'mine'; cell: [number, number] } | { kind: 'blocked' | 'buried' } {
	const cell = game.injectMine();
	if (cell) return { kind: 'mine', cell };
	return { kind: game.isSaturated() ? 'buried' : 'blocked' };
}

/** A player can attack exactly one living opponent. */
export function attackTargetFor(
	alive: boolean[],
	attacker: number,
	preferred?: number
): number | null {
	if (!alive[attacker]) return null;
	if (preferred !== undefined && preferred !== attacker && alive[preferred]) return preferred;
	const next = alive.findIndex((living, id) => living && id !== attacker);
	return next < 0 ? null : next;
}
