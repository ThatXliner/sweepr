import { describe, it, expect, vi } from 'vitest';
import { Game } from '$lib/gameLogic.svelte';
import { makeNetworkDriver, broadcastMove, MOVE_EVENT, type NetMsg } from './networkDriver';

// A minimal fake of the Realtime channel: records the registered broadcast
// handler so tests can feed it messages, and captures `send` payloads.
function fakeChannel() {
	let handler: ((arg: { payload: NetMsg }) => void) | undefined;
	const sent: NetMsg[] = [];
	return {
		on(_type: string, _filter: unknown, cb: (arg: { payload: NetMsg }) => void) {
			handler = cb;
			return this;
		},
		send(msg: { type: string; event: string; payload: NetMsg }) {
			sent.push(msg.payload);
		},
		emit(payload: NetMsg) {
			handler?.({ payload });
		},
		sent
	};
}

describe('networkDriver', () => {
	it('applies a peer reveal to the mirror game and fires onChange', () => {
		const game = Game.fromMines(3, 3, [[0, 0]]);
		const channel = fakeChannel();
		const onChange = vi.fn();
		const driver = makeNetworkDriver(game, channel as never, 'peer-1', { onChange });
		driver.start();

		channel.emit({ kind: 'reveal', from: 'peer-1', r: 2, c: 2 });
		expect(game.board[2][2].isRevealed).toBe(true);
		expect(onChange).toHaveBeenCalledOnce();
	});

	it('ignores messages from other peers', () => {
		const game = Game.fromMines(3, 3, [[0, 0]]);
		const channel = fakeChannel();
		const onChange = vi.fn();
		makeNetworkDriver(game, channel as never, 'peer-1', { onChange }).start();

		channel.emit({ kind: 'reveal', from: 'someone-else', r: 2, c: 2 });
		expect(game.board[2][2].isRevealed).toBe(false);
		expect(onChange).not.toHaveBeenCalled();
	});

	it('does nothing before start or after stop', () => {
		const game = Game.fromMines(3, 3, [[0, 0]]);
		const channel = fakeChannel();
		const driver = makeNetworkDriver(game, channel as never, 'peer-1', { onChange: () => {} });

		channel.emit({ kind: 'reveal', from: 'peer-1', r: 2, c: 2 });
		expect(game.board[2][2].isRevealed).toBe(false); // not started

		driver.start();
		driver.stop();
		channel.emit({ kind: 'reveal', from: 'peer-1', r: 1, c: 1 });
		expect(game.board[1][1].isRevealed).toBe(false); // stopped
	});

	it('routes newboard and dead to their callbacks', () => {
		const game = Game.fromMines(3, 3, [[0, 0]]);
		const channel = fakeChannel();
		const onNewBoard = vi.fn();
		const onDead = vi.fn();
		makeNetworkDriver(game, channel as never, 'p', {
			onChange: () => {},
			onNewBoard,
			onDead
		}).start();

		channel.emit({ kind: 'newboard', from: 'p', mines: [[1, 1]] });
		expect(onNewBoard).toHaveBeenCalledWith([[1, 1]]);
		channel.emit({ kind: 'dead', from: 'p' });
		expect(onDead).toHaveBeenCalledOnce();
	});

	it('broadcastMove sends on the channel', () => {
		const channel = fakeChannel();
		broadcastMove(channel as never, { kind: 'flag', from: 'me', r: 0, c: 1 });
		expect(channel.sent).toEqual([{ kind: 'flag', from: 'me', r: 0, c: 1 }]);
	});

	it('MOVE_EVENT is the broadcast event name', () => {
		expect(MOVE_EVENT).toBe('move');
	});
});
