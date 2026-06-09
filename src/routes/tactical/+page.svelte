<script lang="ts">
	import { page } from '$app/state';
	import TacticalGame from '$lib/components/TacticalGame.svelte';
	import SweeperLoader from '$lib/components/SweeperLoader.svelte';
	import { createMatchmaker } from '$lib/net/matchmaker.svelte';
	import type { MatchResult } from '$lib/net/matchmaker.svelte';

	const PLAYERS = 16;

	type View = 'menu' | 'searching' | 'online' | 'bots';
	let view = $state<View>('menu');
	let match = $state<MatchResult | null>(null);
	let matchmaker = $state<ReturnType<typeof createMatchmaker> | undefined>(undefined);

	const supabase = page.data.supabase;

	function findMatch() {
		view = 'searching';
		matchmaker = createMatchmaker(supabase, 'tactical');
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
			matchmaker.cancel();
			matchmaker = undefined;
			view = 'bots';
		}
	});

	// Tear down the lobby/game channels when the player navigates away.
	$effect(() => {
		return () => {
			matchmaker?.cancel();
			if (match) supabase.removeChannel(match.channel);
		};
	});

	// Local slot 0 is always us; slots 1..15 are the other human members (in
	// roster order) then null (bot-filled).
	let peerForSlot = $derived.by(() => {
		if (!match) return null;
		const others = match.members.filter((mId) => mId !== match!.yourMemberId);
		const slots: Array<string | null> = Array(PLAYERS).fill(null);
		others.forEach((mId, i) => {
			if (i + 1 < PLAYERS) slots[i + 1] = mId;
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
			<button
				onclick={findMatch}
				class="block origin-left rounded-lg bg-red-600 px-6 py-5 text-left text-white shadow-lg transition-transform duration-100 hover:scale-105 hover:bg-red-700 focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-red-400 focus-visible:outline-none"
			>
				<span class="block text-3xl font-black sm:text-4xl">Find match</span>
				<span class="mt-1 block text-sm italic opacity-90"
					>16-player battle royale — bots fill the empty seats</span
				>
			</button>
			<button
				onclick={() => (view = 'bots')}
				class="rounded-lg border px-6 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<span class="block text-lg font-bold">Play vs bots</span>
				<span class="block text-sm text-muted-foreground italic"
					>offline practice — starts instantly</span
				>
			</button>
		</div>
	</main>
{:else if view === 'searching'}
	<main class="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
		<SweeperLoader label="Searching for opponents" />
		<div class="text-center">
			<p class="text-2xl font-black tracking-tight">Rallying the sweepers…</p>
			<p class="mt-1 text-sm text-muted-foreground italic">
				the arena opens as soon as enough show up
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
		players={PLAYERS}
		net={{ channel: match.channel, memberId: match.yourMemberId, peerForSlot }}
	/>
{:else}
	<TacticalGame players={PLAYERS} />
{/if}
