<script lang="ts">
	import { getCellColor, type Board } from '$lib/gameLogic.svelte';

	interface Props {
		board: Board;
		// When false, clicks/keys/long-press do nothing (opponent / view-only boards).
		interactive?: boolean;
		onCell?: (row: number, col: number) => void;
		onCellAlt?: (event: Event, row: number, col: number) => void;
		// Tailwind size class for each cell button (e.g. 'h-8 w-8', 'h-5 w-5').
		cellSize?: string;
		// Tailwind bg class for unrevealed cells (lets opponent boards tint).
		// Defaults to the themed covered-tile surface.
		unrevealedBg?: string;
		// Cells to highlight without revealing them — used by Tactical's placement
		// phase to show where the player has dropped mines. Keys are `${row},${col}`.
		marks?: Set<string>;
		markEmoji?: string;
		// Accessible name for the grid as a whole (e.g. "Your board").
		label?: string;
	}

	let {
		board,
		interactive = true,
		onCell,
		onCellAlt,
		cellSize = 'h-8 w-8',
		unrevealedBg,
		marks,
		markEmoji = '🎯',
		label = 'Minesweeper board'
	}: Props = $props();

	let touchStart = $state(0);
	const TOUCH_DELAY = 500;

	// Roving-tabindex focus position. Only one cell is in the tab order at a
	// time; arrow keys move focus within the grid. Clamped against the current
	// board size so a board regen never strands focus out of bounds.
	let focusRow = $state(0);
	let focusCol = $state(0);
	let gridEl: HTMLDivElement | undefined = $state();

	function clamp(v: number, max: number) {
		return Math.max(0, Math.min(v, max));
	}

	function focusCell(row: number, col: number) {
		focusRow = clamp(row, board.length - 1);
		focusCol = clamp(col, (board[0]?.length ?? 1) - 1);
		const btn = gridEl?.querySelector<HTMLButtonElement>(
			`button[data-row="${focusRow}"][data-col="${focusCol}"]`
		);
		btn?.focus();
	}

	function handleClick(row: number, col: number) {
		if (interactive) onCell?.(row, col);
	}

	// Right-click is driven by mousedown (button 2) rather than the contextmenu
	// event: contextmenu fires inconsistently on trackpads (two-finger tap timing,
	// OS gesture handling) and can be swallowed, whereas mousedown on the right
	// button is reliable. `click` only fires for the left button, so this never
	// collides with the left-click handler.
	function handleMouseDown(event: MouseEvent, row: number, col: number) {
		if (event.button !== 2) return;
		event.preventDefault();
		if (interactive) onCellAlt?.(event, row, col);
	}

	function suppressMenu(event: Event) {
		// Keep the browser context menu from popping; the actual flag is handled on
		// mousedown above.
		event.preventDefault();
	}

	// Keyboard play: arrows move focus, Enter/Space reveal (primary action), and
	// `f` flags (alternate action) — mirroring left/right click. Home/End jump to
	// row ends; Ctrl+Home/End to board corners.
	function handleKeyDown(event: KeyboardEvent, row: number, col: number) {
		if (!interactive) return;
		const lastRow = board.length - 1;
		const lastCol = (board[row]?.length ?? 1) - 1;
		switch (event.key) {
			case 'ArrowUp':
				event.preventDefault();
				focusCell(row - 1, col);
				break;
			case 'ArrowDown':
				event.preventDefault();
				focusCell(row + 1, col);
				break;
			case 'ArrowLeft':
				event.preventDefault();
				focusCell(row, col - 1);
				break;
			case 'ArrowRight':
				event.preventDefault();
				focusCell(row, col + 1);
				break;
			case 'Home':
				event.preventDefault();
				focusCell(event.ctrlKey ? 0 : row, 0);
				break;
			case 'End':
				event.preventDefault();
				focusCell(event.ctrlKey ? lastRow : row, lastCol);
				break;
			case 'Enter':
			case ' ':
				event.preventDefault();
				onCell?.(row, col);
				break;
			case 'f':
			case 'F':
				event.preventDefault();
				onCellAlt?.(event, row, col);
				break;
		}
	}

	function content(cell: Board[number][number], row: number, col: number): string {
		if (cell.isRevealed && cell.isMine) return '💣';
		if (cell.isRevealed) return cell.adjacentMines ? String(cell.adjacentMines) : '';
		if (cell.isFlagged) return '🚩';
		if (marks?.has(`${row},${col}`)) return markEmoji;
		return '';
	}

	// Screen-reader description of a cell's state.
	function cellLabel(cell: Board[number][number], row: number, col: number): string {
		const pos = `row ${row + 1}, column ${col + 1}`;
		if (cell.isRevealed && cell.isMine) return `${pos}, mine`;
		if (cell.isRevealed)
			return `${pos}, ${cell.adjacentMines ? `${cell.adjacentMines} adjacent mines` : 'empty'}`;
		if (cell.isFlagged) return `${pos}, flagged`;
		if (marks?.has(`${row},${col}`)) return `${pos}, marked`;
		return `${pos}, covered`;
	}
</script>

<!-- Container-level guard: any right-click inside the board (even a hairline
	gap between buttons) is suppressed so the browser menu never pops, and the
	whole area is treated as the board. -->
<div
	bind:this={gridEl}
	class:pointer-events-none={!interactive}
	oncontextmenu={suppressMenu}
	role="grid"
	aria-label={label}
	aria-disabled={!interactive}
	tabindex="-1"
>
	{#each board as row, rowIndex (rowIndex)}
		<div class="flex" role="row">
			{#each row as cell, colIndex (colIndex)}
				{@const focused = rowIndex === focusRow && colIndex === focusCol}
				<button
					data-row={rowIndex}
					data-col={colIndex}
					role="gridcell"
					aria-label={cellLabel(cell, rowIndex, colIndex)}
					tabindex={interactive && focused ? 0 : -1}
					class="{cellSize} relative -mr-px -mb-px border border-cell-grid font-semibold tabular-nums transition-colors focus-visible:z-10 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none {cell.isRevealed
						? 'bg-cell-revealed'
						: (unrevealedBg ?? 'bg-cell-covered hover:brightness-95')} {cell.isFlagged
						? 'text-destructive'
						: getCellColor(cell.adjacentMines)}"
					class:cursor-default={!interactive}
					onclick={() => handleClick(rowIndex, colIndex)}
					onmousedown={(event) => handleMouseDown(event, rowIndex, colIndex)}
					oncontextmenu={suppressMenu}
					onkeydown={(event) => handleKeyDown(event, rowIndex, colIndex)}
					onfocus={() => {
						focusRow = rowIndex;
						focusCol = colIndex;
					}}
					ontouchstart={() => (touchStart = Date.now())}
					ontouchend={(event) => {
						if (Date.now() - touchStart >= TOUCH_DELAY && interactive)
							onCellAlt?.(event, rowIndex, colIndex);
					}}
				>
					{content(cell, rowIndex, colIndex)}
				</button>
			{/each}
		</div>
	{/each}
</div>
