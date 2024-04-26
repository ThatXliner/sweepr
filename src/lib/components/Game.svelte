<script lang="ts">
	// null represents an unknown value
	type Tile = number | null;
	const { board, verifyCell } = $props<{
		board: Tile[][];
		verifyCell?: (row: number, column: number) => boolean;
	}>();
</script>

{#each board as row}
	<div class="flex">
		{#each row as cell}
			<button>{cell}</button>
		{/each}
	</div>
{/each}
