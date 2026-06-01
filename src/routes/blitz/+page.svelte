<script lang="ts">
	import { page } from '$app/state';
	import BlitzGame from '$lib/components/BlitzGame.svelte';
	import { createMatchmaker } from '$lib/net/matchmaker.svelte';
	import type { MatchResult } from '$lib/net/matchmaker.svelte';

	type View = 'menu' | 'searching' | 'online' | 'bots';
	let view = $state<View>('menu');
	let match = $state<MatchResult | null>(null);
	let matchmaker: ReturnType<typeof createMatchmaker> | undefined;

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

	// Opponent is the other member in a 2-player Blitz match.
	let oppMemberId = $derived(match ? match.members.find((m) => m !== match!.yourMemberId)! : '');
</script>

{#if view === 'menu'}
	<div class="flex h-[60vh] flex-col items-center justify-center gap-4">
		<h2 class="text-2xl font-bold">Blitz</h2>
		<div class="flex gap-3">
			<button
				class="rounded bg-yellow-500 px-4 py-2 font-bold text-white transition-transform hover:scale-105 hover:bg-yellow-600"
				onclick={findMatch}
			>
				Find match
			</button>
			<button
				class="rounded border px-4 py-2 font-bold transition-transform hover:scale-105"
				onclick={() => (view = 'bots')}
			>
				Play vs bot
			</button>
		</div>
	</div>
{:else if view === 'searching'}
	<div class="flex h-[60vh] flex-col items-center justify-center gap-4">
		<p class="text-lg">Searching for an opponent…</p>
		<button class="rounded border px-4 py-2" onclick={cancelSearch}>Cancel</button>
	</div>
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
