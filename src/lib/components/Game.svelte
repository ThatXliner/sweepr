<script lang="ts">
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import { untrack } from 'svelte';
	import { Game, type Board } from '$lib/gameLogic.svelte';
	import { findGuesslessSeed, isGuesslessOpening } from '$lib/solver';
	import Board_ from './Board.svelte';
	import Time from './Time.svelte';

	interface Props {
		rows?: number;
		cols?: number;
		mines?: number;
	}

	let { rows = 16, cols = 30, mines = 99 }: Props = $props();

	// `game` is plain mutable state that the reveal/flag handlers mutate in
	// place; `board` mirrors `game.board` and is the reactive value the template
	// renders. The $effect below rebuilds both whenever the difficulty props
	// change and also runs on mount, so these initial values are placeholders.
	let game: Game = $state(new Game(16, 30, 99));
	let board: Board = $state([]);

	$effect(() => {
		// Track only the difficulty props; untrack the writes so the effect can't
		// re-trigger itself (which would loop until effect_update_depth_exceeded).
		void rows;
		void cols;
		void mines;
		untrack(() => {
			game = new Game(rows, cols, mines);
			board = game.board;
			resetTimer();
		});
	});
	function reveal(row: number, col: number) {
		// Guarantee that the first cell clicked is not a mine — and, in guessless
		// mode, that the whole board is solvable by pure logic from that click.
		// For some reason, this has to be done in the click handler
		// otherwise the UI will not update
		if (game.isFirstClick) {
			game.isFirstClick = false;
			let dealt = false;
			if (guessless && !isGuesslessOpening(game, row, col)) {
				const seed = findGuesslessSeed(game.rows, game.cols, game.mines, row, col);
				if (seed !== null) {
					game.board = game.generateBoard(game.rows, game.cols, game.mines, seed);
					dealt = true;
				}
			} else if (guessless) {
				dealt = true; // the dealt board already qualifies
			}
			if (!dealt) {
				// Guessless off, or (rarely) the seed search capped out: plain
				// first-click flood safety.
				while (game.board[row][col].isMine || game.board[row][col].adjacentMines != 0) {
					game.board = game.generateBoard(game.rows, game.cols, game.mines);
				}
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
	function onCell(row: number, col: number) {
		if (invertControls) {
			flag(row, col);
		} else {
			reveal(row, col);
		}
	}

	function onCellAlt(event: Event, row: number, col: number) {
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
	// Guessless: the board re-deals on the first click until it's fully solvable
	// by logic — no forced guesses. On by default; takes effect per new board.
	let guessless = $state(true);

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

	$effect(() => () => clearInterval(timer));
</script>

<div
	class="flex flex-col items-center gap-4 p-3 sm:flex-row sm:items-start sm:justify-center sm:gap-10"
>
	<div class="flex flex-col items-center gap-3">
		<Time milliseconds={elapsedTime} />
		<Board_ {board} {onCell} {onCellAlt} label="Classic board" />
	</div>
	<div class="flex flex-col gap-3 text-sm">
		<p class="text-muted-foreground">
			{invertControls
				? 'Left-click flags, right-click reveals'
				: 'Left-click reveals, right-click flags'}. Keyboard: arrows move, Enter reveals, F flags.
		</p>
		<div class="flex items-center gap-2">
			<Switch id="guess-less-mode" bind:checked={guessless} />
			<Label for="guess-less-mode">Guess-less mode</Label>
		</div>
		<div class="flex items-center gap-2">
			<Switch id="invert-controls" bind:checked={invertControls} />
			<Label for="invert-controls">Invert controls</Label>
		</div>
		<div class="text-muted-foreground">
			Flags left: <span class="font-semibold text-foreground">{game.flags}</span>
		</div>
	</div>
</div>
