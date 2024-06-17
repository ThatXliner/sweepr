<script lang="ts">
	import * as Card from '$lib/components/ui/card';

	export let milliseconds = 0;

	$: seconds = Math.floor(milliseconds / 1000) % 60;
	$: minutes = Math.floor(milliseconds / 1000 / 60);

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
