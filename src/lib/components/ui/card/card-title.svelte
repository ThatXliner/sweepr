<script lang="ts">
	import type { HTMLAttributes } from 'svelte/elements';
	import type { Snippet } from 'svelte';
	import type { HeadingLevel } from './index.js';
	import { cn } from '$lib/utils.js';

	let {
		class: className = undefined,
		tag = 'h3',
		children,
		...rest
	}: HTMLAttributes<HTMLHeadingElement> & { tag?: HeadingLevel; children?: Snippet } = $props();
</script>

<svelte:element
	this={tag}
	class={cn('text-lg font-semibold leading-none tracking-tight', className)}
	{...rest}
>
	{@render children?.()}
</svelte:element>
