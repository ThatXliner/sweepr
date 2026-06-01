import { describe, it, expect } from 'vitest';
import {
	waitingQueue,
	proposer,
	shouldPropose,
	buildSeeds,
	onMatchMessage,
	slotOf,
	type Member,
	type MatchProposal
} from './matchmaker';

const m = (id: string, joinedAt: number, userId = id): Member => ({
	memberId: id,
	userId,
	joinedAt
});

describe('matchmaking queue + proposer', () => {
	it('orders the queue by joinedAt then memberId', () => {
		const members = [m('c', 2), m('a', 1), m('b', 1)];
		expect(waitingQueue(members).map((x) => x.memberId)).toEqual(['a', 'b', 'c']);
	});

	it('elects exactly one proposer = queue head, identical for every client', () => {
		const members = [m('c', 2), m('a', 1), m('b', 1)];
		// Any client, given the same snapshot, computes the same head.
		expect(proposer(members)).toBe('a');
		expect(proposer([...members].reverse())).toBe('a');
	});

	it('returns no proposer for an empty lobby', () => {
		expect(proposer([])).toBeUndefined();
	});
});

describe('shouldPropose', () => {
	it('only the head proposes', () => {
		const members = [m('a', 1), m('b', 2)];
		expect(shouldPropose('a', members, 'blitz', false)).toEqual(['a', 'b']);
		expect(shouldPropose('b', members, 'blitz', false)).toBeNull();
	});

	it('blitz waits for 2 players', () => {
		expect(shouldPropose('a', [m('a', 1)], 'blitz', false)).toBeNull();
	});

	it('tactical takes up to 16 when full', () => {
		const members = Array.from({ length: 20 }, (_, i) => m(`p${String(i).padStart(2, '0')}`, i));
		const chosen = shouldPropose(members[0].memberId, members, 'tactical', false);
		expect(chosen).toHaveLength(16);
		expect(chosen![0]).toBe('p00');
	});

	it('tactical starts partially-filled only after the short wait', () => {
		const members = [m('a', 1), m('b', 2), m('c', 3)];
		expect(shouldPropose('a', members, 'tactical', false)).toBeNull(); // < 16, no short wait
		expect(shouldPropose('a', members, 'tactical', true)).toEqual(['a', 'b', 'c']);
	});

	it('tactical needs at least 2 humans even after the short wait', () => {
		expect(shouldPropose('a', [m('a', 1)], 'tactical', true)).toBeNull();
	});
});

describe('onMatchMessage — idempotent acceptance + convergence', () => {
	const proposal = (matchId: string, members: string[]): MatchProposal => ({
		matchId,
		mode: 'blitz',
		members,
		seeds: [1, 2]
	});

	it('accepts a match that names me, once', () => {
		const state = { acceptedMatchId: null as string | null };
		expect(onMatchMessage(state, 'a', proposal('M1', ['a', 'b']))).not.toBeNull();
		// A second (duplicate or different) match is ignored.
		expect(onMatchMessage(state, 'a', proposal('M2', ['a', 'c']))).toBeNull();
		expect(state.acceptedMatchId).toBe('M1');
	});

	it('ignores a match that does not name me', () => {
		const state = { acceptedMatchId: null as string | null };
		expect(onMatchMessage(state, 'z', proposal('M1', ['a', 'b']))).toBeNull();
		expect(state.acceptedMatchId).toBeNull();
	});

	it('converges when two proposals race: no member ends up in two matches', () => {
		// A proposed {A,B}; B (head of a stale snapshot) proposed {B,C}. Deliver
		// both to every member; each accepts only its first.
		const states: Record<string, { acceptedMatchId: string | null }> = {
			A: { acceptedMatchId: null },
			B: { acceptedMatchId: null },
			C: { acceptedMatchId: null }
		};
		const pAB = proposal('AB', ['A', 'B']);
		const pBC = proposal('BC', ['B', 'C']);

		// A sees only pAB (it's not in pBC).
		expect(onMatchMessage(states.A, 'A', pAB)).not.toBeNull();
		// B sees pAB first, then pBC — takes AB, ignores BC.
		expect(onMatchMessage(states.B, 'B', pAB)).not.toBeNull();
		expect(onMatchMessage(states.B, 'B', pBC)).toBeNull();
		// C sees pBC — but B already took AB, so C's match has a missing partner.
		// C accepts BC; the controller's next presence sync will re-pair C since B
		// is gone. The invariant we assert: nobody is in two matches.
		expect(onMatchMessage(states.C, 'C', pBC)).not.toBeNull();

		expect(states.A.acceptedMatchId).toBe('AB');
		expect(states.B.acceptedMatchId).toBe('AB'); // not BC
		expect(states.C.acceptedMatchId).toBe('BC');
	});
});

describe('seeds + slots', () => {
	it('buildSeeds yields one uint32 per member', () => {
		let n = 0;
		const seeds = buildSeeds(3, () => (n++ % 2 === 0 ? 0xffffffff : 7));
		expect(seeds).toHaveLength(3);
		for (const s of seeds) expect(s).toBeGreaterThanOrEqual(0);
	});

	it('slotOf returns the member index', () => {
		const p: MatchProposal = {
			matchId: 'm',
			mode: 'tactical',
			members: ['x', 'y', 'z'],
			seeds: []
		};
		expect(slotOf(p, 'y')).toBe(1);
		expect(slotOf(p, 'absent')).toBe(-1);
	});
});
