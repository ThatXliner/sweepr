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

	interface Props {
		rows?: number;
		cols?: number;
		mines?: number;
		// Hard time cap for the marathon, in ms.
		timeCap?: number;
	}

	// Hard-ish default so it's a marathon, not a sprint. Dimensions are fixed for
	// the lifetime of a match (the page never re-passes props).
	let { rows = 16, cols = 16, mines = 40, timeCap = 180_000 }: Props = $props();

	// Each player gets their OWN random seed: equal difficulty, independent
	// layouts, and first-click safety stays intact (regenerating one board never
	// has to stay in lockstep with the other).
	function newSeed() {
		return Math.floor(Math.random() * 0xffffffff);
	}

	// Props are construction-time config; the boards are built once.
	// svelte-ignore state_referenced_locally
	let playerGame = $state(new Game(rows, cols, mines, newSeed()));
	// svelte-ignore state_referenced_locally
	let oppGame = $state(new Game(rows, cols, mines, newSeed()));
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
		startBot();
	}

	function startBot() {
		bot = makeBlitzBot(oppGame, {
			...DIFFICULTY_DELAYS[difficulty],
			onChange: () => {
				oppBoard = oppGame.board;
				if (oppGame.checkLose()) {
					oppAlive = false;
					finish();
				} else if (oppGame.checkWin()) {
					// Cleared the board: bank it and hand the bot a fresh one.
					oppBanked += countCleared(oppGame.board);
					bot?.stop();
					oppGame = new Game(rows, cols, mines, newSeed());
					oppBoard = oppGame.board;
					startBot();
				}
			}
		});
		bot.start();
	}

	function finish() {
		if (over) return;
		over = true;
		clearInterval(timer);
		bot?.stop();

		const playerScore = playerBanked + countCleared(playerGame.board);
		const oppScore = oppBanked + countCleared(oppGame.board);
		if (playerAlive && !oppAlive) result = 'You win — opponent hit a mine!';
		else if (!playerAlive && oppAlive) result = 'You lose — you hit a mine.';
		else if (playerScore > oppScore) result = `You win — ${playerScore} vs ${oppScore} cleared.`;
		else if (oppScore > playerScore) result = `You lose — ${playerScore} vs ${oppScore} cleared.`;
		else result = `Draw — ${playerScore} apiece.`;
	}

	function reveal(row: number, col: number) {
		if (over) return;
		if (playerGame.isFirstClick) {
			playerGame.isFirstClick = false;
			// First-click safety: regenerate (new seed) until the clicked cell opens
			// a flood-fill region.
			while (playerGame.board[row][col].isMine || playerGame.board[row][col].adjacentMines !== 0) {
				playerGame.board = playerGame.generateBoard(rows, cols, mines, newSeed());
			}
			playerBoard = playerGame.board;
			startMatch();
		}
		playerBoard = playerGame.revealCell(row, col);
		if (playerGame.checkLose()) {
			playerAlive = false;
			finish();
		} else if (playerGame.checkWin()) {
			// Cleared the board: bank it and start a fresh one to keep racing. Leave
			// isFirstClick true so the next board also gets first-click safety.
			playerBanked += countCleared(playerGame.board);
			playerGame = new Game(rows, cols, mines, newSeed());
			playerBoard = playerGame.board;
		}
	}

	function flag(row: number, col: number) {
		if (over || playerGame.isFirstClick) return;
		playerBoard = playerGame.flagCell(row, col);
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
		// Stop the bot timer if the component unmounts mid-match.
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
				Right now the opponent is a bot; online play is coming.
			</p>
		</ModeInfo>
	</div>
	<Time milliseconds={elapsed} />
	{#if !over && elapsed === 0}
		<label class="flex items-center gap-2 text-sm">
			Bot difficulty:
			<select
				bind:value={difficulty}
				class="rounded border border-gray-300 px-2 py-1 capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
			>
				{#each DIFFICULTIES as d (d)}
					<option value={d} class="capitalize">{d}</option>
				{/each}
			</select>
		</label>
	{/if}
	{#if over}
		<h2 class="text-2xl font-bold">{result}</h2>
	{:else}
		<p class="text-sm text-gray-500">
			{invertControls
				? 'Left click to flag, right click to reveal'
				: 'Left click to reveal, right click to flag'} — clear more tiles than your opponent.
		</p>
	{/if}

	<div class="flex items-start justify-center gap-12">
		<div class="flex flex-col items-center gap-1">
			<h3 class="font-semibold">You — {playerScore} cleared</h3>
			<div>
				<Board_ board={playerBoard} interactive={!over} {onCell} {onCellAlt} cellSize="h-6 w-6" />
			</div>
			<label class="mt-1 flex items-center gap-2 text-sm">
				<input type="checkbox" bind:checked={invertControls} /> Invert controls
			</label>
		</div>

		<div class="flex flex-col items-center gap-1">
			<h3 class="font-semibold">Opponent — {oppScore} cleared</h3>
			<Board_ board={oppBoard} interactive={false} cellSize="h-6 w-6" unrevealedBg="bg-blue-200" />
			<span class="mt-1 text-sm text-gray-500">{oppAlive ? 'sweeping…' : 'eliminated'}</span>
		</div>
	</div>
</div>
