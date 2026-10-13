# Sweepr

Minesweeper with Classic solo play, Blitz races, and Tactical arenas with private 1v1 mine duels.

## Local development

Install dependencies with `bun install`. Start Docker and run `supabase start`, then
copy `.env.example` to `.env` and fill in the URL and public anon key from
`supabase status`. Run `bun run dev`.

For a hosted Supabase project, use its URL and publishable key and enable anonymous
sign-ins in Auth. The checked-in local Supabase configuration already enables them.
Never put a service-role key in a `PUBLIC_` variable.

## Tactical multiplayer

For a private duel, open `/tactical`, choose **Create room**, and share the displayed
8-character code. Your friend enters it under **Room code** and chooses **Join room**.
Only the creator and one guest enter that duel; public matchmaking and other room
codes use separate lobbies. The creator can cancel while waiting. Codes are temporary:
keep the creator's tab open until the friend joins, and create a new room for another
match.

**Find match** still joins the public 16-player arena. It starts with at least two
humans after a short wait and fills the remaining seats with bots. **Play vs bots**
starts an offline arena immediately.

The private match starts when both humans join the game channel. Each player places up to ten
mines on the other player's board and chooses **Ready**.

The first reveal deals a safe, solvable opening where possible, preserving the
opponent's mine count. In a 1v1 duel, each newly correct flag sends one mine to the rival. In the arena, every four incoming hits create one mine. Toggling
the same flag again does not send another attack. A mine lands only on an unflagged,
covered safe square that has no revealed neighbor, keeping every visible number
accurate. If no legal landing exists but safe squares remain, the attack is blocked.

When every covered square is already a mine, the next attack eliminates that
player. The total mine count and flags remaining are visible: recognize the fully
mined remainder and flag every mine to advance to a fresh board before the next
attack arrives. Revealing a mine also eliminates you. The last survivor wins;
elapsed time is informational.

Matches use Supabase Realtime Broadcast and Presence. Board owners apply incoming
attacks and publish mine coordinates so opponent mirrors keep their reveals and
flags. This is a client-authoritative casual multiplayer system: mine layouts are
sent to peers, and it does not provide server-side anti-cheat or reconnect recovery.

## Verification

- `bun run check` — Svelte and TypeScript checks.
- `bun run test:unit --run` — board rules, solver, matchmaking, and network messages.
- `bun run test:integration` — browser flows, including two-human mine delivery
  against the Supabase URL in your environment. Live multiplayer tests skip if
  that service is unavailable.
- `bun run build` — production build.

Browser tests use port 4173 by default. Set `PLAYWRIGHT_PORT` if another app uses
that port. Install Chromium for the tests with `bunx playwright install chromium`.

## Deploying on big-mac

The default build uses Vercel. `SWEEPR_ADAPTER=node bun run build` produces a
standalone Node server for self-hosting. The production Docker Compose file builds
that server and binds it to `127.0.0.1:3017` (override with `SWEEPR_PORT`).

On the server, configure `.env` with `PUBLIC_SUPABASE_URL`,
`PUBLIC_SUPABASE_ANON_KEY`, and `ORIGIN` (the public web URL). Run
`docker compose -f compose.production.yml up -d --build`. Put the app behind the
existing HTTPS tunnel. In self-hosted Supabase Auth, set `ENABLE_ANONYMOUS_USERS=true`
and `DISABLE_SIGNUP=false`; both settings are required for anonymous players to join.

To verify the actual deployment without starting a local preview server:

```bash
PLAYWRIGHT_BASE_URL=https://sweepr-bigmac.bryanhu.com \
PUBLIC_SUPABASE_URL=https://sweeper-supabase.bryanhu.com \
PUBLIC_SUPABASE_ANON_KEY=your-public-key \
bunx playwright test tests/multiplayer.spec.ts
```

Deployed multiplayer checks fail if Supabase is unreachable; they do not skip.
