<script lang="ts">
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import Game from '$lib/components/Game.svelte';
	import InfiniteGame from '$lib/components/InfiniteGame.svelte';
	// import { Label } from '$lib/components/ui/label/index.js';
</script>

<Tabs.Root value="easy" class="w-full p-3">
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
