<script lang="ts">
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { Game } from '$lib/gameLogic.svelte';

	const rows = 16;
	const cols = 30;
	const mines = 99;
	let game: Game = new Game(rows, cols, mines);
	let board = game.board;
	function handleCellClick(row: number, col: number) {
		// Guarantee that the first cell clicked is not a mine.
		// For some reason, this has to be done in the click handler
		// otherwise the UI will not update
		if (game.isFirstClick) {
			game.isFirstClick = false;
			while (game.board[row][col].isMine || game.board[row][col].adjacentMines != 0) {
				game.board = game.generateBoard(game.rows, game.cols, game.mines);
			}
		}
		board = game.revealCell(row, col);
	}

	function handleCellRightClick(event: MouseEvent, row: number, col: number) {
		event.preventDefault();
		board = game.flagCell(row, col);
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
</script>

<!-- 
	- Classic: The original solo game from the 90s!
	- Tactical: An NvN twist where you place mines on their board!
	- Blitz: The 1v1 stamina race to clear more tiles than your opponent
 -->

<!-- I use flex for now because I can't deal with grid -->
<div class="flex h-screen w-screen items-center justify-evenly space-x-5">
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
		<div class="flex items-center space-x-2">
			<Switch id="airplane-mode" disabled />
			<Label for="airplane-mode">Guess-less mode</Label>
		</div>
		<div>Flags left: {game.flags}</div>
	</div>
</div>

<style>
	button:focus {
		outline: none;
	}
</style>
