# Balatro multiplayer e2e (`pnpm test:balatro:e2e`)

Plan: PLAN §4 WS14 and §6 (the multiplayer project plan). CI: the `e2e` job in
`.github/workflows/balatro-mp-tests.yml`. Config: `vitest.balatro-e2e.config.ts`.

| Project   | Runs                                                                      | Needs                           |
| --------- | ------------------------------------------------------------------------- | ------------------------------- |
| `harness` | `**/*.unit.test.ts`: the e2e machinery itself                             | nothing                         |
| `engine`  | Lua L2: `lib/balatro/lua/mp_test/specs/*_spec.lua` in the real love.wasm  | Chromium                        |
| `match`   | multi-browser matches and bot-peer lobbies (E2E-01…24, `match/*.test.ts`) | Chromium + Postgres (see below) |

```bash
pnpm test:balatro:e2e --project harness
pnpm test:balatro:e2e --project engine
BALATRO_E2E_ISOLATE=1 pnpm test:balatro:e2e --project engine   # + every spec file alone in a fresh boot
pnpm exec tsx testing/balatro-e2e/engine/cli.ts [--filter text] [--spec name] [--shot out.png] [--serve]
pnpm test:balatro:e2e --project match [testing/balatro-e2e/match/<file>.test.ts]
BALATRO_E2E_SOAK=1 pnpm test:balatro:e2e --project match testing/balatro-e2e/match/soak.test.ts
```

## Engine-spec harness

`engine/page/entry.ts` boots the game exactly as `/balatro` does (`lib/balatro/runtime.ts`,
the committed packs in `data/balatro-pack`, `public/balatro/engine`) from a static server
(`lib/static-server.ts`) — no account, hub or database. It writes `lib/balatro/lua/mp_test/**`
to `/Balatro/rmh_mp_test`, the marker `/rmh/test/enabled`, and appends
`require "rmh_mp_test.harness"` to `main.lua`. The page and Lua talk over `/rmh/test/{cmd,res}`
(`lib/channel.ts` ↔ `mp_test/harness.lua`). `?mp=1` (the default whenever the pack manifest
lists an MP pack) also extracts the MP pack.

`engine/engine.test.ts` runs every spec file in ONE boot, one vitest test per file in name
order (the harness returns to the main menu between files, waiting out any screen wipe), then
a second boot WITHOUT the MP pack runs `engine_smoke_spec` and `sp_invariance_spec` and
compares their reports with the first boot's: the golden seeds (first three shops, Small/Big
tags and Bosses of antes 1–2 for three seeds) must be identical before MP ever loads, with MP
loaded after every content spec mounted and unmounted its sessions, and after one more practice
mount/unmount. `BALATRO_E2E_ISOLATE=1` adds every file alone in a fresh boot (order
independence). `perf_spec` reports the MP Lua budgets (§6.4) and the vitest output prints them.

A spec is plain Lua with the L1 API (`describe/it/expect`) plus `wait_frames`, `wait_until`,
`sleep`, `AP` (the autopilot) and `report(key, value)` — reports come back to vitest. A Lua
error stops the game and fails the run with its traceback (the harness replaces Balatro's
blocking error screen).

## Autopilot (test-only)

`lib/balatro/lua/mp_test/autopilot.lua`: `start_run`, `select_blind`, `skip_blind`, `play`,
`discard`, `set_chips`, `win_blind`, `cash_out`, `shop_digest`, `buy`, `reroll`, `open_pack`,
`pick`, `skip_pack`, `leave_shop`, `use`, `give`, `set_ante`, `state`, `wait_state`; MP:
`mp_open`, `mp_send{t,d}` (a `ui_*` message as a screen sends it), `mp_inbox{t?}` (what the
session told Lua), `mp_state`, `pvp_play{chips?,hands?}`, `pvp_wait_end`, `pvp_round`,
`mp_ante{chips}` (a whole ante of a match), `mp{fn,args}` (any `MP.test.<fn>`), and the UI
actions routed to `MP.test` (`ready`, `unready`, `timer_press`, `pause_menu`, `forfeit`,
`vote`). It installs only when `/rmh/test/enabled` exists and ships in no pack. In a test build
(`VITE_BALATRO_MP_TEST=1`) `lib/balatro/mp/test-hooks.ts` writes it and exposes
`window.__balatroMp.cmd(…)` (`test_cmd`/`test_res` over the mailbox; the MP pack's `init.lua`
installs the autopilot on the first `test_cmd`); the page exposes `window.__rmhBalatroOpenMp`
to open Multiplayer as the MULTIPLAYER button does. `scripts/balatro/bundle-budget.ts` fails if
`__balatroMp` reaches a production bundle.

## Match project

`match/global-setup.ts` starts ONE stack for every match file: the socket hub
(`tsx server/socket-server/index.ts`, port 7001) and `vite dev` (port 7997,
`VITE_BALATRO_MP_TEST=1`) through a generated wrapper config with HMR and the watcher off (a
file change must never reload a page mid-match; restart the run after editing test Lua). Each
file builds its world with `match/world.ts`: real players (`lib/mp-player.ts`: a signed-in
context on `/balatro`, 640×360 to keep software WebGL cheap) and bot peers (`lib/bot.ts` +
`bot/entry.ts`: the real MP session runtime and WebRTC with a scripted player instead of the
engine, served on the app's origin through Playwright routing), and drives them with
`lib/match-flow.ts`.

| File                      | Scenarios                                                           |
| ------------------------- | ------------------------------------------------------------------- |
| `smoke.test.ts`           | the stack, N signed-in boots                                        |
| `nemesis.test.ts`         | E2E-01, 02, 11, 12, 14, 15, 21 (two real browsers)                  |
| `formats.test.ts`         | E2E-04 Nemesis×3, 05 Royale×4, 06 Manhunt 1+2, 07 Teams 2v2, 13     |
| `practice.test.ts`        | E2E-16 (every standard practice ruleset; ante 8 → the vanilla win)  |
| `queue.test.ts`           | E2E-17 casual queue + setup, E2E-18 party, LOB-04 invite link       |
| `spectate-replay.test.ts` | E2E-19 spectate list, mid-match spectator, My Replays playback      |
| `large.test.ts`           | E2E-22 (1 real + 15 bots; `BALATRO_E2E_BOTS`)                       |
| `soak.test.ts`            | E2E-24 (`BALATRO_E2E_SOAK=1`; `BALATRO_E2E_SOAK_ANTES`, default 12) |

### Local requirements

1. Postgres 16 (CI: `pgvector/pgvector:pg16`; without pgvector the embeddings migration skips
   itself) with the schema: `DATABASE_URL=postgresql://… pnpm exec prisma migrate deploy`.
   On a machine with Debian's postgresql-16 but no access to the `postgres` role, an isolated
   trust-auth cluster works: `pg_createcluster 16 e2e -p 5433 -- --auth=trust`,
   `pg_ctlcluster 16 e2e start`, `createdb -h 127.0.0.1 -p 5433 -U postgres rmh_balatro_e2e`.
2. `DATABASE_URL` and `BETTER_AUTH_SECRET` (32+ chars) in the environment. Accounts are made
   through `/api/auth/sign-up/email` (`lib/accounts.ts`). Ports: `BALATRO_E2E_WEB_PORT`,
   `BALATRO_E2E_HUB_PORT`; logs: `BALATRO_E2E_LOG_DIR`; `BALATRO_E2E_DEBUG=1` prints each
   player's boot steps.
3. Or attach to a stack you started yourself: `BALATRO_E2E_BASE_URL=http://localhost:7997`
   (and `BALATRO_E2E_SOCKET_URL`, default `http://localhost:7001`).
4. A git worktree whose `node_modules` is a link to another checkout: make `node_modules` a
   real directory of links (`.pnpm` and each package linked, `.nitro`/`.vite` real), or Nitro's
   dev worker resolves its runtime against the wrong root.

Without a stack the project skips; `BALATRO_E2E_REQUIRE_MATCH=1` (CI) makes that a failure.

## Chromium

Playwright's own build, or `CHROME_PATH=/path/to/chrome` (as `scripts/epic/browser.ts`).
WebGL runs on SwiftShader (`lib/chromium.ts`). One 1280×720 engine page keeps about three CPU
cores busy; a boot takes 20–90 s. `BALATRO_E2E_BOOT_TIMEOUT_MS` (default 240 000) bounds it,
`BALATRO_E2E_SPEC_TIMEOUT_MS` (default 1 200 000) each engine spec file.
