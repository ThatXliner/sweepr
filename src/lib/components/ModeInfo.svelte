<script lang="ts">
	import { Popover } from 'bits-ui';
	import type { Snippet } from 'svelte';

	interface Props {
		// Mode name shown as the popover heading.
		title: string;
		// The explanation body for this mode.
		children: Snippet;
	}

	let { title, children }: Props = $props();
</script>

<Popover.Root>
	<Popover.Trigger
		aria-label="How {title} works"
		title="How {title} works"
		class="inline-flex h-7 w-7 items-center justify-center rounded-full border text-sm font-bold text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
	>
		?
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			sideOffset={8}
			class="z-50 w-80 max-w-[90vw] rounded-lg border bg-popover p-4 text-sm text-popover-foreground shadow-lg"
		>
			<Popover.Arrow class="text-border" />
			<h3 class="mb-2 text-base font-bold text-foreground">{title}</h3>
			<div class="space-y-2 leading-relaxed">
				{@render children()}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
