<script lang="ts">
	import { resolve } from '$app/paths';

	// Mode identity: each mode owns one saturated color, used as the consistent
	// signal everywhere it's referenced. `infinite` lives under Classic so it's
	// surfaced as a secondary link rather than a top-level mode button.
	const modes = [
		{
			href: '/classic',
			name: 'Classic',
			tagline: 'The original solo game from the 90s!',
			cls: 'bg-blue-600 hover:bg-blue-700 focus-visible:ring-blue-400'
		},
		{
			href: '/tactical',
			name: 'Tactical',
			tagline: 'An online battle royale where you place mines on their board!',
			cls: 'bg-red-600 hover:bg-red-700 focus-visible:ring-red-400'
		},
		{
			href: '/blitz',
			name: 'Blitz',
			tagline: 'The 1v1 stamina marathon to clear more tiles than your opponent',
			cls: 'bg-yellow-500 hover:bg-yellow-600 focus-visible:ring-yellow-300'
		}
	] as const;
</script>

<main class="min-h-screen px-6 py-16 sm:px-12">
	<header class="mx-auto max-w-5xl text-center">
		<h1 class="font-mono text-7xl font-black tracking-tight sm:text-9xl">sweepr</h1>
		<p class="mt-2 text-2xl italic sm:text-3xl">This is minesweeper, reimagined</p>
		<p class="mt-4 text-muted-foreground">Welcome to sweepr! Thank you for playing my game.</p>
	</header>

	<nav aria-label="Game modes" class="mx-auto mt-16 flex max-w-3xl flex-col gap-8">
		{#each modes as mode (mode.href)}
			<a
				href={resolve(mode.href)}
				class="group block origin-left rounded-lg px-6 py-4 text-white shadow-lg transition-transform duration-100 hover:scale-105 focus-visible:scale-105 focus-visible:ring-4 focus-visible:outline-none {mode.cls}"
			>
				<span class="block text-5xl font-black sm:text-7xl">{mode.name}</span>
				<span class="mt-1 block text-base italic opacity-90 sm:text-lg">{mode.tagline}</span>
			</a>
		{/each}
	</nav>

	<p class="mx-auto mt-10 max-w-3xl text-center text-sm text-muted-foreground">
		Looking for endless play? <a
			href={resolve('/classic')}
			class="font-semibold text-foreground underline underline-offset-4 hover:text-blue-600"
			>Infinite mode</a
		>
		lives inside Classic.
	</p>
</main>

<!--
Minesweeper divisions:
- Sandbag
- Stick
- Robot
- Dog

Or what about

- Firecracker
- Dynamite
- Grenade
- C4
- Landmine
- TNT
- Nuke
-->
