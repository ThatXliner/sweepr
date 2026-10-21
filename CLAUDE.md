# Sweepr

"Minesweeper, reimagined" — the classic 90s logic game with modern, competitive multiplayer modes.

## Tech Stack

- SvelteKit + Svelte 5 (runes: `$state`, `$props`, `$effect`, `untrack`)
- Tailwind CSS v4 (CSS-first config in `src/app.css`, HSL token theme)
- shadcn-svelte components (slate base color) + bits-ui primitives
- Supabase auth (`@supabase/ssr`)
- Deployed on Vercel (`@sveltejs/adapter-vercel`)
- Package manager: **npm on Node.js 22.23.4+ (22.x)**
- Tests: Vitest (unit) + Playwright (integration)

## Game Modes

| Mode     | Color                    | What it is                                                  |
| -------- | ------------------------ | ----------------------------------------------------------- |
| Classic  | blue (`bg-blue-500`)     | The original solo game from the 90s                         |
| Tactical | red (`bg-red-500`)       | Online battle royale — place mines on opponents' boards     |
| Blitz    | yellow (`bg-yellow-500`) | 1v1 stamina marathon to clear more tiles than your opponent |
| Infinite | —                        | Endless board mode                                          |

Mode colors are the primary brand signal — keep them consistent everywhere a mode is referenced.

## Design Context

### Users

Primarily **puzzle fans** who love the cerebral, deductive logic at the heart of Minesweeper. Their core context is concentration: they're scanning a grid, reasoning about probabilities, and making careful decisions. The job to be done is _solving the board_ — first and foremost a focused thinking task. The competitive modes (Tactical, Blitz) layer social stakes on top, but even there the board itself is where attention lives. Players span desktop (mouse right-click flagging) and touch (long-press flagging).

### Brand Personality

**Playful · clever · nostalgic.** Sweepr's voice is warm and a little cheeky — it speaks directly to the player ("Thank you for playing my game"), riffs on Minesweeper lore (explosive division names: Firecracker, Dynamite, Nuke), and doesn't take itself too seriously. It should evoke the _delight_ of rediscovering a childhood game made fresh, while respecting the player's need to think.

### Aesthetic Direction

**Bold & playful chrome around a calm, focused board.** This is the central design tension to hold:

- **Chrome** (landing page, menus, mode selection, results screens) leans into the existing energetic vibe — oversized type, the giant mono `sweepr` wordmark, saturated per-mode colors, hover-scale interactions, expressive layout. This is where personality and delight live.
- **The board itself** stays calm, clean, and low-distraction. The grid is the hero — generous clarity, restrained color, nothing competing with the player's concentration. Classic Minesweeper number colors (1=blue, 2=green, 3=red, 4=purple…) are preserved as a familiar convention.

Anti-reference: don't let the playful chrome bleed onto the board and make it noisy or hard to read. Bold belongs on the wrapper, calm belongs on the grid.

**Theme:** support **both light and dark** with a user-facing toggle that respects system preference by default. Light = the classic paper-white board feel; dark = comfortable long-session play. (Token sets for both already exist in `app.css`; the toggle is not yet wired up.)

### Design Principles

1. **The board is sacred.** Never compromise grid readability for decoration. Personality goes on the chrome, focus goes on the field.
2. **Mode color is identity.** Blue/red/yellow map to Classic/Tactical/Blitz everywhere — use them as the consistent signal for which mode a player is in.
3. **Honor the convention, then delight.** Keep what veterans expect (number colors, flags, mine glyphs, right-click-to-flag) and add modern polish and joy on top — don't fight muscle memory.
4. **Accessible by default.** All four are required:
   - **Colorblind-safe numbers** — the classic 1–8 palette fails for colorblind players; pair number colors with shape/pattern cues or offer a colorblind-safe palette option.
   - **WCAG AA contrast** in both light and dark themes.
   - **Reduced motion** — honor `prefers-reduced-motion`; disable hover-scale and animations for those users.
   - **Keyboard play** — full keyboard navigation of both the board and the menus.
5. **Calm under competition.** Even in fast/competitive modes (Blitz, Tactical), keep the interface legible and unflustered — clarity wins games; visual panic doesn't.
