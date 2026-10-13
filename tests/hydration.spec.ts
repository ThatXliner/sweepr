import { expect, test } from '@playwright/test';

for (const path of ['/tactical', '/blitz']) {
	test(`${path}: matchmaking waits until its click handlers are ready`, async ({ page }) => {
		let release!: () => void;
		const bootstrap = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
			await bootstrap;
			await route.continue();
		});
		try {
			await page.goto(path, { waitUntil: 'commit' });
			await expect(page.getByRole('button', { name: /^Find match/ })).toBeDisabled();
		} finally {
			release();
		}
		await expect(page.getByRole('button', { name: /^Find match/ })).toBeEnabled();
	});
}
