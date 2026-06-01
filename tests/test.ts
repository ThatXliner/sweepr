import { expect, test } from '@playwright/test';

test('landing page shows the three modes', async ({ page }) => {
	await page.goto('/');
	await expect(page.getByRole('heading', { name: 'sweepr' })).toBeVisible();
	await expect(page.getByRole('link', { name: /Classic/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Tactical/ })).toBeVisible();
	await expect(page.getByRole('link', { name: /Blitz/ })).toBeVisible();
});

test('classic renders the easy board', async ({ page }) => {
	await page.goto('/classic');
	// Tabs.Root mounts every panel, so scope to the visible (Easy) one: 9x9 = 81.
	const easyPanel = page.locator('[role="tabpanel"]').filter({ visible: true });
	await expect(easyPanel.locator('button.h-8')).toHaveCount(81);
});

test('blitz: clicking starts the match and the bot opponent sweeps', async ({ page }) => {
	await page.goto('/blitz');
	// Two 16x16 boards = 512 cells.
	await expect(page.locator('button.h-6:not(.rounded-full)')).toHaveCount(512);
	await expect(page.getByText(/Opponent — 0 cleared/)).toBeVisible();

	// Open a player cell to start the timer + bot.
	await page.locator('button.h-6:not(.rounded-full)').nth(40).click();

	// The bot should clear at least one cell within a few seconds.
	await expect(page.getByText(/Opponent — 0 cleared/)).toBeHidden({ timeout: 6000 });
	await expect(page.getByText(/You — [1-9]/)).toBeVisible();
});

test('tactical: place a mine, ready, then sweep phase begins', async ({ page }) => {
	await page.goto('/tactical');
	await expect(page.getByText('Place your mines')).toBeVisible();
	await expect(page.getByText('Mines left:')).toContainText('10');

	// Drop one mine on the first opponent board.
	await page.locator('button.h-7:not(.rounded-full)').first().click();
	await expect(page.getByText('Mines left:')).toContainText('9');

	await page.getByRole('button', { name: /Ready/ }).click();

	// Sweep phase: 4 boards of 9x9 = 324 cells, and the instructions appear.
	await expect(page.locator('button.h-7:not(.rounded-full)')).toHaveCount(324);
	await expect(page.getByText(/last sweeper alive wins|wins\./)).toBeVisible();
});

test('blitz: flagging marks a hidden cell and invert controls swaps actions', async ({ page }) => {
	await page.goto('/blitz');
	const playerBoard = page.locator('button.h-6:not(.rounded-full)');

	// Start the match (flagging is a no-op before the first reveal).
	await playerBoard.nth(0).click({ button: 'left' });

	// Bind to a concrete still-hidden cell by index so the locator doesn't
	// re-resolve to a different cell after we flag it. Hidden cells keep
	// bg-gray-200; revealed ones become bg-white.
	const firstHiddenIndex = async () => {
		const count = await playerBoard.count();
		for (let i = 0; i < count; i++) {
			const cls = (await playerBoard.nth(i).getAttribute('class')) ?? '';
			if (cls.includes('bg-gray-200') && !cls.includes('text-red-500')) return i;
		}
		throw new Error('no hidden cell');
	};

	// Right-click flags.
	const a = playerBoard.nth(await firstHiddenIndex());
	await a.click({ button: 'right' });
	await expect(a).toHaveText('🚩');

	// Invert controls: a left click now flags instead of revealing.
	await page.getByLabel('Invert controls').check();
	const b = playerBoard.nth(await firstHiddenIndex());
	await b.click({ button: 'left' });
	await expect(b).toHaveText('🚩');
});

test('tactical: a densely-mined match resolves to a winner', async ({ page }) => {
	await page.goto('/tactical');
	// Spend all 10 mines on the first opponent to load its board.
	const oppCells = page.locator('button.h-7:not(.rounded-full)');
	for (let i = 0; i < 10; i++) await oppCells.nth(i).click();
	await expect(page.getByText('Mines left:')).toContainText('0');

	await page.getByRole('button', { name: /Ready/ }).click();

	// Bots sweep their (opponent-mined) boards and start dying; the match should
	// reach a resolved "… wins." within a reasonable window.
	await expect(page.getByText(/wins\./)).toBeVisible({ timeout: 30000 });
	// At least one player should be flagged eliminated.
	await expect(page.getByText('eliminated').first()).toBeVisible();
});

for (const { path, mode, blurb } of [
	{ path: '/classic', mode: 'Classic', blurb: /original minesweeper/i },
	{ path: '/blitz', mode: 'Blitz', blurb: /stamina marathon/i },
	{ path: '/tactical', mode: 'Tactical', blurb: /battle royale/i }
]) {
	test(`${path}: info button explains how ${mode} works`, async ({ page }) => {
		await page.goto(path);
		// The blurb lives in a popover that's closed until the button is clicked.
		await expect(page.getByText(blurb)).toBeHidden();
		await page.getByRole('button', { name: `How ${mode} works` }).click();
		await expect(page.getByText(blurb)).toBeVisible();
	});
}
