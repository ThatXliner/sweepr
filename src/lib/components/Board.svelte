<script lang="ts">
	import { getCellColor, type Board } from '$lib/gameLogic.svelte';

	interface Props {
		board: Board;
		// When false, clicks/long-press do nothing (opponent / view-only boards).
		interactive?: boolean;
		onCell?: (row: number, col: number) => void;
		onCellAlt?: (event: Event, row: number, col: number) => void;
		// Tailwind size class for each cell button (e.g. 'h-8 w-8', 'h-5 w-5').
		cellSize?: string;
		// Tailwind bg class for unrevealed cells (lets opponent boards tint).
		unrevealedBg?: string;
		// Cells to highlight without revealing them — used by Tactical's placement
		// phase to show where the player has dropped mines. Keys are `${row},${col}`.
		marks?: Set<string>;
		markEmoji?: string;
	}

	let {
		board,
		interactive = true,
		onCell,
		onCellAlt,
		cellSize = 'h-8 w-8',
		unrevealedBg = 'bg-gray-200',
		marks,
		markEmoji = '🎯'
	}: Props = $props();

	let touchStart = $state(0);
	const TOUCH_DELAY = 500;

	function handleClick(row: number, col: number) {
		if (interactive) onCell?.(row, col);
	}
	function handleAlt(event: Event, row: number, col: number) {
		event.preventDefault();
		if (interactive) onCellAlt?.(event, row, col);
	}

	function content(cell: Board[number][number], row: number, col: number): string {
		if (cell.isRevealed && cell.isMine) return '💣';
		if (cell.isRevealed) return cell.adjacentMines ? String(cell.adjacentMines) : '';
		if (cell.isFlagged) return '🚩';
		if (marks?.has(`${row},${col}`)) return markEmoji;
		return '';
	}
</script>

{#each board as row, rowIndex (rowIndex)}
	<div class="flex">
		{#each row as cell, colIndex (colIndex)}
			<button
				class="{cellSize} border border-gray-400 {cell.isRevealed
					? 'bg-white'
					: unrevealedBg} {cell.isFlagged ? 'text-red-500' : getCellColor(cell.adjacentMines)}"
				class:cursor-default={!interactive}
				onclick={() => handleClick(rowIndex, colIndex)}
				oncontextmenu={(event) => handleAlt(event, rowIndex, colIndex)}
				ontouchstart={() => (touchStart = Date.now())}
				ontouchend={(event) =>
					Date.now() - touchStart >= TOUCH_DELAY && handleAlt(event, rowIndex, colIndex)}
			>
				{content(cell, rowIndex, colIndex)}
			</button>
		{/each}
	</div>
{/each}

<style>
	button:focus {
		outline: none;
	}
</style>
