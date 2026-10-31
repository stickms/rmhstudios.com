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
pnpm exec tsx testing/balatro-e2e/engine/sweep.ts [--chunk id ...] [--list]   # the full UI sweep, chunked
pnpm test:balatro:e2e --project match [testing/balatro-e2e/match/<file>.test.ts]
BALATRO_E2E_SOAK=1 pnpm test:balatro:e2e --project match testing/balatro-e2e/match/soak.test.ts
```

## Speed: turbo and the CI shards

Every engine page (the harness page and each real player) runs the autopilot's **turbo**
(`autopilot.lua` `turbo{updates, draw_every}`, set by `lib/turbo.ts`): 8 game updates per frame
with that frame's dt, and a draw every 4th frame. On SwiftShader a frame costs ~100 ms, almost
all of it drawing, and Balatro advances at most 0.1 s of game time per frame (main.lua caps
dt), so a scripted run is mostly waiting for animations; turbo fast-forwards them about 5x
without touching game logic or RNG (seeded results are identical). While a Lua task is inside
`wait_frames(n)` every frame is a full one (one update, one draw: `sched.full_frames()`), so a
spec that lets the engine lay out and draw, and `perf_spec`'s per-frame measurements, see real
frames. Commands still poll once per frame. Network, the hub and the PvP timers run on the
page's clock and are unaffected. `BALATRO_E2E_TURBO=off` (or `UxD`, e.g. `16x2`) changes it;
the nightly CI run uses `off`, so the real-speed path keeps being tested.

CI (`.github/workflows/balatro-mp-tests.yml`) runs the e2e suite as parallel jobs next to
`test`: `e2e-engine` (harness + engine, one boot: specs are order-checked and the golden seeds
compared within it), `e2e-match` — a matrix over the shards in `shards.ts`, each with its own
Postgres, hub and `vite dev` — and the aggregate `e2e`, which fails if any of them did.
`lib/shards.unit.test.ts` fails when a match file is in no shard or the workflow matrix and
`MATCH_SHARDS` differ. Run one shard locally with
`pnpm test:balatro:e2e --project match $(pnpm exec tsx testing/balatro-e2e/shards.ts formats)`.
CI sets `BALATRO_E2E_SOAK=1` on every run: the 12-ante soak takes about 2 minutes with turbo
(a 3-ante run locally: 0.4 min) and its "30 minutes" at real speed, nightly.

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

The full UI sweep (`mp_test/specs/ui_sweep_full.lua`: every Collection card hovered, every
button of every MP screen and overlay clicked, every MP item given and used) is not a `*_spec`
file: one boot cannot hold it (the page runs out of memory on software WebGL), so
`engine/sweep.ts` runs it chunk by chunk, each chunk in a fresh boot, and prints every chunk's
time. The chunks are the Lua file's `CHUNKS` table (`lib/sweep-chunks.ts` reads it;
`lib/sweep-chunks.unit.test.ts` fails when a sweep test is in no chunk or the nightly job is
gone). CI runs it in the `e2e-sweep` job, nightly and on a `long` dispatch only; every PR runs
its quick form, `ui_sweep_spec.lua`, in the engine project.

The challenge specs (`ui_run_challenges_a_spec.lua`, `ui_run_challenges_b_spec.lua`, both loading
`mp_test/challenges_body.lua`) start every Multiplayer challenge, check it against its
definition (`mp_test/challenge_check.lua`, L1-tested in `spec/mp_challenge_check_spec.lua`),
exercise its special rule and play its first ante, then the win/loss paths and the vanilla
challenges with MP loaded.

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

| File                         | Scenarios                                                                |
| ---------------------------- | ------------------------------------------------------------------------ |
| `smoke.test.ts`              | the stack, N signed-in boots                                             |
| `nemesis.test.ts`            | E2E-01, 02, 10, 08/23, 11 (two real browsers)                            |
| `nemesis-resilience.test.ts` | E2E-12 drop, 14 reload-rejoin, 21 kick/mismatch, 15 relay (two browsers) |
| `formats.test.ts`            | E2E-04 Nemesis×3, 05 Royale×4, 06 Manhunt 1+2, 07 Teams 2v2, 20          |
| `host-migration.test.ts`     | E2E-13 (the host's page closes mid-match; 1 browser + bots)              |
| `practice.test.ts`           | E2E-16 (every standard practice ruleset; ante 8 → the vanilla win)       |
| `queue.test.ts`              | E2E-17 casual queue + setup, E2E-18 party, LOB-04 invite link            |
| `spectate-replay.test.ts`    | E2E-19 spectate list, mid-match spectator, My Replays playback           |
| `large.test.ts`              | E2E-22 (1 real + 15 bots; `BALATRO_E2E_BOTS`)                            |
| `soak.test.ts`               | E2E-24 (`BALATRO_E2E_SOAK=1`; `BALATRO_E2E_SOAK_ANTES`, default 12)      |

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
`BALATRO_E2E_SPEC_TIMEOUT_MS` (default 1 200 000; CI's PR run: 600 000) each engine spec file: 30 s before it, a file still running fails with the engine's last log lines and the files after it run in a fresh boot. While a file runs, the engine project prints each test's result as it lands (`#   [elapsed] ok …`), so a slow file shows where it is.
