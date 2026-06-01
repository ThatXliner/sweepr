<script lang="ts">
	import '../app.css';
	import ThemeToggle from '$lib/components/ThemeToggle.svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	interface Props {
		children?: import('svelte').Snippet;
	}

	let { children }: Props = $props();

	// Hide the back-home link on the landing page itself — there's nowhere to go
	// back to from home.
	let atHome = $derived(page.url.pathname === resolve('/'));
</script>

{#if !atHome}
	<div class="fixed top-3 left-3 z-50">
		<a
			href={resolve('/')}
			class="inline-flex h-9 items-center gap-1.5 rounded-md border bg-card px-3 text-sm font-medium text-card-foreground shadow-sm transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
		>
			<span aria-hidden="true">←</span> sweepr
		</a>
	</div>
{/if}

<div class="fixed top-3 right-3 z-50">
	<ThemeToggle />
</div>

{@render children?.()}
