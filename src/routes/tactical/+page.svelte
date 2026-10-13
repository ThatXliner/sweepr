<script lang="ts">
	import { page } from '$app/state';
	import TacticalGame from '$lib/components/TacticalGame.svelte';
	import SweeperLoader from '$lib/components/SweeperLoader.svelte';
	import { createMatchmaker } from '$lib/net/matchmaker.svelte';
	import { makeRoomCode, normalizeRoomCode } from '$lib/net/matchmaker';
	import type { MatchResult } from '$lib/net/matchmaker.svelte';

	const PLAYERS = 16;
	let privateRoom = $state(false);
	let roomCode = $state('');
	let joinCode = $state('');
	let playerCount = $derived(privateRoom ? 2 : PLAYERS);

	type View = 'menu' | 'searching' | 'online' | 'bots';
	let view = $state<View>('menu');
	let errorMessage = $state('');
	let match = $state<MatchResult | null>(null);
	let matchmaker = $state<ReturnType<typeof createMatchmaker> | undefined>(undefined);

	const supabase = page.data.supabase;

	function findMatch() {
		errorMessage = '';
		privateRoom = false;
		view = 'searching';
		matchmaker = createMatchmaker(supabase, 'tactical');
	}

	function openRoom(host: boolean) {
		const code = host ? makeRoomCode() : normalizeRoomCode(joinCode);
		if (!code) {
			errorMessage = 'Enter an 8-character room code.';
			return;
		}
		errorMessage = '';
		privateRoom = true;
		roomCode = code;
		view = 'searching';
		matchmaker = createMatchmaker(supabase, 'tactical', { room: { code, host } });
	}

	function cancelSearch() {
		matchmaker?.cancel();
		matchmaker = undefined;
		view = 'menu';
	}

	$effect(() => {
		if (!matchmaker || view !== 'searching') return;
		const status = matchmaker.status;
		if (status === 'matched' && matchmaker.result) {
			match = matchmaker.result;
			view = 'online';
		} else if (status === 'fallback' || status === 'error') {
			errorMessage = matchmaker.errorMessage;
			matchmaker.cancel();
			matchmaker = undefined;
			view = 'menu';
		}
	});

	// Tear down the lobby/game channels when the player navigates away.
	$effect(() => {
		return () => {
			matchmaker?.cancel();
			if (match) supabase.removeChannel(match.channel);
		};
	});

	// Local slot 0 is us; other human slots precede any bot-filled seats.
	let peerForSlot = $derived.by(() => {
		if (!match) return null;
		const others = match.members.filter((mId) => mId !== match!.yourMemberId);
		const slots: Array<string | null> = Array(playerCount).fill(null);
		others.forEach((mId, i) => {
			if (i + 1 < playerCount) slots[i + 1] = mId;
		});
		return slots;
	});
</script>

{#if view === 'menu'}
	<main class="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-20">
		<header class="text-center">
			<h1 class="text-7xl font-black tracking-tight text-red-600 sm:text-8xl">Tactical</h1>
			<p class="mt-2 text-xl italic sm:text-2xl">Sixteen sweepers enter. One sweeps out.</p>
		</header>
		<div class="flex w-full max-w-md flex-col gap-4">
			{#if errorMessage}<p role="alert" class="text-sm text-red-600 dark:text-red-400">
					{errorMessage}
				</p>{/if}
			<button
				onclick={findMatch}
				class="block origin-left rounded-lg bg-red-600 px-6 py-5 text-left text-white shadow-lg transition-transform duration-100 hover:scale-105 hover:bg-red-700 focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-red-400 focus-visible:outline-none"
			>
				<span class="block text-3xl font-black sm:text-4xl">Find match</span>
				<span class="mt-1 block text-sm italic opacity-90"
					>16-player arena — bots fill the empty seats</span
				>
			</button>
			<button
				onclick={() => {
					privateRoom = false;
					view = 'bots';
				}}
				class="rounded-lg border px-6 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<span class="block text-lg font-bold">Play vs bots</span>
				<span class="block text-sm text-muted-foreground italic"
					>offline practice — starts instantly</span
				>
			</button>
			<div class="rounded-lg border p-4">
				<h2 class="mb-3 text-xl font-black text-red-600 dark:text-red-400">Private 1v1 duel</h2>
				<button
					onclick={() => openRoom(true)}
					class="w-full rounded-md bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-700 focus-visible:ring-2 focus-visible:ring-ring"
					>Create room</button
				>
				<form
					class="mt-4 flex flex-col gap-2"
					onsubmit={(event) => {
						event.preventDefault();
						openRoom(false);
					}}
				>
					<label for="room-code" class="text-sm font-semibold">Room code</label>
					<input
						id="room-code"
						bind:value={joinCode}
						maxlength="8"
						autocomplete="off"
						spellcheck="false"
						class="rounded-md border bg-background px-3 py-2 font-mono uppercase focus-visible:ring-2 focus-visible:ring-ring"
						placeholder="8-character code"
					/>
					<button
						type="submit"
						class="rounded-md border px-4 py-2 font-bold hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
						>Join room</button
					>
				</form>
			</div>
		</div>
	</main>
{:else if view === 'searching'}
	<main class="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
		<SweeperLoader label={privateRoom ? 'Waiting for your friend' : 'Searching for opponents'} />
		{#if privateRoom}
			<p class="text-sm text-muted-foreground">Share this code with your friend</p>
			<output
				aria-label="Private room code"
				class="select-all font-mono text-4xl font-black tracking-widest text-red-600 dark:text-red-400"
				>{roomCode}</output
			>
		{/if}
		<div class="text-center">
			<p class="text-2xl font-black tracking-tight">
				{privateRoom ? 'Waiting for your friend…' : 'Rallying the sweepers…'}
			</p>
			<p class="mt-1 text-sm text-muted-foreground italic">
				{privateRoom
					? 'the duel starts when your friend joins'
					: 'the arena opens as soon as enough show up'}
			</p>
		</div>
		<button
			onclick={cancelSearch}
			class="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			Cancel
		</button>
	</main>
{:else if view === 'online' && match}
	<TacticalGame
		players={playerCount}
		net={{ channel: match.channel, memberId: match.yourMemberId, peerForSlot }}
	/>
{:else}
	<TacticalGame players={PLAYERS} />
{/if}
