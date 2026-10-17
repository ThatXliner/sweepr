import { expect, test } from '@playwright/test';

for (const path of ['/tactical', '/blitz', '/classic']) {
	test(`${path}: controls wait until their click handlers are ready`, async ({ page }) => {
		let release!: () => void;
		const bootstrap = new Promise<void>((resolve) => (release = resolve));
		await page.route('**/_app/immutable/entry/start.*.js', async (route) => {
			await bootstrap;
			await route.continue();
		});
		try {
			await page.goto(path, { waitUntil: 'commit' });
			await expect(
				path === '/classic'
					? page.getByLabel('Guess-less mode')
					: page.getByRole('button', { name: /^Find match/ })
			).toBeDisabled();
		} finally {
			release();
		}
		await expect(
			path === '/classic'
				? page.getByLabel('Guess-less mode')
				: page.getByRole('button', { name: /^Find match/ })
		).toBeEnabled();
	});
}
