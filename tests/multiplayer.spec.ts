import { test, expect, type Page } from '@playwright/test';

// Live multiplayer smoke tests against the local Supabase Realtime stack. These
// need `supabase start` running; they're skipped automatically if it isn't.
const SUPABASE = 'http://127.0.0.1:54321';

test.beforeAll(async ({ request }) => {
	const up = await request.get(`${SUPABASE}/auth/v1/health`).catch(() => null);
	test.skip(!up || !up.ok(), 'local Supabase not running (run `supabase start`)');
});

async function findMatch(page: Page, button: string) {
	await page.goto('/blitz');
	await page.getByRole('button', { name: button }).click();
}

test('blitz: two players are matched and see each other live', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	const pa = await a.newPage();
	const pb = await b.newPage();

	await Promise.all([findMatch(pa, 'Find match'), findMatch(pb, 'Find match')]);

	// Both should land in a real match: the Blitz board (h-6 cells) renders and
	// the info copy says it's a live opponent, not a bot.
	for (const p of [pa, pb]) {
		await expect(p.locator('button.h-6:not(.rounded-full)')).toHaveCount(512, { timeout: 20000 });
		await expect(p.getByText(/Opponent — 0 cleared/)).toBeVisible();
	}

	// Player A reveals a cell; B's mirror of A should show progress (A's "You"
	// count rises locally, and B sees A's opponent board update).
	await pa.locator('button.h-6:not(.rounded-full)').nth(40).click();
	await expect(pa.getByText(/You — [1-9]/)).toBeVisible({ timeout: 10000 });
	// B's opponent panel (which mirrors A) should leave the 0-cleared state.
	await expect(pb.getByText(/Opponent — 0 cleared/)).toBeHidden({ timeout: 10000 });

	await a.close();
	await b.close();
});

// NOTE: forfeit-on-disconnect relies on Supabase Realtime presence dropping the
// peer, which only happens after a heartbeat timeout (tens of seconds) on an
// abrupt tab close — too slow/flaky to assert in e2e. The presence-leave forfeit
// path is wired in BlitzGame; it's exercised manually rather than here.

test('tactical: two players are matched into one arena', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	const pa = await a.newPage();
	const pb = await b.newPage();

	for (const p of [pa, pb]) {
		await p.goto('/tactical');
		await p.getByRole('button', { name: 'Find match' }).click();
	}

	// After the ~8s short-wait both should be placing in a real match (the live
	// info copy appears once they open the ModeInfo, but the placing board grid is
	// the reliable signal). Bots fill the remaining 14 slots.
	for (const p of [pa, pb]) {
		await expect(p.getByText('Place your mines')).toBeVisible({ timeout: 25000 });
	}

	// Both ready up with no mines placed; the sweep arena should build (16 boards)
	// once each client's placement arrives.
	for (const p of [pa, pb]) await p.getByRole('button', { name: /Ready/ }).click();
	for (const p of [pa, pb]) {
		await expect(p.locator('[role="grid"]')).toHaveCount(16, { timeout: 20000 });
	}

	await a.close();
	await b.close();
});
