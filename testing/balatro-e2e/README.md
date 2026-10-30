# Balatro multiplayer e2e (`pnpm test:balatro:e2e`)

Plan: PLAN §4 WS14 and §6 (the multiplayer project plan). CI: the `e2e` job in
`.github/workflows/balatro-mp-tests.yml`. Config: `vitest.balatro-e2e.config.ts`.

| Project   | Runs                                                                     | Needs                           |
| --------- | ------------------------------------------------------------------------ | ------------------------------- |
| `harness` | `**/*.unit.test.ts`: the e2e machinery itself                            | nothing                         |
| `engine`  | Lua L2: `lib/balatro/lua/mp_test/specs/*_spec.lua` in the real love.wasm | Chromium                        |
| `match`   | multi-browser matches (wave 1: the stack smoke)                          | Chromium + Postgres (see below) |

```bash
pnpm test:balatro:e2e --project harness
pnpm test:balatro:e2e --project engine
pnpm exec tsx testing/balatro-e2e/engine/cli.ts [--filter text] [--spec name] [--shot out.png] [--serve]
```

## Engine-spec harness

`engine/page/entry.ts` boots the game exactly as `/balatro` does (`lib/balatro/runtime.ts`,
the committed core pack in `data/balatro-pack`, `public/balatro/engine`) from a static
server (`lib/static-server.ts`) — no account, hub or database. It writes
`lib/balatro/lua/mp_test/**` to `/Balatro/rmh_mp_test`, the marker `/rmh/test/enabled`,
and appends `require "rmh_mp_test.harness"` to `main.lua`. The page and Lua talk over
`/rmh/test/{cmd,res}` (`lib/channel.ts` ↔ `mp_test/harness.lua`). `?mp=1` also extracts
the MP pack once `lib/balatro/game-pack.json` lists one.

A spec is plain Lua with the L1 API (`describe/it/expect`) plus `wait_frames`,
`wait_until`, `sleep`, `AP` (the autopilot) and `report(key, value)` — reports come
back to vitest, which compares them across boots. A Lua error stops the game and fails
the run with its traceback (the harness replaces Balatro's blocking error screen).

## Autopilot (test-only)

`lib/balatro/lua/mp_test/autopilot.lua`: `start_run`, `select_blind`, `skip_blind`,
`play`, `discard`, `set_chips`, `win_blind`, `cash_out`, `shop_digest`, `buy`, `reroll`,
`open_pack`, `pick`, `skip_pack`, `leave_shop`, `use`, `give`, `state`, `wait_state`,
plus MP actions routed to `MP.test`. It installs only when `/rmh/test/enabled` exists,
and ships in no pack. In a test build (`VITE_BALATRO_MP_TEST=1`)
`lib/balatro/mp/test-hooks.ts` writes it and exposes `window.__balatroMp.cmd(…)`
(`test_cmd`/`test_res` over the mailbox); `scripts/balatro/bundle-budget.ts` fails if
`__balatroMp` reaches a production bundle.

## Chromium

Playwright's own build, or `CHROME_PATH=/path/to/chrome` (as `scripts/epic/browser.ts`).
WebGL runs on SwiftShader (`lib/chromium.ts`). A boot takes 20–90 s on a busy machine;
`BALATRO_E2E_BOOT_TIMEOUT_MS` (default 240 000) bounds it.

## Match stack — local requirements

The match project needs what CI provides:

1. Postgres 16 (CI: `pgvector/pgvector:pg16`) with the schema:
   `DATABASE_URL=postgresql://… pnpm exec prisma migrate deploy`.
2. `DATABASE_URL` and `BETTER_AUTH_SECRET` (32+ chars) in the environment. The suite
   then spawns the hub (`tsx server/socket-server/index.ts`, port 7001) and `vite dev`
   (port 7997, `VITE_BALATRO_MP_TEST=1`), waits for both, and signs up one account per
   browser context through `/api/auth/sign-up/email` (`lib/accounts.ts`).
   Ports: `BALATRO_E2E_WEB_PORT`, `BALATRO_E2E_HUB_PORT`; logs: `BALATRO_E2E_LOG_DIR`.
3. Or attach to a stack you started yourself: `BALATRO_E2E_BASE_URL=http://localhost:7997`
   (and `BALATRO_E2E_SOCKET_URL`, default `http://localhost:7001`).

Without either the project skips; `BALATRO_E2E_REQUIRE_MATCH=1` (CI) makes that a failure.
