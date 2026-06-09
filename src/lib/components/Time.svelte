<script lang="ts">
	import * as Card from '$lib/components/ui/card';

	interface Props {
		milliseconds?: number;
	}

	let { milliseconds = 0 }: Props = $props();

	let seconds = $derived(Math.floor(milliseconds / 1000) % 60);
	let minutes = $derived(Math.floor(milliseconds / 1000 / 60));
	// Hundredths, not raw milliseconds — a readable mm:ss.cc race clock.
	let centis = $derived(Math.floor((milliseconds % 1000) / 10));

	function formatTime(value: number) {
		return value.toString().padStart(2, '0');
	}
</script>

<Card.Root>
	<Card.Content>
		<div class="font-mono text-lg font-bold tabular-nums">
			{formatTime(minutes)}:{formatTime(seconds)}<span class="text-sm text-muted-foreground"
				>.{formatTime(centis)}</span
			>
		</div>
	</Card.Content>
</Card.Root>
