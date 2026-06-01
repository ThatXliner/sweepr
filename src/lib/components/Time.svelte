<script lang="ts">
	import * as Card from '$lib/components/ui/card';

	interface Props {
		milliseconds?: number;
	}

	let { milliseconds = 0 }: Props = $props();

	let seconds = $derived(Math.floor(milliseconds / 1000) % 60);
	let minutes = $derived(Math.floor(milliseconds / 1000 / 60));

	function formatTime(value: number) {
		return value.toString().padStart(2, '0');
	}
</script>

<Card.Root>
	<!-- <Card.Header>
	  <Card.Title>Card Title</Card.Title>
	  <Card.Description>Card Description</Card.Description>
	</Card.Header> -->
	<Card.Content>
		<div>{formatTime(minutes)}:{formatTime(seconds)}:{formatTime(milliseconds)}</div>
	</Card.Content>
	<!-- <Card.Footer>
	  <p>If you win now, you will have a time that's top #99999 in the world</p>
	</Card.Footer> -->
</Card.Root>
