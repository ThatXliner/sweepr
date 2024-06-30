<script lang="ts">
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { Game } from '$lib/gameLogic.svelte';
	import Time from './Time.svelte';

	export let rows = 16;
	export let cols = 30;
	export let mines = 99;
	let game: Game = new Game(rows, cols, mines);
	let board = game.board;
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

	function handleCellRightClick(event: MouseEvent, row: number, col: number) {
		event.preventDefault();
		if (invertControls) {
			reveal(row, col);
		} else {
			flag(row, col);
		}
	}

	function getCellColor(mineCount: number) {
		switch (mineCount) {
			case 1:
				return 'text-blue-500';
			case 2:
				return 'text-green-500';
			case 3:
				return 'text-red-500';
			case 4:
				return 'text-purple-500';
			case 5: // Maroon
				return 'text-yellow-500';
			case 6: // Teal
				return 'text-yellow-500';
			case 7:
				return 'text-black';
			case 8:
				return 'text-slate-500';
			default:
				return '';
		}
	}
	let startTime: number = 0;
	let timer: NodeJS.Timeout;
	let elapsedTime: number = 0;
	let invertControls = false;

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
</script>

<Time milliseconds={elapsedTime} />
<!-- I use flex for now because I can't deal with grid -->
<div class="flex h-screen items-center justify-evenly">
	<div>
		{#each board as row, rowIndex}
			<div class="flex">
				{#each row as cell, colIndex}
					<button
						class="h-8 w-8 border border-gray-400 {cell.isRevealed
							? 'bg-white'
							: 'bg-gray-200'} {cell.isFlagged ? 'text-red-500' : getCellColor(cell.adjacentMines)}"
						on:click={() => handleCellClick(rowIndex, colIndex)}
						on:contextmenu={(event) => handleCellRightClick(event, rowIndex, colIndex)}
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
