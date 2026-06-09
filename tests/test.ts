import { expect, test, type Page } from '@playwright/test';

// Blitz now opens on a Find-match / Play-vs-bot menu; most tests want the local
// bot game.
async function openBlitzBotGame(page: Page) {
	await page.goto('/blitz');
	await page.getByRole('button', { name: 'Play vs bot' }).click();
}

async function openTacticalBotGame(page: Page) {
	await page.goto('/tactical');
	await page.getByRole('button', { name: 'Play vs bots' }).click();
}

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
	await openBlitzBotGame(page);
	// Two 16x16 boards = 512 cells.
	await expect(page.locator('button.h-6:not(.rounded-full)')).toHaveCount(512);
	await expect(page.getByText(/Opponent — 0 cleared/)).toBeVisible();

	// Open a player cell to start the timer + bot.
	await page.locator('button.h-6:not(.rounded-full)').nth(40).click();

	// The bot should clear at least one cell within a few seconds — unless its
	// random probe hits a mine first, which legitimately ends the match at 0.
	await expect(
		page
			.getByText(/Opponent — [1-9]\d* cleared/)
			.or(page.getByText('You win — opponent hit a mine!'))
	).toBeVisible({ timeout: 6000 });
	await expect(page.getByText(/You — [1-9]/)).toBeVisible();
});

test('tactical: place a mine, ready, then sweep phase begins', async ({ page }) => {
	await openTacticalBotGame(page);
	await expect(page.getByText('Place your mines')).toBeVisible();
	await expect(page.getByText('Mines left:')).toContainText('10');

	// Placing shows the 15 opponent boards (9x9 each). Drop one mine on the first.
	await page.locator('button.h-7:not(.rounded-full)').first().click();
	await expect(page.getByText('Mines left:')).toContainText('9');

	await page.getByRole('button', { name: /Ready/ }).click();

	// Sweep (tetr.io layout): one large board (yours, h-7 = 81 cells) centred, the
	// 15 opponents rendered as tiny boards (h-2).
	await expect(page.locator('button.h-7:not(.rounded-full)')).toHaveCount(81);
	await expect(page.locator('button.h-2')).toHaveCount(15 * 81);
	await expect(page.getByText(/last sweeper alive wins|wins\./)).toBeVisible();
});

test('blitz: flagging marks a hidden cell and invert controls swaps actions', async ({ page }) => {
	await openBlitzBotGame(page);
	const playerBoard = page.locator('button.h-6:not(.rounded-full)');

	// Start the match (flagging is a no-op before the first reveal).
	await playerBoard.nth(0).click({ button: 'left' });

	// Bind to a concrete still-hidden, unflagged cell by index so the locator
	// doesn't re-resolve after we flag it. Revealed cells get `bg-cell-revealed`;
	// flagged cells get `text-destructive`.
	const firstHiddenIndex = async () => {
		const count = await playerBoard.count();
		for (let i = 0; i < count; i++) {
			const cls = (await playerBoard.nth(i).getAttribute('class')) ?? '';
			if (!cls.includes('bg-cell-revealed') && !cls.includes('text-destructive')) return i;
		}
		throw new Error('no hidden cell');
	};

	// Right-click flags, and a second right-click toggles it back off exactly
	// once (no double-fire from contextmenu + mousedown).
	const a = playerBoard.nth(await firstHiddenIndex());
	await a.click({ button: 'right' });
	await expect(a).toHaveText('🚩');
	await a.click({ button: 'right' });
	await expect(a).toHaveText('');
	await a.click({ button: 'right' });
	await expect(a).toHaveText('🚩');

	// Invert controls: a left click now flags instead of revealing.
	await page.getByLabel('Invert controls').check();
	const b = playerBoard.nth(await firstHiddenIndex());
	await b.click({ button: 'left' });
	await expect(b).toHaveText('🚩');
});

test('tactical: bots sweep and start getting eliminated', async ({ page }) => {
	await openTacticalBotGame(page);
	// Spend all 10 mines on the first opponent to densely mine its board.
	const oppCells = page.locator('button.h-7:not(.rounded-full)');
	for (let i = 0; i < 10; i++) await oppCells.nth(i).click();
	await expect(page.getByText('Mines left:')).toContainText('0');

	await page.getByRole('button', { name: /Ready/ }).click();

	// 16-player arena: bots sweep their (opponent-mined) boards and start dying.
	// At least one 💀 appears on the flanks within a reasonable window. (Asserting
	// a single final winner is impractical with 15 bots, so we check progress.)
	await expect(page.getByText('💀').first()).toBeVisible({ timeout: 30000 });
});

test('tactical: opponent boards are not clickable during the sweep', async ({ page }) => {
	await openTacticalBotGame(page);
	const cells = page.locator('button.h-7:not(.rounded-full)');
	for (let i = 0; i < 10; i++) await cells.nth(i).click();
	await page.getByRole('button', { name: /Ready/ }).click();

	// 16 boards total (1 large yours + 15 tiny opponents); exactly one (yours) is
	// interactive, the other 15 carry pointer-events-none.
	await expect(page.locator('[role="grid"]')).toHaveCount(16);
	await expect(page.locator('[role="grid"].pointer-events-none')).toHaveCount(15);
});

for (const { path, mode, blurb } of [
	{ path: '/classic', mode: 'Classic', blurb: /original minesweeper/i },
	{ path: '/blitz', mode: 'Blitz', blurb: /stamina marathon/i },
	{ path: '/tactical', mode: 'Tactical', blurb: /battle royale/i }
]) {
	test(`${path}: info button explains how ${mode} works`, async ({ page }) => {
		if (path === '/blitz') await openBlitzBotGame(page);
		else if (path === '/tactical') await openTacticalBotGame(page);
		else await page.goto(path);
		// The blurb lives in a popover that's closed until the button is clicked.
		await expect(page.getByText(blurb)).toBeHidden();
		await page.getByRole('button', { name: `How ${mode} works` }).click();
		await expect(page.getByText(blurb)).toBeVisible();
	});
}

for (const path of ['/blitz', '/tactical']) {
	test(`${path}: difficulty can be set before the match`, async ({ page }) => {
		if (path === '/blitz') await openBlitzBotGame(page);
		else if (path === '/tactical') await openTacticalBotGame(page);
		else await page.goto(path);
		const select = page.getByLabel('Bot difficulty');
		await expect(select).toBeVisible();
		await select.selectOption('hard');
		await expect(select).toHaveValue('hard');
	});
}
