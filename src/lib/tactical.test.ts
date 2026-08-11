import { describe, expect, it } from 'vitest';
import { advanceIncomingCharge, attackThresholdFor } from './tactical';

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
