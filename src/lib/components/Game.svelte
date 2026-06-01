<script lang="ts">
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { Game, getCellColor, type Board } from '$lib/gameLogic.svelte';
	import Time from './Time.svelte';

	interface Props {
		rows?: number;
		cols?: number;
		mines?: number;
	}

	let { rows = 16, cols = 30, mines = 99 }: Props = $props();

	// `game` is plain mutable state that the reveal/flag handlers mutate in
	// place; `board` mirrors `game.board` and is the reactive value the template
	// renders. The $effect rebuilds both whenever the difficulty props change,
	// so reading the props happens in a reactive context (no stale snapshot).
	let game: Game = $state(new Game(16, 30, 99));
	let board: Board = $state([]);

	$effect(() => {
		game = new Game(rows, cols, mines);
		board = game.board;
		resetTimer();
	});
	function reveal(row: number, col: number) {
		// Guarantee that the first cell clicked is not a mine.
		// For some reason, this has to be done in the click handler
		// otherwise the UI will not update
		if (game.isFirstClick) {
			game.isFirstClick = false;
			while (game.board[row][col].isMine || game.board[row][col].adjacentMines != 0) {
				game.board = game.generateBoard(game.rows, game.cols, game.mines);
			}
			startTimer();
		}
		board = game.revealCell(row, col);
		if (game.checkLose() || game.checkWin()) {
			stopTimer();
		}
	}
	function flag(row: number, col: number) {
		if (game.isFirstClick) {
			return;
		}
		board = game.flagCell(row, col);
		if (game.checkLose() || game.checkWin()) {
			stopTimer();
		}
	}
	function handleCellClick(row: number, col: number) {
		if (invertControls) {
			flag(row, col);
		} else {
			reveal(row, col);
		}
	}

	function handleCellRightClick(event: Event, row: number, col: number) {
		event.preventDefault();
		if (invertControls) {
			reveal(row, col);
		} else {
			flag(row, col);
		}
	}

	let startTime: number = 0;
	let timer: ReturnType<typeof setInterval>;
	let elapsedTime: number = $state(0);
	let invertControls = $state(false);

	function startTimer() {
		startTime = Date.now();
		timer = setInterval(() => {
			elapsedTime = Date.now() - startTime;
		}, 1);
	}

	function stopTimer() {
		clearInterval(timer);
	}

	function resetTimer() {
		clearInterval(timer);
		elapsedTime = 0;
	}
	let touchStart = $state(0);
	const TOUCH_DELAY = 500;
</script>

<Time milliseconds={elapsedTime} />
<!-- I use flex for now because I can't deal with grid -->
<div class="flex h-screen items-center justify-evenly">
	<div>
		{#each board as row, rowIndex (rowIndex)}
			<div class="flex">
				{#each row as cell, colIndex (colIndex)}
					<button
						class="h-8 w-8 border border-gray-400 {cell.isRevealed
							? 'bg-white'
							: 'bg-gray-200'} {cell.isFlagged ? 'text-red-500' : getCellColor(cell.adjacentMines)}"
						onclick={() => handleCellClick(rowIndex, colIndex)}
						oncontextmenu={(event) => handleCellRightClick(event, rowIndex, colIndex)}
						ontouchstart={() => (touchStart = Date.now())}
						ontouchend={(event) =>
							Date.now() - touchStart >= TOUCH_DELAY &&
							handleCellRightClick(event, rowIndex, colIndex)}
					>
						{cell.isRevealed && cell.isMine
							? '💣'
							: cell.isRevealed
								? cell.adjacentMines || ''
								: cell.isFlagged
									? '🚩'
									: ''}
					</button>
				{/each}
			</div>
		{/each}
	</div>
	<div class="flex flex-col justify-evenly space-y-3">
		{#if invertControls}
			<h2>Left click to flag, right click to reveal</h2>
		{:else}
			<h2>Left click to reveal, right click to flag</h2>
		{/if}
		<div class="flex items-center space-x-2">
			<Switch id="guess-less-mode" disabled />
			<Label for="guess-less-mode">Guess-less mode</Label>
		</div>
		<div class="flex items-center space-x-2">
			<Switch id="invert-controls" bind:checked={invertControls} />
			<Label for="invert-controls">Invert controls</Label>
		</div>
		<div>Flags left: {game.flags}</div>
	</div>
</div>

<style>
	button:focus {
		outline: none;
	}
</style>
