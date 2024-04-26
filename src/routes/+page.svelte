<script lang="ts">
	import { Game } from '$lib/gameLogic.svelte';

	const rows = 16;
	const cols = 30;
	const mines = 99;
	let game: Game = new Game(rows, cols, mines);

	function handleCellClick(row: number, col: number) {
		// Guaranteed first click solvability
		game.revealCell(row, col);
	}

	function handleCellRightClick(event: MouseEvent, row: number, col: number) {
		event.preventDefault();
		game.flagCell(row, col);
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
		{#each game.getBoard() as row, rowIndex}
			<div class="flex">
				{#each row as cell, colIndex}
					<button
						class="h-8 w-8 border border-gray-400 {cell.isRevealed
							? 'bg-white'
							: 'bg-gray-200'} {cell.isFlagged ? 'text-red-500' : ''}"
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
	<div>Flags left: 0</div>
</div>

<style>
	button:focus {
		outline: none;
	}
</style>
