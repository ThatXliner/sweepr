<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Game from '$lib/components/Game.svelte';
	import InfiniteGame from '$lib/components/InfiniteGame.svelte';
	import ModeInfo from '$lib/components/ModeInfo.svelte';
	// import { Label } from '$lib/components/ui/label/index.js';
</script>

<div class="w-full p-3">
	<div class="mb-2 flex items-center justify-between gap-2">
		<h2 class="text-lg font-semibold">Classic</h2>
		<ModeInfo title="Classic">
			<p>The original minesweeper. Reveal every safe tile without detonating a mine.</p>
			<p>
				Left click reveals a tile, right click flags a suspected mine. Numbers count the mines
				touching that tile. Clicking a revealed number with the right number of flags around it
				chords (auto-reveals the rest).
			</p>
			<p>
				<strong>Easy / Medium / Hard</strong> change the board size and mine count.
				<strong>Infinite</strong> scrolls endlessly — keep clearing rows before they scroll off the top.
			</p>
		</ModeInfo>
	</div>
	<Tabs.Root value="easy" class="w-full">
		<Tabs.List class="grid w-full grid-cols-4">
			<Tabs.Trigger value="easy">Easy</Tabs.Trigger>
			<Tabs.Trigger value="medium">Medium</Tabs.Trigger>
			<Tabs.Trigger value="hard">Hard</Tabs.Trigger>
			<Tabs.Trigger value="infinite">Infinite</Tabs.Trigger>
		</Tabs.List>
		<Tabs.Content value="easy">
			<Game rows={9} cols={9} mines={10} />
		</Tabs.Content>
		<Tabs.Content value="medium">
			<Game rows={16} cols={16} mines={40} />
		</Tabs.Content>
		<Tabs.Content value="hard">
			<Game rows={16} cols={30} mines={99} />
		</Tabs.Content>
		<Tabs.Content value="infinite">
			<InfiniteGame />
		</Tabs.Content>
	</Tabs.Root>
</div>
