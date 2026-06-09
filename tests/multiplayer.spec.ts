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

	// A drops two mines on the live opponent (slot 1 on both clients is the other
	// human) before readying; the sweep arena should build (16 boards) once each
	// client's placement arrives.
	const aOpp = pa.locator('[role="grid"][aria-label="Opponent 1\'s board"] button');
	await aOpp.nth(0).click();
	await aOpp.nth(1).click();
	for (const p of [pa, pb]) await p.getByRole('button', { name: /Ready/ }).click();
	for (const p of [pa, pb]) {
		await expect(p.locator('[role="grid"]')).toHaveCount(16, { timeout: 20000 });
	}

	// Mirror exactness: A reveals a cell on its own board; the flood-filled
	// reveal count on A's real board must show up identically on B's mirror of A
	// (slot 1). This only holds if both clients agree on A's full mine layout —
	// the regression that slot-keyed messages used to break.
	await pa.locator('[role="grid"][aria-label="Your board"] button').nth(40).click();
	const revealedOnA = await pa
		.locator('[role="grid"][aria-label="Your board"] button.bg-cell-revealed')
		.count();
	expect(revealedOnA).toBeGreaterThan(0);
	await expect(
		pb.locator('[role="grid"][aria-label="Opponent 1\'s board"] button.bg-cell-revealed')
	).toHaveCount(revealedOnA, { timeout: 10000 });

	await a.close();
	await b.close();
});
