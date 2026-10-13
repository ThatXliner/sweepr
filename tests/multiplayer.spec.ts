import { test, expect, type Page } from '@playwright/test';

// Live multiplayer smoke tests against the local Supabase Realtime stack. These
// need `supabase start` running; they're skipped automatically if it isn't.
const SUPABASE = process.env.PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';

test.beforeAll(async ({ request }) => {
	const up = await request
		.get(`${SUPABASE}/auth/v1/settings`, {
			headers: { apikey: process.env.PUBLIC_SUPABASE_ANON_KEY ?? '' }
		})
		.catch(() => null);
	if (process.env.PLAYWRIGHT_BASE_URL) {
		expect(up?.ok(), 'deployed Supabase must be reachable for live verification').toBe(true);
	} else {
		test.skip(!up || !up.ok(), 'Supabase not running or public key missing');
	}
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

test('tactical: two humans duel, send mines, and preserve the live mirror', async ({ browser }) => {
	const a = await browser.newContext();
	const b = await browser.newContext();
	const pa = await a.newPage();
	const pb = await b.newPage();
	let aMines: number[][] = [];
	pa.on('websocket', (socket) => {
		socket.on('framesent', ({ payload }) => {
			try {
				// Current Realtime encodes JSON broadcasts in a binary envelope.
				let move;
				if (Buffer.isBuffer(payload) && payload[0] === 3) {
					const offset = 7 + payload.subarray(1, 6).reduce((sum, length) => sum + length, 0);
					move = JSON.parse(payload.subarray(offset).toString());
				} else {
					const frame = JSON.parse(String(payload));
					move = (Array.isArray(frame) ? frame[4] : frame.payload)?.payload;
				}
				if (move?.kind === 'newboard') aMines = move.mines;
			} catch {
				/* Ignore non-JSON frames. */
			}
		});
	});

	await pa.goto('/tactical');
	await pa.getByRole('button', { name: 'Create room' }).click();
	const code = await pa.getByLabel('Private room code').textContent();
	expect(code).toMatch(/^[A-Z2-9]{8}$/);

	// A public queue player must never get pulled into the private duel.
	const outsider = await browser.newContext();
	const pc = await outsider.newPage();
	await pc.goto('/tactical');
	await pc.getByRole('button', { name: /^Find match/ }).click();
	await pb.goto('/tactical');
	await pb.getByLabel('Room code', { exact: true }).fill(code!.toLowerCase());
	await pb.getByRole('button', { name: 'Join room' }).click();
	// Both clients enter the same duel as soon as two humans are connected.
	for (const p of [pa, pb]) {
		await expect(p.getByText('Place your mines')).toBeVisible({ timeout: 25000 });
	}

	// Each player places ten mines on the other; both must ready before sweeping.
	const aOpp = pa.locator('[role="grid"][aria-label="Opponent 1\'s board"] button');
	for (let i = 0; i < 10; i++) await aOpp.nth(i).click();
	const bOpp = pb.locator('[role="grid"][aria-label="Opponent 1\'s board"] button');
	for (let i = 0; i < 10; i++) await bOpp.nth(i).click();
	for (const p of [pa, pb]) await p.getByRole('button', { name: /Ready/ }).click();
	for (const p of [pa, pb]) {
		await expect(p.locator('[role="grid"]')).toHaveCount(2, { timeout: 20000 });
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

	// B has not opened a square, so incoming mines have legal landing spots.
	// Flag a known mine from A's actual outgoing layout, then toggle it twice.
	await expect.poll(() => aMines.length).toBe(10);
	const [r, c] = aMines[0];
	const mine = pa.locator('[role="grid"][aria-label="Your board"] button').nth(r * 9 + c);
	await mine.click({ button: 'right' });
	await expect(pb.getByTestId('mine-count')).toHaveText('Mines: 11');
	await expect(
		pb.locator('[role="grid"][aria-label="Your board"] button.bg-cell-revealed')
	).toHaveCount(0);
	await expect(
		pb.locator('[role="grid"][aria-label="Opponent 1\'s board"] button').nth(r * 9 + c)
	).toHaveText('🚩');
	await mine.click({ button: 'right' });
	await mine.click({ button: 'right' });
	await expect(pb.getByTestId('mine-count')).toHaveText('Mines: 11');
	await expect(
		pb.locator('[role="grid"][aria-label="Opponent 1\'s board"] button.bg-cell-revealed')
	).toHaveCount(revealedOnA);

	await expect(pc.getByText('Rallying the sweepers…')).toBeVisible();
	await outsider.close();
	await a.close();
	await b.close();
});
