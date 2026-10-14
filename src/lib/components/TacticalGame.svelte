<script lang="ts">
	import { resolve } from '$app/paths';
	import { Game, type Board } from '$lib/gameLogic.svelte';
	import {
		makeTacticalBot,
		randomMinePlacement,
		DIFFICULTY_DELAYS,
		DIFFICULTY_MISCLICK,
		DIFFICULTIES,
		type Difficulty,
		type OpponentDriver
	} from '$lib/opponent.svelte';
	import Board_ from './Board.svelte';
	import TacticalAttackEffects from './TacticalAttackEffects.svelte';
	import ModeInfo from './ModeInfo.svelte';
	import SweeperLoader from './SweeperLoader.svelte';
	import Time from './Time.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import Switch from '$lib/components/ui/switch/switch.svelte';
	import type { RealtimeChannel } from '@supabase/supabase-js';
	import { makeNetworkDriver, broadcastMove, type Coord, isNetMsg } from '$lib/net/networkDriver';
	import { findGuesslessSeed, findSafeOpeningSeed } from '$lib/solver';
	import { advanceIncomingCharge, attackThresholdFor, receiveMine } from '$lib/tactical';

	interface NetProps {
		channel: RealtimeChannel;
		memberId: string;
		// Local slot index (0 = HUMAN) → the peer memberId driving it, or null for
		// a bot. Slot 0 is always us. Built by the page from the match roster.
		peerForSlot: Array<string | null> | null;
	}

	interface Props {
		players?: number;
		rows?: number;
		cols?: number;
		// Mines each player places onto their opponents.
		budget?: number;
		net?: NetProps;
	}

	// Config is fixed for the match; slot 0 is always the local player.
	let { players = 16, rows = 9, cols = 9, budget = 10, net }: Props = $props();

	type Phase = 'placing' | 'sweeping' | 'done';
	let phase = $state<Phase>('placing');
	let opponentLeft = $state(false);
	// Bot speed tier, chosen before the match in the placing phase.
	let difficulty = $state<Difficulty>('medium');

	// Player 0 is the human; 1..N-1 are opponents (bots or, online, peers).
	// svelte-ignore state_referenced_locally
	const ids = Array.from({ length: players }, (_, i) => i);
	const HUMAN = 0;

	// Opponents split into two flanks for the tetr.io-style sweep layout.
	const opponentIds = ids.filter((id) => id !== HUMAN);
	const half = Math.ceil(opponentIds.length / 2);
	const leftFlank = opponentIds.slice(0, half);
	const rightFlank = opponentIds.slice(half);

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
	// Hits from every attacker combine on the target. Once a target accumulates a
	// quarter of the starting player pool in hits, one mine is added to its board.
	// svelte-ignore state_referenced_locally
	const attackThreshold = attackThresholdFor(players);
	let incomingCharge = $state<number[]>(ids.map(() => 0));
	let bots: OpponentDriver[] = [];
	// Attack deduplication is internal state, never rendered.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const attackedCells = new Map<number, Set<string>>();
	let attackNotice = $state('');
	let sentAttacks = $state(0);
	let receivedMines = $state(0);
	let arenaElement = $state<HTMLDivElement>();
	let attackEffects: { launch: (from: Element | null, to: Element | null) => void } | undefined;

	function attackTarget(id: number): Element | null {
		return arenaElement?.querySelector(`[data-attack-target="${id}"]`) ?? null;
	}

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
	let aliveCount = $derived(alive.filter(Boolean).length);

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
			if (placer === HUMAN || net?.peerForSlot?.[placer]) continue;
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

	// Online: which human peers have sent their placement yet (memberId set).
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const placementsReceived = new Set<string>();
	let humanPeers: string[] = [];
	let myReady = false;
	// Board layouts peers broadcast before we'd built our boards (a peer who
	// builds first sends its `newboard` while we may still be waiting on a third
	// player's placement). Applied at build time; after build the network driver
	// handles `newboard` directly. Never rendered, so a plain Map is correct.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	const pendingLayouts = new Map<string, Coord[]>();

	// Where I dropped mines on HUMAN PEERS, keyed by their memberId. Slot indices
	// are local to each client, so only memberIds travel on the wire. Mines I
	// placed on bot slots stay local — bots are per-client simulations.
	function myPlacementByMember(): Record<string, Coord[]> {
		const out: Record<string, Coord[]> = {};
		for (const [target, coords] of placements) {
			const peer = net?.peerForSlot?.[target];
			if (peer && coords.length) out[peer] = coords.map(([r, c]) => [r, c]);
		}
		return out;
	}

	function minesOf(game: Game): Coord[] {
		const mines: Coord[] = [];
		for (let r = 0; r < rows; r++)
			for (let c = 0; c < cols; c++) if (game.board[r][c].isMine) mines.push([r, c]);
		return mines;
	}

	function onReady() {
		if (!net) {
			startSweep();
			return;
		}
		// Online: broadcast my placement, then wait for every human peer's before
		// building boards (bots' placement is generated locally at build time).
		humanPeers = (net.peerForSlot ?? []).filter((p): p is string => !!p);
		myReady = true;
		broadcastMove(net.channel, {
			kind: 'placement',
			from: net.memberId,
			byTarget: myPlacementByMember()
		});
		phase = 'sweeping'; // shows a "waiting" state until placements arrive
		maybeStartSweep();
	}

	function maybeStartSweep() {
		// Don't build until I've readied up myself — a peer's placement can arrive
		// while I'm still placing mines.
		if (!net || !myReady || games.length) return;
		if (humanPeers.some((p) => !placementsReceived.has(p))) return; // still waiting
		buildBoards();
	}

	function buildBoards() {
		botsPlace(); // fills bot slots' placements (humans' arrived over the network)
		games = ids.map((id) => Game.fromMines(rows, cols, placements.get(id) ?? []));
		boards = games.map((g) => g.board);
		alive = ids.map(() => true);
		cleared = ids.map(() => 0);
		incomingCharge = ids.map(() => 0);
		if (net) {
			// My real board includes mines my local bots dropped on me, which peers
			// can't derive — broadcast the authoritative layout so their mirror of me
			// is exact. Likewise apply any layouts peers already sent.
			broadcastMove(net.channel, {
				kind: 'newboard',
				from: net.memberId,
				mines: minesOf(games[HUMAN])
			});
			net.peerForSlot?.forEach((peer, id) => {
				const mines = peer ? pendingLayouts.get(peer) : undefined;
				if (mines) {
					games[id] = Game.fromMines(rows, cols, mines);
					boards[id] = games[id].board;
				}
			});
		}
		startTime = Date.now();
		timer = setInterval(() => (elapsed = Date.now() - startTime), 100);
		bots = ids.map((id) => (id === HUMAN ? { start() {}, stop() {} } : makeBot(id)));
		bots.forEach((b) => b.start());
	}

	function startSweep() {
		phase = 'sweeping';
		buildBoards();
	}

	function makeBot(id: number): OpponentDriver {
		const peer = net?.peerForSlot?.[id] ?? null;
		if (peer) {
			// A human peer drives this slot over the network.
			return makeNetworkDriver(games[id], net!.channel, peer, {
				onChange: () => {
					boards[id] = games[id].board;
					boards = [...boards];
					checkPlayer(id);
				},
				onReveal: (r, c) => games[id].revealCell(r, c),
				onFlag: (r, c) => games[id].flagCell(r, c),
				onDead: () => {
					if (!alive[id]) return;
					alive[id] = false;
					alive = [...alive];
					evaluate();
				},
				onMine: (r, c) => {
					games[id].injectMineAt(r, c);
				},
				onNewBoard: (mines) => {
					games[id] = Game.fromMines(rows, cols, mines);
					boards[id] = games[id].board;
					boards = [...boards];
				}
			});
		}
		return makeTacticalBot(games[id], {
			...botSpeed(id),
			guessless: true,
			isComplete: () => games[id].checkTacticalClear(),
			misclickChance: DIFFICULTY_MISCLICK[difficulty],
			onChange: () => {
				boards[id] = games[id].board;
				boards = [...boards];
				checkPlayer(id);
			},
			// Every correct flag targets all other players with one shared hit.
			onCorrectFlag: () => sendHitToOpponents(id)
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
		const networkDriven = !!net?.peerForSlot?.[id];
		if (games[id].checkLose()) {
			// A network peer announces its own death via `dead`; don't double-count.
			if (!networkDriven) {
				alive[id] = false;
				alive = [...alive];
				bots[id]?.stop();
			}
		} else if (games[id].checkTacticalClear()) {
			cleared[id]++;
			cleared = [...cleared];
			// A network peer rebuilds its own board and broadcasts `newboard`; we
			// only regenerate boards we own (ours + local bots').
			if (!networkDriven) regenerateBoard(id);
		}
		evaluate();
	}

	// Replace a player's cleared board with a new, denser one.
	function regenerateBoard(id: number) {
		const fresh = new Game(rows, cols, Math.min(rows * cols - 1, mineCountFor(cleared[id])));
		attackedCells.delete(id);
		games[id] = fresh;
		boards[id] = fresh.board;
		boards = [...boards];
		// Online: only the board's owner regenerates and broadcasts the new mines;
		// peers rebuild from the `newboard` message via the network driver. So a
		// network-driven slot never regenerates locally.
		if (id === HUMAN && net) {
			broadcastMove(net.channel, { kind: 'newboard', from: net.memberId, mines: minesOf(fresh) });
		}
		// Local bots hold a reference to the old board; re-point them at the new one.
		if (id !== HUMAN && !net?.peerForSlot?.[id]) {
			bots[id]?.stop();
			bots[id] = makeBot(id);
			bots[id].start();
		}
	}

	// Eliminate a player whose board has no room left for an attack mine —
	// saturation IS the loss condition in guessless Tactical: fall behind and
	// you get buried.
	function bury(id: number) {
		if (!alive[id]) return;
		alive[id] = false;
		alive = [...alive];
		bots[id]?.stop();
	}

	// One correct flag adds one hit to every living opponent. Local targets are
	// updated here; online human targets receive the hit over the network and own
	// their counter, mine placement, and resulting board broadcast.
	function sendHitToOpponents(fromId: number, source: Element | null = attackTarget(fromId)) {
		if (fromId === HUMAN) sentAttacks++;
		const remoteTargets: string[] = [];
		for (const id of ids) {
			if (id === fromId || !alive[id]) continue;
			const peer = net?.peerForSlot?.[id] ?? null;
			// Bots are simulated per client, so their hits never directly mutate a
			// remote human's mirror. That human owns the bots attacking their board.
			if (net && fromId !== HUMAN && peer) continue;
			if (fromId === HUMAN) attackEffects?.launch(source, attackTarget(id));
			if (peer) remoteTargets.push(peer);
			else receiveAttackHit(id, fromId);
		}
		if (net && remoteTargets.length) {
			broadcastMove(net.channel, { kind: 'attack', from: net.memberId, targets: remoteTargets });
		}
	}

	function receiveAttackHit(id: number, fromId: number) {
		if (phase !== 'sweeping' || !alive[id] || !games[id]) return;
		if (id === HUMAN) attackEffects?.launch(attackTarget(fromId), attackTarget(HUMAN));
		const next = advanceIncomingCharge(incomingCharge[id], attackThreshold);
		incomingCharge[id] = next.charge;
		incomingCharge = [...incomingCharge];
		if (!next.launch) return;

		addAttackMine(id);
	}

	// A completed charge adds a mine on a covered cell with no revealed neighbor
	// so no visible number changes.
	// Only a fully mined remainder is lethal when an attack cannot land.
	function addAttackMine(id: number) {
		const attack = receiveMine(games[id]);
		if (attack.kind === 'mine') {
			boards[id] = games[id].board;
			if (id === HUMAN) {
				receivedMines++;
				attackNotice = 'Incoming mine — total mine count increased.';
			}
			if (net && id === HUMAN) {
				broadcastMove(net.channel, {
					kind: 'mine',
					from: net.memberId,
					r: attack.cell[0],
					c: attack.cell[1]
				});
			}
		} else if (attack.kind === 'buried') {
			bury(id);
			if (id === HUMAN) attackNotice = 'Buried — every covered square was already a mine.';
			if (net && id === HUMAN) broadcastMove(net.channel, { kind: 'dead', from: net.memberId });
		} else if (id === HUMAN) {
			attackNotice = 'Attack blocked — your revealed numbers are protected.';
		}
		boards = [...boards];
		evaluate();
	}

	// Only the targeted player's client advances an online incoming counter.
	function applyRemoteAttack(targets: string[], fromId: number) {
		if (net && targets.includes(net.memberId)) receiveAttackHit(HUMAN, fromId);
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
		if (phase !== 'sweeping' || !alive[HUMAN] || !games.length) return;
		if (games[HUMAN].isFirstClick) {
			// Guessless: re-deal this board on the first click so it's fully
			// solvable by logic. The mines opponents placed/injected so far set the
			// COUNT (that's the attack); the layout is the dealer's. Online, the
			// authoritative layout is broadcast before the reveal that follows it.
			games[HUMAN].isFirstClick = false;
			// Past guessless density (a board swollen with attack mines), degrade to
			// a safe opening — the lethality of a saturating board is the point.
			const seed =
				findGuesslessSeed(rows, cols, games[HUMAN].mines, row, col) ??
				findSafeOpeningSeed(rows, cols, games[HUMAN].mines, row, col);
			if (seed !== null) {
				games[HUMAN].board = games[HUMAN].generateBoard(rows, cols, games[HUMAN].mines, seed);
				if (net) {
					broadcastMove(net.channel, {
						kind: 'newboard',
						from: net.memberId,
						mines: minesOf(games[HUMAN])
					});
				}
			}
		}
		boards[HUMAN] = games[HUMAN].revealCell(row, col);
		boards = [...boards];
		if (net) broadcastMove(net.channel, { kind: 'reveal', from: net.memberId, r: row, c: col });
		checkPlayer(HUMAN);
		if (net && games[HUMAN].checkLose()) {
			broadcastMove(net.channel, { kind: 'dead', from: net.memberId });
		}
	}
	function flag(row: number, col: number) {
		if (phase !== 'sweeping' || !alive[HUMAN] || !games.length) return;
		// Opening re-deals the board; a saturated board has no safe opening, so
		// allow its owner to escape by flagging the entire remainder.
		if (games[HUMAN].isFirstClick && !games[HUMAN].isSaturated()) return;
		const cell = games[HUMAN].board[row][col];
		const wasFlagged = cell.isFlagged;
		boards[HUMAN] = games[HUMAN].flagCell(row, col);
		boards = [...boards];
		if (net) broadcastMove(net.channel, { kind: 'flag', from: net.memberId, r: row, c: col });
		// A correct flag targets every opponent with one hit. Hits from different
		// attackers share each target's quarter-pool charge.
		const key = `${row},${col}`;
		// eslint-disable-next-line svelte/prefer-svelte-reactivity
		const sent = attackedCells.get(HUMAN) ?? new Set<string>();
		if (!wasFlagged && cell.isFlagged && cell.isMine && !sent.has(key)) {
			sent.add(key);
			attackedCells.set(HUMAN, sent);
			sendHitToOpponents(
				HUMAN,
				arenaElement?.querySelector(
					`[data-player-panel="0"] button[data-row="${row}"][data-col="${col}"]`
				) ?? attackTarget(HUMAN)
			);
		}
		checkPlayer(HUMAN);
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

	// Map a peer memberId back to its local slot index.
	function slotForPeer(peer: string): number {
		return net?.peerForSlot?.findIndex((p) => p === peer) ?? -1;
	}

	$effect(() => {
		if (net) {
			net.channel.on('broadcast', { event: 'move' }, ({ payload }) => {
				if (!isNetMsg(payload) || phase === 'done' || slotForPeer(payload.from) <= 0) return;
				if (payload.kind === 'placement' && placementsReceived.has(payload.from)) return;
				if (payload.kind === 'placement') {
					// Consume only the mines addressed to ME — entries for other peers
					// are theirs to apply; their boards reach us via their `newboard`
					// layout broadcast.
					const mine = payload.byTarget[net.memberId];
					if (Array.isArray(mine)) {
						// Two peers can drop on the same cell; dedupe so the board's
						// mine/flag counters stay honest.
						const list = placements.get(HUMAN)!;
						// Transient dedup lookup; reactivity comes from `placements`.
						// eslint-disable-next-line svelte/prefer-svelte-reactivity
						const have = new Set(list.map(([r, c]) => `${r},${c}`));
						for (const [r, c] of mine.slice(0, budget)) {
							if (
								!Number.isInteger(r) ||
								!Number.isInteger(c) ||
								r < 0 ||
								c < 0 ||
								r >= rows ||
								c >= cols
							)
								continue;
							if (!have.has(`${r},${c}`)) {
								have.add(`${r},${c}`);
								list.push([r, c]);
							}
						}
						placements = new Map(placements);
					}
					placementsReceived.add(payload.from);
					maybeStartSweep();
				} else if (payload.kind === 'attack') {
					applyRemoteAttack(payload.targets, slotForPeer(payload.from));
				} else if (payload.kind === 'newboard' && !games.length) {
					// A peer built (or regenerated) before we finished building — hold
					// the layout and apply it at our own build time.
					pendingLayouts.set(payload.from, payload.mines);
				}
			});
			net.channel.on('presence', { event: 'leave' }, ({ leftPresences }) => {
				const left = leftPresences as Array<{ memberId?: string }>;
				for (const p of left) {
					const slot = p.memberId ? slotForPeer(p.memberId) : -1;
					if (slot > 0 && !games.length) {
						opponentLeft = true;
						phase = 'done';
					}
					if (slot >= 0 && alive[slot]) {
						alive[slot] = false;
						alive = [...alive];
						bots[slot]?.stop();
					}
				}
				if (games.length) evaluate();
			});
		}
		return () => {
			clearInterval(timer);
			bots.forEach((b) => b.stop());
		};
	});
</script>

<TacticalAttackEffects bind:this={attackEffects} />
<div bind:this={arenaElement} class="flex flex-col items-center gap-4 p-3">
	<div class="flex items-center gap-2">
		<span class="h-3 w-3 rounded-full bg-red-600" aria-hidden="true"></span>
		<h2 class="text-lg font-semibold">Tactical{players === 2 ? ' · 1v1' : ''}</h2>
		<ModeInfo title="Tactical">
			<p>
				{players === 2 ? 'A private 1v1 duel' : 'A battle royale'} where you place mines on your opponents'
				boards, then everyone sweeps.
			</p>
			<p>
				<strong>Placing:</strong> click opponent boards to drop your mines on them. Your own board gets
				mined by everyone else.
			</p>
			<p>
				<strong>Sweeping:</strong> once everyone's ready, clear the board your opponents built for you.
				Left click reveals, right click flags. Hit a mine and you're eliminated.
			</p>
			<p>
				<strong>Attack:</strong> each correct flag targets every opponent with one hit. Hits from
				any players combine; every {attackThreshold} hits on your board become one hidden mine. Reveal
				every safe square and flag every mine on your board and you get a fresh, harder one.
			</p>
			<p>
				<strong>Stay sharp:</strong> attacks never change revealed numbers, but hidden mines can force
				a guess. If every covered square is already a mine, the next attack buries you. Use the total
				mine count to recognize this and flag every remaining square to get a fresh board.
			</p>
			<p>
				Last sweeper alive wins. {#if net}You're in a live {players}-player match.{:else}Opponents
					are bots.{/if}
			</p>
		</ModeInfo>
	</div>
	{#if opponentLeft}
		<h2 class="text-3xl font-black tracking-tight">Opponent left the match.</h2>
		<a
			href={resolve('/tactical')}
			data-sveltekit-reload
			class="rounded-md bg-red-600 px-6 py-3 font-bold text-white">Find another match</a
		>
	{:else if phase === 'placing'}
		<h2 class="text-4xl font-black tracking-tight">Place your mines</h2>
		{#if !net}
			<div class="flex items-center gap-2 text-sm">
				<Label for="tactical-difficulty">Bot difficulty</Label>
				<select
					id="tactical-difficulty"
					bind:value={difficulty}
					class="rounded-md border bg-background px-2 py-1 capitalize focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
				>
					{#each DIFFICULTIES as d (d)}
						<option value={d} class="capitalize">{d}</option>
					{/each}
				</select>
			</div>
		{/if}
		<p class="text-sm text-muted-foreground">
			Click opponent boards to drop mines on them. Mines left:
			<span class="text-base font-black text-foreground tabular-nums">{minesLeft}</span>
		</p>
		<div class="flex max-w-5xl flex-wrap items-start justify-center gap-x-6 gap-y-4">
			{#each ids.filter((id) => id !== HUMAN) as id (id)}
				<div class="flex flex-col items-center gap-1">
					<h3 class="font-mono text-xs font-semibold text-red-600 dark:text-red-400">
						P{id}{#if net?.peerForSlot?.[id]}<span title="live player"> ●</span>{/if}
					</h3>
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
			class="rounded-md bg-red-600 px-6 py-3 text-lg font-black text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-700 focus-visible:ring-4 focus-visible:ring-red-400 focus-visible:outline-none"
			onclick={onReady}
		>
			Ready — start sweeping
		</button>
	{:else if !games.length}
		<!-- Online: placed our mines, waiting for opponents to ready up. -->
		<div class="flex flex-col items-center gap-4 py-16">
			<SweeperLoader label="Waiting for opponents" />
			<p class="text-2xl font-black tracking-tight">Waiting for opponents…</p>
			<p class="text-sm text-muted-foreground italic">the sweep starts when everyone's ready</p>
		</div>
	{:else}
		<div class="flex items-center gap-5">
			<Time milliseconds={elapsed} />
			<p class="text-2xl font-black tracking-tight tabular-nums">
				<span class="text-red-600 dark:text-red-400">{aliveCount}</span><span
					class="text-muted-foreground">/{players}</span
				>
				<span class="text-base font-semibold text-muted-foreground">alive</span>
			</p>
		</div>
		{#if phase === 'done'}
			<h2 class="text-3xl font-black tracking-tight sm:text-4xl">{result}</h2>
		{:else}
			<p class="text-sm text-muted-foreground">
				{invertControls
					? 'Left-click flags, right-click reveals'
					: 'Left-click reveals, right-click flags'} — every correct flag targets each opponent; every
				{attackThreshold} combined hits become one mine. Last sweeper alive wins.
			</p>
		{/if}
		{#snippet miniBoard(id: number)}
			<div
				data-player-panel={id}
				class="relative flex flex-col items-center gap-0.5"
				class:opacity-40={!alive[id]}
				title="Opponent {id} — {clearedCount(boards[id])} cleared{alive[id] ? '' : ' (eliminated)'}"
			>
				<Board_
					board={boards[id]}
					interactive={false}
					cellSize={players === 2 ? 'h-7 w-7' : 'h-2 w-2 overflow-hidden text-[7px] leading-none'}
					unrevealedBg="bg-red-500/20"
					label="Opponent {id}'s board"
				/>
				<span
					data-attack-target={id}
					class="rounded-md px-2 py-1 font-mono text-[10px] leading-tight font-semibold {alive[id]
						? 'text-muted-foreground'
						: 'text-red-600 dark:text-red-400'}"
				>
					P{id}{#if net?.peerForSlot?.[id]}<span title="live player"> ●</span>{/if} · {alive[id]
						? clearedCount(boards[id])
						: 'KO'}
				</span>
				{#if !alive[id]}
					<span class="absolute inset-0 flex items-center justify-center text-lg">💀</span>
				{/if}
			</div>
		{/snippet}

		<!-- tetr.io-style arena: your board centred and large, the 15 opponents as
			tiny live boards down the left and right flanks. On small screens the
			flanks drop below your board instead of squeezing it. -->
		<div
			class="flex w-full flex-col items-center gap-6 md:flex-row md:items-start md:justify-center"
		>
			<div
				class="order-2 grid {players === 2
					? 'grid-cols-1'
					: 'grid-cols-4'} content-start gap-2 md:order-1"
			>
				{#each leftFlank as id (id)}
					{@render miniBoard(id)}
				{/each}
			</div>

			<div
				data-player-panel={HUMAN}
				class="order-1 flex shrink-0 flex-col items-center gap-1.5 md:order-2 md:px-4"
				class:opacity-50={!alive[HUMAN]}
			>
				<h3 class="text-lg font-black tracking-tight tabular-nums">
					You — {clearedCount(boards[HUMAN])}
					{#if cleared[HUMAN] > 0}
						<span class="text-xs font-normal text-muted-foreground"
							>({cleared[HUMAN]} boards cleared)</span
						>
					{/if}
				</h3>
				<div class="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
					<span
						data-attack-target={HUMAN}
						data-testid="mine-count"
						class="rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1 text-red-700 dark:text-red-300"
						>Mines: {games[HUMAN].mines}</span
					>
					<span>Flags left: {games[HUMAN].flags}</span>
					<span>Incoming</span>
					<div
						class="flex gap-1"
						aria-label="Incoming attack charge {incomingCharge[HUMAN]} of {attackThreshold}"
					>
						{#each [...Array(attackThreshold).keys()] as i (i)}
							<span
								class="h-2 w-5 rounded-full {i < incomingCharge[HUMAN] ? 'bg-red-600' : 'bg-muted'}"
								aria-hidden="true"
							></span>
						{/each}
					</div>
					<span class="tabular-nums">{incomingCharge[HUMAN]}/{attackThreshold}</span>
				</div>
				<Board_
					board={boards[HUMAN]}
					interactive={phase === 'sweeping' && alive[HUMAN]}
					{onCell}
					{onCellAlt}
					cellSize="h-7 w-7"
					label="Your board"
				/>
				<div class="flex gap-3 font-mono text-xs font-bold tabular-nums">
					<span class="rounded-md bg-red-600 px-2.5 py-1 text-white" data-testid="attack-sent"
						>↗ Sent {sentAttacks}</span
					>
					<span
						class="rounded-md border border-red-500/30 px-2.5 py-1 text-red-700 dark:text-red-300"
						data-testid="attack-received">↙ Received {receivedMines}</span
					>
				</div>
				<p role="status" class="text-sm text-muted-foreground">{attackNotice}</p>
				<span class="text-sm text-muted-foreground">{alive[HUMAN] ? 'alive' : 'eliminated'}</span>
			</div>

			<div class="order-3 grid grid-cols-4 content-start gap-2">
				{#each rightFlank as id (id)}
					{@render miniBoard(id)}
				{/each}
			</div>
		</div>
		{#if phase === 'sweeping'}
			<div class="flex items-center gap-2 text-sm">
				<Switch id="tactical-invert" bind:checked={invertControls} />
				<Label for="tactical-invert">Invert controls</Label>
			</div>
		{/if}
	{/if}
</div>
