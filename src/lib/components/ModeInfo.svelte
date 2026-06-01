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
		class="inline-flex h-7 w-7 items-center justify-center rounded-full border border-gray-400 text-sm font-bold text-gray-600 transition-colors hover:bg-gray-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
	>
		?
	</Popover.Trigger>
	<Popover.Portal>
		<Popover.Content
			sideOffset={8}
			class="z-50 w-80 max-w-[90vw] rounded-lg border border-gray-200 bg-white p-4 text-sm text-gray-700 shadow-lg"
		>
			<Popover.Arrow class="text-gray-200" />
			<h3 class="mb-2 text-base font-bold text-gray-900">{title}</h3>
			<div class="space-y-2 leading-relaxed">
				{@render children()}
			</div>
		</Popover.Content>
	</Popover.Portal>
</Popover.Root>
