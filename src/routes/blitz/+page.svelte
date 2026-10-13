<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import BlitzGame from '$lib/components/BlitzGame.svelte';
	import SweeperLoader from '$lib/components/SweeperLoader.svelte';
	import { createMatchmaker } from '$lib/net/matchmaker.svelte';
	import type { MatchResult } from '$lib/net/matchmaker.svelte';

	// Server-rendered buttons wait for their handlers to load before accepting clicks.
	let ready = $state(false);
	onMount(() => {
		ready = true;
	});

	type View = 'menu' | 'searching' | 'online' | 'bots';
	let view = $state<View>('menu');
	let match = $state<MatchResult | null>(null);
	let matchmaker = $state<ReturnType<typeof createMatchmaker> | undefined>(undefined);

	const supabase = page.data.supabase;

	function findMatch() {
		view = 'searching';
		matchmaker = createMatchmaker(supabase, 'blitz');
	}

	function cancelSearch() {
		matchmaker?.cancel();
		matchmaker = undefined;
		view = 'menu';
	}

	// React to matchmaker status changes.
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

	// Opponent is the other member in a 2-player Blitz match.
	let oppMemberId = $derived(match ? match.members.find((m) => m !== match!.yourMemberId)! : '');
</script>

{#if view === 'menu'}
	<main class="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-20">
		<header class="text-center">
			<h1 class="text-7xl font-black tracking-tight text-yellow-500 sm:text-8xl">Blitz</h1>
			<p class="mt-2 text-xl italic sm:text-2xl">Two boards. Three minutes. Out-sweep them.</p>
		</header>
		<div class="flex w-full max-w-md flex-col gap-4">
			<button
				disabled={!ready}
				onclick={findMatch}
				class="block origin-left rounded-lg bg-yellow-500 px-6 py-5 text-left text-white shadow-lg transition-transform duration-100 hover:scale-105 hover:bg-yellow-600 focus-visible:scale-105 focus-visible:ring-4 focus-visible:ring-yellow-300 focus-visible:outline-none"
			>
				<span class="block text-3xl font-black sm:text-4xl">Find match</span>
				<span class="mt-1 block text-sm italic opacity-90">1v1 against a live sweeper</span>
			</button>
			<button
				disabled={!ready}
				onclick={() => (view = 'bots')}
				class="rounded-lg border px-6 py-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
			>
				<span class="block text-lg font-bold">Play vs bot</span>
				<span class="block text-sm text-muted-foreground italic"
					>offline practice — starts instantly</span
				>
			</button>
		</div>
	</main>
{:else if view === 'searching'}
	<main class="flex min-h-screen flex-col items-center justify-center gap-6 px-6">
		<SweeperLoader label="Searching for an opponent" />
		<div class="text-center">
			<p class="text-2xl font-black tracking-tight">Scanning for sweepers…</p>
			<p class="mt-1 text-sm text-muted-foreground italic">
				no one around? you'll get a bot in ten seconds
			</p>
		</div>
		<button
			disabled={!ready}
			onclick={cancelSearch}
			class="rounded-md border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			Cancel
		</button>
	</main>
{:else if view === 'online' && match}
	<BlitzGame
		net={{
			channel: match.channel,
			memberId: match.yourMemberId,
			oppMemberId,
			yourSeed: match.seeds[match.you],
			oppSeed: match.seeds[match.you === 0 ? 1 : 0]
		}}
	/>
{:else}
	<BlitzGame />
{/if}
