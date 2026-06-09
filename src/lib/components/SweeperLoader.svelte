<script lang="ts">
	// A tiny self-sweeping board, used as the matchmaking spinner: cells dig
	// themselves in a diagonal wave and cover back up. Reduced-motion users get a
	// static board (the global app.css rule zeroes animation durations).
	interface Props {
		label?: string;
	}

	let { label = 'Searching' }: Props = $props();

	// Per-cell delay = its diagonal (row + col), so the reveal sweeps corner to
	// corner like a flood fill.
	const cells = Array.from({ length: 9 }, (_, i) => (Math.floor(i / 3) + (i % 3)) * 0.14);
</script>

<div class="grid grid-cols-3" role="status" aria-label={label}>
	{#each cells as delay, i (i)}
		<div
			class="sweep-tile -mr-px -mb-px h-6 w-6 border border-cell-grid bg-cell-covered"
			style="animation-delay: {delay}s"
		></div>
	{/each}
</div>

<style>
	.sweep-tile {
		animation: sweep 1.8s ease-in-out infinite;
	}
	@keyframes sweep {
		0%,
		15% {
			background-color: hsl(var(--cell-covered));
		}
		35%,
		55% {
			background-color: hsl(var(--cell-revealed));
		}
		80%,
		100% {
			background-color: hsl(var(--cell-covered));
		}
	}
</style>
