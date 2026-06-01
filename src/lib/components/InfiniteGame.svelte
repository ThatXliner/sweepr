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
	import { Game, getCellColor } from '$lib/gameLogic.svelte';
	import Time from './Time.svelte';
	// TODO: Scaling factor: in the future, the rate may increase as time goes on
	export const scrollRate = 1;
	const rows = 14;
	const cols = rows / 2;
	const mines = Math.round(rows * cols * 0.2);
	const HEIGHT_PX = 48 * rows;
	// const WIDTH_PX = 48 * cols;

	let gameAlpha: Game = new Game(rows, cols, mines);
	let gameBeta: Game = new Game(rows, cols, mines);
	let alphaBoard = $state(gameAlpha.board);
	let betaBoard = $state(gameBeta.board);
	type BoardType = 'alpha' | 'beta';
	let boardAlpha: HTMLDivElement | undefined = $state();
	let boardBeta: HTMLDivElement | undefined = $state();

	let globalTimerInitialized = false;
	let globalScrollInitialized = false;
	let globalGameOver = false;
	function loseTheGame() {
		stopTimer();
		globalGameOver = true;
	}
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
		if (game.checkLose()) {
			loseTheGame();
		}
	}
	function flag(boardType: BoardType, row: number, col: number) {
		const game = boardType === 'alpha' ? gameAlpha : gameBeta;
		if (game.isFirstClick) {
			return;
		}
		if (boardType === 'alpha') {
			alphaBoard = game.flagCell(row, col);
		} else {
			betaBoard = game.flagCell(row, col);
		}
	}

	function handleCellClick(boardType: BoardType, row: number, col: number) {
		if (invertControls) {
			flag(boardType, row, col);
		} else {
			reveal(boardType, row, col);
		}
	}
	function handleCellRightClick(event: Event, boardType: BoardType, row: number, col: number) {
		event.preventDefault();
		if (invertControls) {
			reveal(boardType, row, col);
		} else {
			flag(boardType, row, col);
		}
	}

	let startTime = 0;
	let timer: ReturnType<typeof setInterval>;
	let elapsedTime = $state(0);
	let invertControls = $state(false);

	function startTimer() {
		// Only initialize once
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

	let then = 0;
	function startInfiniteScroll() {
		// Only initialize once
		if (globalScrollInitialized) {
			return;
		}
		then = Date.now();
		scroll();
		globalScrollInitialized = true;
	}
	const fpsInterval = 1000 / 24;
	function rowIsComplete(game: Game, row: number) {
		return game.board[row].every((cell) => cell.isRevealed || (cell.isFlagged && cell.isMine));
	}
	function scroll() {
		if (globalGameOver) return;
		if (!boardAlpha || !boardBeta) return;
		const now = Date.now();
		const elapsed = now - then;
		if (elapsed > fpsInterval) {
			// FPS throttling code stolen from https://stackoverflow.com/a/19772220
			then = now - (elapsed % fpsInterval);
			// Vertical scrolling animation from Llama3
			let yPosAlpha = Number.parseInt(
				boardAlpha.style.transform.replace('px', '').replace('translateY(', '').replace(')', '')
			);
			let yPosBeta = Number.parseInt(
				boardBeta.style.transform.replace('px', '').replace('translateY(', '').replace(')', '')
			);
			yPosAlpha -= scrollRate;
			yPosBeta -= scrollRate;
			// I played with the values until it looked right
			// so I can't really explain why it's -HEIGHT_PX, HEIGHT_PX,
			// -HEIGHT_PX * 2, and 0
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
			const alphaRowsGone = Math.round(yPosAlpha / 48);
			const betaRowsGone = Math.round(yPosBeta / 48) + rows;
			if (alphaRowsGone <= 0) {
				if (!rowIsComplete(gameAlpha, -alphaRowsGone)) {
					loseTheGame();
					return;
				}
			}
			if (betaRowsGone <= 0) {
				if (!rowIsComplete(gameBeta, -betaRowsGone)) {
					loseTheGame();
					return;
				}
			}
			boardAlpha.style.transform = `translateY(${yPosAlpha}px)`;
			boardBeta.style.transform = `translateY(${yPosBeta}px)`;
		}

		// Request another animation frame to continue scrolling
		requestAnimationFrame(scroll);
	}
	let touchStart = $state(0);
	const TOUCH_DELAY = 500;
</script>

<Time milliseconds={elapsedTime} />
<!-- I use flex for now because I can't deal with grid -->
<div class="flex h-screen justify-evenly">
	<!-- These must be manually calculated as {3*rows} and {3*cols} respectively -->
	<div class="relative max-h-[42rem] max-w-[21rem] overflow-hidden border-8 border-black">
		<div class="absolute top-0 z-10 h-6 w-full bg-red-500 text-center">DEATH.</div>
		<div bind:this={boardAlpha} style="transform:translateY({(48 * rows) / 2}px)">
			{#each alphaBoard as row, rowIndex (rowIndex)}
				<div class="flex">
					{#each row as cell, colIndex (colIndex)}
						<button
							class="h-12 w-12 border border-gray-400 {cell.isRevealed
								? 'bg-white'
								: 'bg-gray-200'} {cell.isFlagged
								? 'text-red-500'
								: getCellColor(cell.adjacentMines)}"
							onclick={() => handleCellClick('alpha', rowIndex, colIndex)}
							oncontextmenu={(event) => handleCellRightClick(event, 'alpha', rowIndex, colIndex)}
							ontouchstart={() => {
								touchStart = Date.now();
							}}
							ontouchend={(event) =>
								Date.now() - touchStart >= TOUCH_DELAY &&
								handleCellRightClick(event, 'alpha', rowIndex, colIndex)}
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
		<div bind:this={boardBeta} style="transform:translateY({(48 * rows) / 2}px)">
			{#each betaBoard as row, rowIndex (rowIndex)}
				<div class="flex">
					{#each row as cell, colIndex (colIndex)}
						<button
							class="h-12 w-12 border border-gray-400 {cell.isRevealed
								? 'bg-white'
								: 'bg-blue-200'} {cell.isFlagged
								? 'text-red-500'
								: getCellColor(cell.adjacentMines)}"
							onclick={() => handleCellClick('beta', rowIndex, colIndex)}
							oncontextmenu={(event) => handleCellRightClick(event, 'beta', rowIndex, colIndex)}
							ontouchstart={() => {
								touchStart = Date.now();
							}}
							ontouchend={(event) =>
								Date.now() - touchStart >= TOUCH_DELAY &&
								handleCellRightClick(event, 'beta', rowIndex, colIndex)}
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
