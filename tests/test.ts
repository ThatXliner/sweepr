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

test('classic: guess-less mode is on by default and toggleable', async ({ page }) => {
	await page.goto('/classic');
	const toggle = page.getByLabel('Guess-less mode');
	await expect(toggle).toBeChecked();
	await toggle.click();
	await expect(toggle).not.toBeChecked();
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

	// Placing shows one opponent board. Drop one mine.
	await page.locator('button.h-7:not(.rounded-full)').first().click();
	await expect(page.getByText('Mines left:')).toContainText('9');

	await page.getByRole('button', { name: /Ready/ }).click();

	// The public arena preserves one large board and fifteen opponent previews.
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

test('tactical: bots sweep their guessless boards and make progress', async ({ page }) => {
	await openTacticalBotGame(page);
	// Spend all 10 mines on the first opponent. Guessless mode turns those into
	// the board's mine COUNT — the layout re-deals solvable on first click, so
	// dense mining no longer insta-kills; perfect bots survive and sweep.
	const oppCells = page.locator('button.h-7:not(.rounded-full)');
	for (let i = 0; i < 10; i++) await oppCells.nth(i).click();
	await expect(page.getByText('Mines left:')).toContainText('0');

	await page.getByRole('button', { name: /Ready/ }).click();

	// Perfect solvers on solvable boards: every bot makes deterministic progress.
	// Some mini-board nameplate ticks past zero cleared within a few moves.
	await expect(
		page
			.locator('[data-attack-target]')
			.filter({ hasText: /P\d+ · [1-9]/ })
			.first()
	).toBeVisible({ timeout: 30000 });
});

test('tactical: opponent boards are not clickable during the sweep', async ({ page }) => {
	await openTacticalBotGame(page);
	const cells = page.locator('button.h-7:not(.rounded-full)');
	for (let i = 0; i < 10; i++) await cells.nth(i).click();
	await page.getByRole('button', { name: /Ready/ }).click();

	// Only your board is interactive during the duel.
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

test('tactical: private room menu validates codes and lets the host cancel', async ({ page }) => {
	await page.goto('/tactical');
	await page.getByLabel('Room code', { exact: true }).fill('BAD');
	await page.getByRole('button', { name: 'Join room' }).click();
	await expect(page.getByRole('alert')).toHaveText('Enter an 8-character room code.');
	await page.getByRole('button', { name: 'Create room' }).click();
	await expect(page.getByLabel('Private room code')).toHaveText(/^[A-Z2-9]{8}$/);
	await page.getByRole('button', { name: 'Cancel', exact: true }).click();
	await expect(page.getByRole('heading', { name: 'Private 1v1 duel' })).toBeVisible();
});

test('tactical: arena targeting selects one opponent with mouse or keyboard', async ({ page }) => {
	await openTacticalBotGame(page);
	await page.getByRole('button', { name: /Ready/ }).click();
	const targets = page.getByTestId('target-button');
	await expect(targets).toHaveCount(15);
	await expect(page.locator('[data-testid="target-button"][aria-pressed="true"]')).toHaveCount(1);
	await page.locator('[data-target="2"]').click();
	await expect(page.locator('[data-target="2"]')).toHaveAttribute('aria-pressed', 'true');
	await page.locator('[data-target="3"]').focus();
	await page.locator('[data-target="3"]').press('Enter');
	await expect(page.locator('[data-target="3"]')).toHaveAttribute('aria-pressed', 'true');
	await expect(page.locator('[data-testid="target-button"][aria-pressed="true"]')).toHaveCount(1);
	await expect(page.locator('[role="grid"].pointer-events-none')).toHaveCount(15);
});

for (const width of [360, 390, 820, 960]) {
	test.describe(`tactical: ${width}px compact arena`, () => {
		test.use({ viewport: { width, height: 800 }, hasTouch: true });

		test('your board and current target lead; tiny boards are tap targets', async ({
			page
		}, testInfo) => {
			await openTacticalBotGame(page);
			await page.getByRole('button', { name: /Ready/ }).click();
			await page.screenshot({ path: testInfo.outputPath(`arena-${width}.png`), fullPage: true });
			expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
				width
			);

			// The aim is named beside your own board, above the fold.
			const current = page.getByTestId('current-target');
			await expect(current).toBeVisible();
			await expect(current).toHaveText(/^Target P1 · \d+$/);
			const own = (await page.getByRole('grid', { name: 'Your board' }).boundingBox())!;
			const firstPicker = page.locator('[data-target="1"]');
			expect((await firstPicker.boundingBox())!.y).toBeGreaterThan(own.y + own.height);

			// Focus order matches the stack: your board, then flank pickers in seat order.
			await page.locator('[role="grid"][aria-label="Your board"] button[tabindex="0"]').focus();
			await page.keyboard.press('Tab');
			await expect(firstPicker).toBeFocused();
			await page.keyboard.press('Tab');
			await expect(page.locator('[data-target="2"]')).toBeFocused();
			await page.keyboard.press('Space');
			await expect(page.locator('[data-target="2"]')).toHaveAttribute('aria-pressed', 'true');
			await expect(current).toHaveText(/^Target P2 · /);

			// A tap on the middle of a tiny board aims at it; the whole panel is the target.
			const picker = page.locator('[data-target="9"]');
			await picker.scrollIntoViewIfNeeded();
			expect((await picker.boundingBox())!.height).toBeGreaterThanOrEqual(28);
			const panel = (await page.locator('[data-player-panel="9"]').boundingBox())!;
			expect(Math.min(panel.width, panel.height)).toBeGreaterThanOrEqual(44);
			const board = (await page.getByRole('grid', { name: "Opponent 9's board" }).boundingBox())!;
			await page.touchscreen.tap(board.x + board.width / 2, board.y + board.height / 2);
			await expect(picker).toHaveAttribute('aria-pressed', 'true');
			await expect(page.locator('[data-testid="target-button"][aria-pressed="true"]')).toHaveCount(
				1
			);
			await expect(current).toHaveText(/^Target P9 · /);
			await page.screenshot({
				path: testInfo.outputPath(`arena-${width}-tapped-p9.png`),
				fullPage: true
			});
		});
	});
}

test('tactical: a knocked-out target hands aim to the lowest living seat, out loud', async ({
	page
}, testInfo) => {
	test.setTimeout(120_000);
	// Seeded randomness keeps easy-bot misclicks reproducible; the fake clock
	// lets a minute of bot play run in moments. Reduced motion stays honored.
	await page.addInitScript(() => {
		let seed = 0x5eed;
		Math.random = () => {
			seed = (seed + 0x6d2b79f5) | 0;
			let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
			t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
			return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
		};
	});
	await page.emulateMedia({ reducedMotion: 'reduce' });
	const start = new Date('2026-01-01T12:00:00Z');
	await page.clock.install({ time: start });
	await openTacticalBotGame(page);
	await page.getByLabel('Bot difficulty').selectOption('easy');
	await page.getByRole('button', { name: /Ready/ }).click();
	await page.clock.pauseAt(new Date(start.getTime() + 60_000));

	const status = page.getByRole('status');
	let notice = '';
	for (let step = 0; step < 300 && !notice.includes(' is out'); step++) {
		await page.clock.runFor(2_000);
		notice = (await status.textContent()) ?? '';
	}
	const [, lost, next] = notice.match(/^P(\d+) is out — now targeting P(\d+)\.$/) ?? [];
	expect(lost, `no fallback notice; status was "${notice}"`).toBeTruthy();
	await page.screenshot({ path: testInfo.outputPath('target-fallback.png'), fullPage: true });

	await expect(page.locator(`[data-target="${lost}"]`)).toBeDisabled();
	await expect(page.locator(`[data-target="${lost}"]`)).toHaveText(`P${lost} out`);
	await expect(page.locator(`[data-target="${next}"]`)).toHaveAttribute('aria-pressed', 'true');
	const lowestLiving = page.locator('[data-testid="target-button"]:not([disabled])').first();
	await expect(lowestLiving).toHaveAttribute('data-target', next);
	// The skull is decoration; the picker text already says who's out.
	await expect(page.locator(`[data-player-panel="${lost}"] [aria-hidden="true"]`)).toHaveText('💀');
	await expect(page.getByTestId('attack-projectile')).toHaveCount(0);
});

test('tactical: help copy matches the fallback rule and pluralizes hits', async ({
	page
}, testInfo) => {
	await openTacticalBotGame(page);
	await page.getByRole('button', { name: /Ready/ }).click();
	await expect(page.getByTestId('current-target')).toBeHidden();
	await page.screenshot({ path: testInfo.outputPath('arena-desktop.png'), fullPage: true });
	await expect(page.getByText(/every 4 hits become one mine/)).toBeVisible();
	await page.getByRole('button', { name: 'How Tactical works' }).click();
	await expect(page.getByText(/lowest-numbered opponent still standing/)).toBeVisible();
});
