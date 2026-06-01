<script lang="ts">
	import { Game, type Board } from '$lib/gameLogic.svelte';
	import {
		makeTacticalBot,
		randomMinePlacement,
		DIFFICULTY_DELAYS,
		DIFFICULTIES,
		type Difficulty,
		type OpponentDriver
	} from '$lib/opponent.svelte';
	import Board_ from './Board.svelte';
	import ModeInfo from './ModeInfo.svelte';
	import Time from './Time.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';

	interface Props {
		players?: number;
		rows?: number;
		cols?: number;
		// Mines each player places onto their opponents.
		budget?: number;
	}

	// Config is fixed for the match (the page never re-passes props).
	let { players = 4, rows = 9, cols = 9, budget = 10 }: Props = $props();

	type Phase = 'placing' | 'sweeping' | 'done';
	let phase = $state<Phase>('placing');
	// Bot speed tier, chosen before the match in the placing phase.
	let difficulty = $state<Difficulty>('medium');

	// Player 0 is the human; 1..N-1 are bots.
	// svelte-ignore state_referenced_locally
	const ids = Array.from({ length: players }, (_, i) => i);
	const HUMAN = 0;

	// Mines authored ON each player's board, keyed by target id. Accumulated from
	// every other player during placement; consumed by Game.fromMines at build.
	let placements = $state<Map<number, Array<[number, number]>>>(new Map(ids.map((id) => [id, []])));
	// `${target},${r},${c}` cells already taken, to avoid double-placing.
	// Plain dedup tracker; reactivity comes from `placements`, not this set.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const taken = new Set<string>();

	// svelte-ignore state_referenced_locally
	let minesLeft = $state(budget);

	// A stable empty grid to render opponent boards during placement (their real
	// mines are hidden from the player anyway).
	// svelte-ignore state_referenced_locally
	const emptyBoard: Board = Game.fromMines(rows, cols, []).board;

	// Sweep-phase state, populated at build time.
	let games = $state<Game[]>([]);
	let boards = $state<Board[]>([]);
	let alive = $state<boolean[]>([]);
	// How many boards each player has cleared — each fresh board gets harder.
	let cleared = $state<number[]>([]);
	let bots: OpponentDriver[] = [];

	// Mines on a freshly-spawned board: the base placement budget plus one per
	// board already cleared, so survivors face escalating difficulty.
	function mineCountFor(clearedBoards: number): number {
		return budget + clearedBoards;
	}

	let elapsed = $state(0);
	let startTime = 0;
	let timer: ReturnType<typeof setInterval> | undefined;
	let invertControls = $state(false);
	let result = $state('');

	// --- Placement phase ---

	function placeMine(target: number, row: number, col: number) {
		if (phase !== 'placing' || minesLeft <= 0) return;
		const k = `${target},${row},${col}`;
		if (taken.has(k)) return;
		taken.add(k);
		placements.get(target)!.push([row, col]);
		placements = new Map(placements); // trigger reactivity
		minesLeft--;
	}

	// Cells the human has marked on a given target board, for the 🎯 overlay.
	// Rebuilt from reactive `placements` each call, so a plain Set is correct.
	function marksFor(target: number): Set<string> {
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const set = new Set<string>();
		for (const [r, c] of placements.get(target) ?? []) set.add(`${r},${c}`);
		return set;
	}

	function botsPlace() {
		// Each bot spends its budget across everyone but itself.
		for (const placer of ids) {
			if (placer === HUMAN) continue;
			const targets = ids.filter((id) => id !== placer);
			let remaining = budget;
			// Spread roughly evenly over targets.
			for (let t = 0; t < targets.length; t++) {
				const target = targets[t];
				const share = t === targets.length - 1 ? remaining : Math.ceil(budget / targets.length);
				const n = Math.min(share, remaining);
				const targetTaken = new Set((placements.get(target) ?? []).map(([r, c]) => `${r},${c}`));
				const coords = randomMinePlacement(rows, cols, n, targetTaken);
				placements.get(target)!.push(...coords);
				remaining -= coords.length;
				if (remaining <= 0) break;
			}
		}
	}

	function startSweep() {
		botsPlace();
		// Build each player's board from the mines others placed on them.
		games = ids.map((id) => Game.fromMines(rows, cols, placements.get(id) ?? []));
		boards = games.map((g) => g.board);
		alive = ids.map(() => true);
		cleared = ids.map(() => 0);
		phase = 'sweeping';

		startTime = Date.now();
		timer = setInterval(() => (elapsed = Date.now() - startTime), 100);

		// Drive the bot players.
		bots = ids.map((id) => (id === HUMAN ? { start() {}, stop() {} } : makeBot(id)));
		bots.forEach((b) => b.start());
	}

	function makeBot(id: number): OpponentDriver {
		return makeTacticalBot(games[id], {
			...botSpeed(id),
			onChange: () => {
				boards[id] = games[id].board;
				boards = [...boards];
				checkPlayer(id);
			},
			// A bot's correct flag attacks everyone else, just like the human's.
			onCorrectFlag: () => sendMineToOpponents(id)
		});
	}

	// All bots share the chosen difficulty's speed, with a small per-bot stagger
	// so they don't move in perfect lockstep.
	function botSpeed(id: number): { minDelay: number; maxDelay: number } {
		const { minDelay, maxDelay } = DIFFICULTY_DELAYS[difficulty];
		const stagger = id * 80;
		return { minDelay: minDelay + stagger, maxDelay: maxDelay + stagger };
	}

	// --- Sweep phase ---

	function checkPlayer(id: number) {
		if (!alive[id]) return;
		if (games[id].checkLose()) {
			alive[id] = false;
			alive = [...alive];
			bots[id]?.stop();
		} else if (games[id].checkWin()) {
			// Cleared the board: survive and get a fresh, harder one to keep
			// sweeping. The match only ends by elimination.
			cleared[id]++;
			cleared = [...cleared];
			regenerateBoard(id);
		}
		evaluate();
	}

	// Replace a player's cleared board with a new, denser one.
	function regenerateBoard(id: number) {
		const fresh = new Game(rows, cols, mineCountFor(cleared[id]));
		games[id] = fresh;
		boards[id] = fresh.board;
		boards = [...boards];
		// The bot held a reference to the old board, so re-point it at the new one.
		if (id !== HUMAN) {
			bots[id]?.stop();
			bots[id] = makeBot(id);
			bots[id].start();
		}
	}

	// A correct flag sends a mine to every other living player's board, dropped
	// on a covered cell with no revealed neighbor so no visible number changes.
	function sendMineToOpponents(fromId: number) {
		for (const id of ids) {
			if (id === fromId || !alive[id]) continue;
			games[id].injectMine();
			boards[id] = games[id].board;
		}
		boards = [...boards];
	}

	function evaluate() {
		const survivors = ids.filter((id) => alive[id]);
		if (survivors.length <= 1) finish(survivors[0]);
	}

	function clearedCount(board: Board): number {
		let n = 0;
		for (const row of board) for (const cell of row) if (cell.isRevealed && !cell.isMine) n++;
		return n;
	}

	function finish(winnerId?: number) {
		if (phase === 'done') return;
		phase = 'done';
		clearInterval(timer);
		bots.forEach((b) => b.stop());

		let winner = winnerId;
		if (winner === undefined) {
			// Everyone died on the same tick: break by boards cleared, then by tiles
			// cleared on the current board.
			let best = -1;
			for (const id of ids) {
				const score = cleared[id] * 10_000 + clearedCount(games[id].board);
				if (score > best) {
					best = score;
					winner = id;
				}
			}
		}
		result = winner === HUMAN ? 'You win — last sweeper standing!' : `Opponent ${winner} wins.`;
	}

	function reveal(row: number, col: number) {
		if (phase !== 'sweeping' || !alive[HUMAN]) return;
		boards[HUMAN] = games[HUMAN].revealCell(row, col);
		boards = [...boards];
		checkPlayer(HUMAN);
	}
	function flag(row: number, col: number) {
		if (phase !== 'sweeping' || !alive[HUMAN]) return;
		const cell = games[HUMAN].board[row][col];
		const wasFlagged = cell.isFlagged;
		boards[HUMAN] = games[HUMAN].flagCell(row, col);
		boards = [...boards];
		// Correctly flagging a mine (newly flagged, actually a mine) sends a mine
		// to every opponent.
		if (!wasFlagged && cell.isFlagged && cell.isMine) {
			sendMineToOpponents(HUMAN);
		}
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
		return () => {
			clearInterval(timer);
			bots.forEach((b) => b.stop());
		};
	});
</script>

<div class="flex flex-col items-center gap-4 p-3">
	<div class="flex items-center gap-2">
		<span class="h-3 w-3 rounded-full bg-red-600" aria-hidden="true"></span>
		<h2 class="text-lg font-semibold">Tactical</h2>
		<ModeInfo title="Tactical">
			<p>A battle royale where you place mines on your opponents' boards, then everyone sweeps.</p>
			<p>
				<strong>Placing:</strong> click opponent boards to drop your mines on them. Your own board gets
				mined by everyone else.
			</p>
			<p>
				<strong>Sweeping:</strong> once everyone's ready, clear the board your opponents built for you.
				Left click reveals, right click flags. Hit a mine and you're eliminated.
			</p>
			<p>
				<strong>Attack:</strong> correctly flag a mine and you send a hidden mine to every opponent's
				board. Clear your whole board and you get a fresh, harder one.
			</p>
			<p>Last sweeper alive wins. Opponents are bots for now; online play is coming.</p>
		</ModeInfo>
	</div>
	{#if phase === 'placing'}
		<h2 class="text-2xl font-bold">Place your mines</h2>
		<div class="flex items-center gap-2 text-sm">
			<Label for="tactical-difficulty">Bot difficulty</Label>
			<select
				id="tactical-difficulty"
				bind:value={difficulty}
				class="rounded-md border bg-background px-2 py-1 capitalize focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			>
				{#each DIFFICULTIES as d (d)}
					<option value={d} class="capitalize">{d}</option>
				{/each}
			</select>
		</div>
		<p class="text-sm text-muted-foreground">
			Click opponent boards to drop mines on them. Mines left:
			<span class="font-bold text-foreground">{minesLeft}</span>
		</p>
		<div class="flex flex-wrap items-start justify-center gap-8">
			{#each ids.filter((id) => id !== HUMAN) as id (id)}
				<div class="flex flex-col items-center gap-1">
					<h3 class="font-semibold text-red-600 dark:text-red-400">Opponent {id}</h3>
					<Board_
						board={emptyBoard}
						interactive={minesLeft > 0}
						onCell={(r, c) => placeMine(id, r, c)}
						onCellAlt={(e, r, c) => placeMine(id, r, c)}
						cellSize="h-7 w-7"
						unrevealedBg="bg-red-500/20"
						marks={marksFor(id)}
						label="Opponent {id}'s board"
					/>
				</div>
			{/each}
		</div>
		<button
			class="rounded-md bg-red-600 px-4 py-2 font-bold text-white shadow transition-transform hover:scale-105 hover:bg-red-700 focus-visible:ring-4 focus-visible:ring-red-400 focus-visible:outline-none"
			onclick={startSweep}
		>
			Ready — start sweeping
		</button>
	{:else}
		<Time milliseconds={elapsed} />
		{#if phase === 'done'}
			<h2 class="text-2xl font-bold">{result}</h2>
		{:else}
			<p class="text-sm text-muted-foreground">
				{invertControls
					? 'Left-click flags, right-click reveals'
					: 'Left-click reveals, right-click flags'} — correctly flagging a mine sends one to every opponent.
				Last sweeper alive wins.
			</p>
		{/if}
		<div class="flex flex-wrap items-start justify-center gap-8">
			{#each ids as id (id)}
				<div class="flex flex-col items-center gap-1" class:opacity-50={!alive[id]}>
					<h3 class="font-semibold {id === HUMAN ? '' : 'text-red-600 dark:text-red-400'}">
						{id === HUMAN ? 'You' : `Opponent ${id}`} — {clearedCount(boards[id])}
						{#if cleared[id] > 0}
							<span class="text-xs font-normal text-muted-foreground">({cleared[id]} cleared)</span>
						{/if}
					</h3>
					<Board_
						board={boards[id]}
						interactive={id === HUMAN && phase === 'sweeping' && alive[HUMAN]}
						{onCell}
						{onCellAlt}
						cellSize="h-7 w-7"
						unrevealedBg={id === HUMAN ? undefined : 'bg-red-500/20'}
						label={id === HUMAN ? 'Your board' : `Opponent ${id}'s board`}
					/>
					<span class="text-sm text-muted-foreground">{alive[id] ? 'alive' : 'eliminated'}</span>
				</div>
			{/each}
		</div>
		{#if phase === 'sweeping'}
			<div class="flex items-center gap-2 text-sm">
				<Switch id="tactical-invert" bind:checked={invertControls} />
				<Label for="tactical-invert">Invert controls</Label>
			</div>
		{/if}
	{/if}
</div>
