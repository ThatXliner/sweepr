<script lang="ts">
	// The infinite board is similar to the classic game board
	// in gameplay, but here the board is infinitely tall
	// and thus automatically (infinitely) "scrolls" the board vertically.
	// You lose when an unrevealed mine is scrolled off the top of the screen.
	// How the infinite board works is that it's 2 boards stacked on top of each other.
	// The top board is the visible board, and the bottom board is the off-screen board.
	// When the top board is scrolled off the screen, the bottom board becomes the top board
	// and a new bottom board is generated.
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { Game } from '$lib/gameLogic.svelte';
	import Time from './Time.svelte';
	// TODO: Scaling factor
	export const scrollRate = 1;
	const rows = 14;
	const cols = rows / 2;
	const mines = Math.round(rows * cols * 0.2);
	const HEIGHT_PX = 48 * rows;
	const WIDTH_PX = 48 * cols;

	// TODO: in the future, the rate may increase as time goes on
	let gameAlpha: Game = new Game(rows, cols, mines);
	let gameBeta: Game = new Game(rows, cols, mines);
	let alphaBoard = gameAlpha.board;
	let betaBoard = gameBeta.board;
	type BoardType = 'alpha' | 'beta';
	let boardAlpha: HTMLDivElement;
	let boardBeta: HTMLDivElement;
	let globalTimerInitialized = false;
	let globalScrollInitialized = false;
	let globalGameOver = false;
	function reveal(boardType: BoardType, row: number, col: number) {
		const game = boardType === 'alpha' ? gameAlpha : gameBeta;
		// Guarantee that the first cell clicked is not a mine.
		// For some reason, this has to be done in the click handler
		// otherwise the UI will not update
		if (game.isFirstClick) {
			game.isFirstClick = false;
			while (game.board[row][col].isMine || game.board[row][col].adjacentMines != 0) {
				game.board = game.generateBoard(game.rows, game.cols, game.mines);
			}
			startInfiniteScroll();
			startTimer();
		}
		if (boardType === 'alpha') {
			alphaBoard = game.revealCell(row, col);
		} else {
			betaBoard = game.revealCell(row, col);
		}
		if (game.checkLose() || game.checkWin()) {
			stopTimer();
			globalGameOver = true;
		}
	}
	function flag(boardType: BoardType, row: number, col: number) {
		const game = boardType === 'alpha' ? gameAlpha : gameBeta;
		if (boardType === 'alpha') {
			alphaBoard = game.flagCell(row, col);
		} else {
			betaBoard = game.flagCell(row, col);
		}
		if (game.checkLose() || game.checkWin()) {
			stopTimer();
		}
	}
	function handleCellClick(boardType: BoardType, row: number, col: number) {
		if (invertControls) {
			flag(boardType, row, col);
		} else {
			reveal(boardType, row, col);
		}
	}

	function handleCellRightClick(event: MouseEvent, boardType: BoardType, row: number, col: number) {
		event.preventDefault();
		if (invertControls) {
			reveal(boardType, row, col);
		} else {
			flag(boardType, row, col);
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
		if (globalTimerInitialized) {
			return;
		}
		startTime = Date.now();
		timer = setInterval(() => {
			elapsedTime = Date.now() - startTime;
		}, 1);
		globalTimerInitialized = true;
	}

	function stopTimer() {
		clearInterval(timer);
	}

	function resetTimer() {
		clearInterval(timer);
		elapsedTime = 0;
	}
	let then = 0;
	function startInfiniteScroll() {
		if (globalScrollInitialized) {
			return;
		}
		then = Date.now();
		scroll();
		globalScrollInitialized = true;
	}
	const fpsInterval = 1000 / 24;
	function scroll() {
		if (globalGameOver) return;
		const now = Date.now();
		const elapsed = now - then;
		if (elapsed > fpsInterval) {
			then = now - (elapsed % fpsInterval);
			let yPosAlpha = Number.parseInt(boardAlpha.style.top.replace('px', ''));
			let yPosBeta = Number.parseInt(boardBeta.style.top.replace('px', ''));
			yPosAlpha -= scrollRate;
			yPosBeta -= scrollRate;
			if (yPosAlpha <= -HEIGHT_PX) {
				yPosAlpha = HEIGHT_PX;
				gameAlpha = new Game(rows, cols, mines);
				alphaBoard = gameAlpha.board;
			}
			if (yPosBeta <= -HEIGHT_PX * 2) {
				yPosBeta = 0;
				gameBeta = new Game(rows, cols, mines);
				betaBoard = gameBeta.board;
			}
			boardAlpha.style.top = `${yPosAlpha}px`;
			boardBeta.style.top = `${yPosBeta}px`;
		}

		// Request another animation frame to continue scrolling
		requestAnimationFrame(scroll);
	}
</script>

<Time milliseconds={elapsedTime} />
<!-- I use flex for now because I can't deal with grid -->
<div class="flex h-screen justify-evenly">
	<div class="max-h-[{rows * 3}rem] max-w-[{cols * 3}rem] overflow-hidden border-8 border-black">
		<div bind:this={boardAlpha} class="relative" style="top:{(48 * rows) / 2}px">
			{#each alphaBoard as row, rowIndex}
				<div class="flex">
					{#each row as cell, colIndex}
						<button
							class="h-12 w-12 border border-gray-400 {cell.isRevealed
								? 'bg-white'
								: 'bg-gray-200'} {cell.isFlagged
								? 'text-red-500'
								: getCellColor(cell.adjacentMines)}"
							on:click={() => handleCellClick('alpha', rowIndex, colIndex)}
							on:contextmenu={(event) => handleCellRightClick(event, 'alpha', rowIndex, colIndex)}
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
		<div bind:this={boardBeta} class="relative" style="top:{(48 * rows) / 2}px">
			{#each betaBoard as row, rowIndex}
				<div class="flex">
					{#each row as cell, colIndex}
						<button
							class="h-12 w-12 border border-gray-400 {cell.isRevealed
								? 'bg-white'
								: 'bg-gray-200'} {cell.isFlagged
								? 'text-red-500'
								: getCellColor(cell.adjacentMines)}"
							on:click={() => handleCellClick('beta', rowIndex, colIndex)}
							on:contextmenu={(event) => handleCellRightClick(event, 'beta', rowIndex, colIndex)}
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
	</div>
	<div class="my-auto flex flex-col justify-evenly space-y-3">
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
		<!-- TODO: only show flags that are available onscreen -->
		<div>Flags left: Infinite</div>
	</div>
</div>

<style>
	button:focus {
		outline: none;
	}
</style>
