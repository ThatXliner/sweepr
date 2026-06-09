<script lang="ts">
	import { Game, type Board } from '$lib/gameLogic.svelte';
	import {
		makeBlitzBot,
		DIFFICULTY_DELAYS,
		DIFFICULTIES,
		type Difficulty,
		type OpponentDriver
	} from '$lib/opponent.svelte';
	import Board_ from './Board.svelte';
	import ModeInfo from './ModeInfo.svelte';
	import Time from './Time.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import { makeNetworkDriver, broadcastMove } from '$lib/net/networkDriver';
	import { findGuesslessSeed, isGuesslessOpening } from '$lib/solver';

	// When `net` is provided the opponent is a remote player instead of a bot:
	// both boards use agreed seeds, the opponent's moves arrive over the channel,
	// and our own reveals/flags are broadcast out.
	interface NetProps {
		channel: RealtimeChannel;
		memberId: string; // ours
		oppMemberId: string;
		yourSeed: number;
		oppSeed: number;
		onForfeit?: () => void; // opponent left → we win
	}

	interface Props {
		rows?: number;
		cols?: number;
		mines?: number;
		// Hard time cap for the marathon, in ms.
		timeCap?: number;
		net?: NetProps;
	}

	// Hard-ish default so it's a marathon, not a sprint. Dimensions are fixed for
	// the lifetime of a match (the page never re-passes props).
	let { rows = 16, cols = 16, mines = 40, timeCap = 180_000, net }: Props = $props();

	// Each player gets their OWN random seed: equal difficulty, independent
	// layouts, and first-click safety stays intact (regenerating one board never
	// has to stay in lockstep with the other). Online, the seeds are agreed by the
	// matchmaker so both clients build identical boards.
	function newSeed() {
		return Math.floor(Math.random() * 0xffffffff);
	}

	// Props are construction-time config; the boards are built once.
	// svelte-ignore state_referenced_locally
	let playerGame = $state(new Game(rows, cols, mines, net ? net.yourSeed : newSeed()));
	// svelte-ignore state_referenced_locally
	let oppGame = $state(new Game(rows, cols, mines, net ? net.oppSeed : newSeed()));
	// svelte-ignore state_referenced_locally
	let playerBoard: Board = $state(playerGame.board);
	// svelte-ignore state_referenced_locally
	let oppBoard: Board = $state(oppGame.board);

	let playerAlive = $state(true);
	let oppAlive = $state(true);
	let invertControls = $state(false);
	let over = $state(false);
	let result = $state('');
	// Bot speed tier, chosen before the first click. Locked once the match starts.
	let difficulty = $state<Difficulty>('medium');
	// Tiles cleared on boards already finished — score accumulates across the
	// fresh boards each side gets for clearing one, until the time cap.
	let playerBanked = $state(0);
	let oppBanked = $state(0);

	let elapsed = $state(0);
	let startTime = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let bot: OpponentDriver | undefined;
	let started = false;

	function countCleared(board: Board): number {
		let n = 0;
		for (const row of board) for (const cell of row) if (cell.isRevealed && !cell.isMine) n++;
		return n;
	}

	function startMatch() {
		if (started) return;
		started = true;
		startTime = Date.now();
		timer = setInterval(() => {
			elapsed = Date.now() - startTime;
			if (elapsed >= timeCap) finish();
		}, 100);
		startOpponent();
	}

	// Shared handler for any opponent move (bot or network): refresh the mirror,
	// then bank + reseed on clear, or finish on death.
	function onOpponentChange() {
		oppBoard = oppGame.board;
		if (oppGame.checkLose()) {
			oppAlive = false;
			finish();
		} else if (oppGame.checkWin()) {
			oppBanked += countCleared(oppGame.board);
			// Local bot picks its own fresh seed; online, the peer tells us via a
			// `seed` message (handled below) and the driver must KEEP listening so
			// their moves on the next board still arrive.
			if (!net) {
				bot?.stop();
				oppGame = new Game(rows, cols, mines, newSeed());
				oppBoard = oppGame.board;
				startOpponent();
			}
		}
	}

	function startOpponent() {
		if (net) {
			bot = makeNetworkDriver(oppGame, net.channel, net.oppMemberId, {
				onChange: onOpponentChange,
				onReveal: (r, c) => oppGame.revealCell(r, c),
				onFlag: (r, c) => oppGame.flagCell(r, c),
				onDead: () => {
					oppAlive = false;
					finish();
				},
				// Peer cleared its board and started a fresh one with this seed.
				onNewBoard: () => {}
			});
			bot.start();
			return;
		}
		bot = makeBlitzBot(oppGame, {
			...DIFFICULTY_DELAYS[difficulty],
			guessless: true,
			onChange: onOpponentChange
		});
		bot.start();
	}

	function finish(override?: string) {
		if (over) return;
		over = true;
		clearInterval(timer);
		bot?.stop();
		if (override) {
			result = override;
			return;
		}

		const playerScore = playerBanked + countCleared(playerGame.board);
		const oppScore = oppBanked + countCleared(oppGame.board);
		if (playerAlive && !oppAlive) result = 'You win — opponent hit a mine!';
		else if (!playerAlive && oppAlive) result = 'You lose — you hit a mine.';
		else if (playerScore > oppScore) result = `You win — ${playerScore} vs ${oppScore} cleared.`;
		else if (oppScore > playerScore) result = `You lose — ${playerScore} vs ${oppScore} cleared.`;
		else result = `Draw — ${playerScore} apiece.`;
	}

	// Pick a fresh board seed; online, broadcast it so the peer rebuilds the same
	// board for their mirror of us.
	function reseedPlayer(): number {
		const seed = newSeed();
		playerGame = new Game(rows, cols, mines, seed);
		playerBoard = playerGame.board;
		if (net) broadcastMove(net.channel, { kind: 'seed', from: net.memberId, seed });
		return seed;
	}

	function reveal(row: number, col: number) {
		if (over) return;
		if (playerGame.isFirstClick) {
			playerGame.isFirstClick = false;
			// Blitz is competitive, so guessless is ALWAYS on: re-deal until the
			// board is fully solvable from this click — no forced guesses, ever.
			// Online, broadcast the final seed so the peer mirrors our actual board
			// before our first reveal (kept as-is when the agreed seed qualifies).
			let seed = net ? net.yourSeed : newSeed();
			if (!isGuesslessOpening(playerGame, row, col)) {
				const found = findGuesslessSeed(rows, cols, mines, row, col);
				if (found !== null) {
					seed = found;
					playerGame.board = playerGame.generateBoard(rows, cols, mines, seed);
				} else {
					// Search cap hit (effectively never at Blitz density): degrade to
					// plain first-click flood safety rather than hanging.
					while (
						playerGame.board[row][col].isMine ||
						playerGame.board[row][col].adjacentMines !== 0
					) {
						seed = newSeed();
						playerGame.board = playerGame.generateBoard(rows, cols, mines, seed);
					}
				}
			}
			playerBoard = playerGame.board;
			if (net) broadcastMove(net.channel, { kind: 'seed', from: net.memberId, seed });
			startMatch();
		}
		playerBoard = playerGame.revealCell(row, col);
		if (net) broadcastMove(net.channel, { kind: 'reveal', from: net.memberId, r: row, c: col });
		if (playerGame.checkLose()) {
			playerAlive = false;
			if (net) broadcastMove(net.channel, { kind: 'dead', from: net.memberId });
			finish();
		} else if (playerGame.checkWin()) {
			// Cleared the board: bank it and start a fresh one to keep racing. Leave
			// isFirstClick true so the next board also gets first-click safety.
			playerBanked += countCleared(playerGame.board);
			reseedPlayer();
		}
	}

	function flag(row: number, col: number) {
		if (over || playerGame.isFirstClick) return;
		playerBoard = playerGame.flagCell(row, col);
		if (net) broadcastMove(net.channel, { kind: 'flag', from: net.memberId, r: row, c: col });
	}

	function onCell(row: number, col: number) {
		if (invertControls) flag(row, col);
		else reveal(row, col);
	}
	function onCellAlt(event: Event, row: number, col: number) {
		event.preventDefault();
		if (invertControls) reveal(row, col);
		else flag(row, col);
	}

	$effect(() => {
		// Online: rebuild the opponent's mirror board whenever they (re)seed it,
		// and treat their leaving as a forfeit.
		if (net) {
			// Online both players watch each other from the start, so the opponent
			// driver + timer must run immediately, not on our own first click.
			startMatch();
			net.channel.on('broadcast', { event: 'move' }, ({ payload }) => {
				if (payload.from !== net.oppMemberId) return;
				if (payload.kind === 'seed') {
					// Peer (re)seeded their board — rebuild our mirror. The driver's
					// handlers read the live `oppGame`, so no need to recreate it.
					oppGame = new Game(rows, cols, mines, payload.seed);
					oppBoard = oppGame.board;
				}
			});
			// Forfeit when the opponent disappears from presence. We check on every
			// sync (and leave) because an abrupt tab-close surfaces as the member
			// dropping out of presenceState well before a 'leave' event fires. Only
			// arm this once we've actually seen the opponent join (so the initial
			// empty sync doesn't trigger a false forfeit).
			let oppSeen = false;
			const checkOpponentPresent = () => {
				if (over) return;
				const state = net.channel.presenceState<{ memberId?: string }>();
				const present = Object.values(state)
					.flat()
					.some((p) => p.memberId === net.oppMemberId);
				if (present) oppSeen = true;
				else if (oppSeen) {
					oppAlive = false;
					net.onForfeit?.();
					finish('You win — opponent left the match.');
				}
			};
			net.channel.on('presence', { event: 'sync' }, checkOpponentPresent);
			net.channel.on('presence', { event: 'leave' }, checkOpponentPresent);
			// If a matchmaking race strands us with a partner who accepted a
			// different match, they never join the game channel at all — don't hang
			// the match forever waiting for them.
			const joinGuard = setTimeout(() => {
				if (!oppSeen && !over) {
					oppAlive = false;
					net.onForfeit?.();
					finish('You win — opponent never connected.');
				}
			}, 20_000);
			return () => {
				clearTimeout(joinGuard);
				clearInterval(timer);
				bot?.stop();
			};
		}
		// Stop the timer/driver if the component unmounts mid-match.
		return () => {
			clearInterval(timer);
			bot?.stop();
		};
	});

	// Lifetime tiles cleared = banked from finished boards + the current board.
	// The board mirrors are reactive, so these recompute on every reveal.
	let playerScore = $derived(playerBanked + countCleared(playerBoard));
	let oppScore = $derived(oppBanked + countCleared(oppBoard));
</script>

<div class="flex flex-col items-center gap-3 p-3">
	<div class="flex items-center gap-2">
		<span class="h-3 w-3 rounded-full bg-yellow-500" aria-hidden="true"></span>
		<h2 class="text-lg font-semibold">Blitz</h2>
		<ModeInfo title="Blitz">
			<p>A 1v1 stamina marathon: clear more tiles than your opponent before time runs out.</p>
			<p>
				You and your opponent each sweep your own board of equal difficulty. Left click reveals,
				right click flags — same rules as Classic. Clear a board and you immediately get a fresh
				one, so your tile count keeps climbing.
			</p>
			<p>
				Hit a mine and you're out. Otherwise the most tiles cleared when the timer runs out wins.
				{#if net}You're playing a live opponent.{:else}The opponent is a bot.{/if}
			</p>
			<p>
				Every board deals itself <strong>guessless</strong> — fully solvable by logic from your first
				click. If you blow up, it was deducible. Pure speed decides.
			</p>
		</ModeInfo>
	</div>
	<!-- Countdown chrome: time remaining, with a draining mode-color bar. -->
	<div class="flex w-full max-w-xl flex-col items-center gap-1.5">
		<Time milliseconds={Math.max(0, timeCap - elapsed)} />
		<div class="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden="true">
			<div
				class="h-full rounded-full bg-yellow-500"
				style="width: {Math.max(0, 100 - (elapsed / timeCap) * 100)}%"
			></div>
		</div>
	</div>
	{#if !net && !over && elapsed === 0}
		<div class="flex items-center gap-2 text-sm">
			<Label for="blitz-difficulty">Bot difficulty</Label>
			<select
				id="blitz-difficulty"
				bind:value={difficulty}
				class="rounded-md border bg-background px-2 py-1 capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{#each DIFFICULTIES as d (d)}
					<option value={d} class="capitalize">{d}</option>
				{/each}
			</select>
		</div>
	{/if}
	{#if over}
		<h2 class="text-3xl font-black tracking-tight sm:text-4xl">{result}</h2>
	{:else}
		<p class="text-sm text-muted-foreground">
			{invertControls
				? 'Left-click flags, right-click reveals'
				: 'Left-click reveals, right-click flags'} — clear more tiles than your opponent.
		</p>
	{/if}

	<div
		class="flex flex-col items-center gap-8 sm:flex-row sm:items-start sm:justify-center sm:gap-6"
	>
		<div class="flex flex-col items-center gap-1.5">
			<h3 class="text-lg font-black tracking-tight tabular-nums">You — {playerScore} cleared</h3>
			<Board_
				board={playerBoard}
				interactive={!over}
				{onCell}
				{onCellAlt}
				cellSize="h-6 w-6"
				label="Your board"
			/>
			<div class="mt-1 flex items-center gap-2 text-sm">
				<Switch id="blitz-invert" bind:checked={invertControls} />
				<Label for="blitz-invert">Invert controls</Label>
			</div>
		</div>

		<!-- The vs divider only earns its place once the boards sit side by side. -->
		<span
			class="hidden rounded-md bg-yellow-500 px-2.5 py-1 font-mono text-lg font-black text-white sm:block sm:self-center"
			aria-hidden="true"
		>
			VS
		</span>

		<div class="flex flex-col items-center gap-1.5">
			<h3
				class="flex items-center gap-2 text-lg font-black tracking-tight text-yellow-600 tabular-nums dark:text-yellow-400"
			>
				Opponent — {oppScore} cleared
				{#if net}
					<span
						class="rounded bg-yellow-500 px-1.5 py-0.5 text-[10px] font-black tracking-widest text-white uppercase"
						>live</span
					>
				{/if}
			</h3>
			<Board_
				board={oppBoard}
				interactive={false}
				cellSize="h-6 w-6"
				unrevealedBg="bg-yellow-500/20"
				label="Opponent's board"
			/>
			<span class="mt-1 text-sm text-muted-foreground">{oppAlive ? 'sweeping…' : 'eliminated'}</span
			>
		</div>
	</div>
</div>
