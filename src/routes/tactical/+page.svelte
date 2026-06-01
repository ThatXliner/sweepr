<script lang="ts">
	import { page } from '$app/state';
	import TacticalGame from '$lib/components/TacticalGame.svelte';
	import { createMatchmaker } from '$lib/net/matchmaker.svelte';
	import type { MatchResult } from '$lib/net/matchmaker.svelte';

	const PLAYERS = 16;

	type View = 'menu' | 'searching' | 'online' | 'bots';
	let view = $state<View>('menu');
	let match = $state<MatchResult | null>(null);
	let matchmaker: ReturnType<typeof createMatchmaker> | undefined;

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
	<div class="flex h-[60vh] flex-col items-center justify-center gap-4">
		<h2 class="text-2xl font-bold">Tactical</h2>
		<p class="text-sm text-muted-foreground">16-player battle royale</p>
		<div class="flex gap-3">
			<button
				class="rounded bg-red-600 px-4 py-2 font-bold text-white transition-transform hover:scale-105 hover:bg-red-700"
				onclick={findMatch}
			>
				Find match
			</button>
			<button
				class="rounded border px-4 py-2 font-bold transition-transform hover:scale-105"
				onclick={() => (view = 'bots')}
			>
				Play vs bots
			</button>
		</div>
	</div>
{:else if view === 'searching'}
	<div class="flex h-[60vh] flex-col items-center justify-center gap-4">
		<p class="text-lg">Searching for opponents…</p>
		<button class="rounded border px-4 py-2" onclick={cancelSearch}>Cancel</button>
	</div>
{:else if view === 'online' && match}
	<TacticalGame
		players={PLAYERS}
		net={{ channel: match.channel, memberId: match.yourMemberId, peerForSlot }}
	/>
{:else}
	<TacticalGame players={PLAYERS} />
{/if}
