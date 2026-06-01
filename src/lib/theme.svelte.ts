// Global UI settings: light/dark theme and a colorblind-safe number palette.
// Both persist to localStorage and are applied as classes on <html> so they
// work everywhere without prop drilling. Theme defaults to the OS preference.

import { browser } from '$app/environment';

type Theme = 'light' | 'dark';

function systemTheme(): Theme {
	if (!browser) return 'light';
	return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function stored<T extends string>(key: string, fallback: T): string {
	if (!browser) return fallback;
	return localStorage.getItem(key) ?? fallback;
}

class Settings {
	// `null` until the first apply() so SSR markup and the first client paint
	// agree; resolved to the system theme on mount.
	theme = $state<Theme>(stored('sweepr:theme', systemTheme()) === 'dark' ? 'dark' : 'light');
	colorblind = $state<boolean>(stored('sweepr:colorblind', 'off') === 'on');

	toggleTheme() {
		this.theme = this.theme === 'dark' ? 'light' : 'dark';
	}

	// Mirror state onto <html> and localStorage. Called from a root $effect so it
	// re-runs whenever either signal changes.
	apply() {
		if (!browser) return;
		const root = document.documentElement;
		root.classList.toggle('dark', this.theme === 'dark');
		root.classList.toggle('cb', this.colorblind);
		localStorage.setItem('sweepr:theme', this.theme);
		localStorage.setItem('sweepr:colorblind', this.colorblind ? 'on' : 'off');
	}
}

export const settings = new Settings();
