<script lang="ts">
	import { settings } from '$lib/theme.svelte';

	// Apply theme/colorblind classes to <html> and persist them. Lives here so a
	// single mounted toggle keeps the document in sync; re-runs on every change.
	$effect(() => {
		// Touch both signals so the effect re-runs when either changes.
		void settings.theme;
		void settings.colorblind;
		settings.apply();
	});
</script>

<div class="flex items-center gap-1">
	<button
		type="button"
		onclick={() => settings.toggleTheme()}
		aria-label="Toggle {settings.theme === 'dark' ? 'light' : 'dark'} mode"
		title="Switch to {settings.theme === 'dark' ? 'light' : 'dark'} mode"
		class="inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
	>
		{settings.theme === 'dark' ? '☀️' : '🌙'}
	</button>
	<button
		type="button"
		onclick={() => (settings.colorblind = !settings.colorblind)}
		aria-pressed={settings.colorblind}
		aria-label="Toggle colorblind-safe number colors"
		title="Colorblind-safe colors: {settings.colorblind ? 'on' : 'off'}"
		class="inline-flex h-9 items-center justify-center gap-1 rounded-md border bg-card px-2 text-xs font-medium text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none {settings.colorblind
			? 'ring-2 ring-ring'
			: ''}"
	>
		CB {settings.colorblind ? 'on' : 'off'}
	</button>
</div>
