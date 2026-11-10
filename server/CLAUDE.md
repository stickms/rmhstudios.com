# server/ — Node service tier (realtime hubs + workers)

> Scope: guidance for working inside `server/`. Repo-wide context:
> [`/CLAUDE.md`](../CLAUDE.md). The Go ports of these services:
> [`go-services/CLAUDE.md`](../go-services/CLAUDE.md). Runtime topology &
> deploy: [`docs/architecture.md`](../docs/architecture.md).

## Read this first: what actually runs in production

Two runtimes coexist. The Node services here are the originals;
`go-services/` contains Go ports of most of them. **The source of truth for
what runs in production is the `command:` lines in `docker-compose.yml`** —
not the README, not old docs.

Current production (Docker Compose on the VPS):

| Service                             | Runtime  | Port                          | Entry                                        |
| ----------------------------------- | -------- | ----------------------------- | -------------------------------------------- |
| `web` (Nitro SSR)                   | **Node** | 7005 (blue/green spare: 7015) | `server/web-cluster.mjs` → `.output/server/worker.mjs` |
| `socket` (games hub)                | **Node** | 7001                          | `dist-server/server/socket-server/index.cjs` |
| `rmhbox` (party games)              | **Node** | 7676                          | `dist-server/server/rmhbox/index.cjs`        |
| `rmhtube` (watch together)          | **Node** | 7003                          | `dist-server/server/rmhtube/index.cjs`       |
| `ladder-worker` (job cron)          | **Node** | —                             | `dist-server/server/ladder-worker/index.cjs` |
| `homes-worker` (listings cron)      | **Node** | —                             | `dist-server/server/homes-worker/index.cjs`  |
| `jobs` (pg-boss async backbone)     | **Node** | —                             | `dist-server/server/jobs/index.cjs`          |
| `supervisor` (discord-bot)          | **Go**   | 9090 (metrics)                | `/app/bin/supervisor`                        |
| `status`                            | **Go**   | 7008                          | `/app/bin/status`                            |
| `assets`                            | **Go**   | 7007                          | `/app/bin/assets`                            |
| `minio`                             | infra    | 9000/9001                     | S3-compatible store                          |

Consequences:

- `server/status/` was **replaced by Go** (the Go `status` binary) and its
  dead Node source was **deleted in the rewrite reap (R0-T5)**; `server/vibe-worker/` and `server/bot-worker/` were deleted too and
  their Go replacements have since moved to the `jobs` worker (D3, below) — recover from
  git history (or the `pre-rewrite-*` tags) if a rollback ever needs them.
- The Go realtime hubs (gamehub/rmhbox/rmhtube) and the `gateway` were
  **removed in the rewrite** — they never served production traffic. Apache
  routes `/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/` and `/` straight to the Node
  ports; these hubs here are the realtime tier. RMHMusic (the piano & guitar
  learning app) has no hub or socket handler: it is web tier only, over HTTP
  routes under `app/routes/api/rmhmusic/learn/`.

## Directory guide

### Active in production

- **`socket-server/`** — unified Socket.IO hub, port 7001, path `/socket/`.
  Hosts many games/apps on one default namespace: Slice It, Neon Driftway,
  Synapse Storm, RMH Type, RMH Study, Altair, Kowloon Knockout, Rochester
  Offensive, casino games (Blackjack/Hold'em/Baccarat/Roulette),
  Lights Out, Doctrine, Velum, Dream Rift, RMH TF2 (server
  browser and peer-to-peer signaling only — every match runs in a player's
  browser; see `docs/tf2-game.md` §Multiplayer hosting; Hearthworks
  co-op signaling and host migration, `features/hearthworks/server/p2p.ts` over the
  generic `p2p/signal-hub.ts`, contract `features/hearthworks/engine/net/events.ts` — the hub
  never carries game state).
  - **Soft auth**: anonymous connections allowed; a valid Better Auth session
    token attaches `socket.data.userId/userName/avatarUrl`.
  - **Handler contract**: `handlers/<game>.ts` exports
    `register<Game>Handlers(io, socket)` + `handle<Game>Disconnect(io,
socket)` (casino games also `initialize<Game>(io)` at boot, and a
    `…OnShutdown()` (casino: now `features/casino/server/`, order in `CASINO_SHUTDOWN_REFUNDS`) that `shutdown()` in `index.ts` calls before `io.close()` to
    refund every debited-but-unsettled stake and kill the tables — contract in
    `features/casino/server/casino-shutdown.ts`; a new casino game needs one). Registered
    per-connection in `index.ts`. Isolation is by event-name prefix
    (`rmhtype:*`, `altair:*`, `bj:*`, …) + socket.io rooms — **no namespaces**.
  - **Feature handlers (redesign A1):** a moved feature keeps its handlers in
    `features/<id>/server/` and default-exports one `FeatureSocketServer` from
    `features/<id>/server/index.ts`; `socket-server/features.ts` lists them and `index.ts`
    calls `registerFeatureHandlers` / `handleFeatureDisconnects` at the spot the
    hand-written calls sat (list order = registration order). Balatro is the first
    (`features/balatro/server/{p2p,queue}.ts`, hub state in `server/hub/`). The Dockerfile
    `server-builder` stage copies `features/` as well as `server/` and `lib/`.
  - The rate-limit rule map in `config.ts` doubles as the catalog of valid
    inbound events — add new events there.
  - State: module-level in-memory `Map`s. Persistence (leaderboards, match
    results) via Prisma on completion.
- **`rmhbox/`** — party-game lobby hub, port 7676, path `/rmhbox-ws/`.
  **Hard auth** (Better Auth session OR Discord Activity OAuth token; unlinked
  Discord users get transient `discord:<id>` identities).
  - Lobby FSM: `WAITING → (VOTING|GAME_SETTINGS) → INSTRUCTIONS → PRELOADING →
COUNTDOWN → PLAYING → ROUND_RESULTS → WAITING` (+ `SESSION_RESULTS`,
    `DISBANDED`), driven by `StateSyncService` timers; host controls
    (skip/end/pause).
  - **Adding a minigame** requires touching THREE places: (1)
    `minigames/<id>/handler.ts` extending `BaseMinigame` (implement `start`,
    `handleInput`, `getStateForPlayer`, `getStateForSpectator`,
    `computeResults`, `spectatorMode`); (2) register the class in
    `MINIGAME_SERVER_REGISTRY` in `game-coordinator.ts` (import + map entry);
    (3) add client metadata + settings schema in
    `lib/rmhbox/minigame-registry.ts`. The two registries must stay in sync.
  - Lobbies live in memory; 15 s disconnect grace (`PEER_GRACE_MS`); match
    results persist fire-and-forget via `leaderboard.ts`.
  - **Durable lobbies (redesign D2 step 2, OFF by default).** Enabled only when
    `RMHBOX_DURABLE_LOBBIES=1` AND `REDIS_STATE_URL` (the `redis-state` plane:
    AOF, noeviction — never the cache-plane `REDIS_URL`) is reachable at boot;
    otherwise `openLobbyStore()` returns `null`, no hook is installed and lobbies
    are lost on restart exactly as before. `lobby-store.ts` holds the pure
    `serializeLobby` / `deserializeLobby` / `planRestore`, the `LobbyStore`
    contract and its Redis (`rmhbox:lobby:<id>` JSON `{ v: 1, … }`, 30 min TTL
    refreshed per save, set index `rmhbox:lobbies`) and in-memory
    implementations. `lobby-persistence.ts` wires it in: `LobbyManager.markChanged`
    (called from `broadcastAction`, except `TIMER_TICK`, and from
    `StateSyncService.broadcastFullSync`, lobby creation and session end) arms one
    coalesced save per lobby (500 ms); disband removes the key; `shutdown()` in
    `index.ts` awaits a full `saveAll()` before exit (bounded by the forced-exit
    timer); boot restores before `listen()`.
    **Survives a restart:** the lobby, host, settings, seats, cumulative scores,
    match history, round number, chat, the Discord voice-channel binding.
    **Does not:** a round in progress (or a vote / game-settings draft) — the
    lobby returns to `WAITING` with "The server restarted; the round was
    cancelled.", round scores cleared. Lobbies in `SESSION_RESULTS` are not
    restored. Every restored member starts disconnected: players get the normal
    grace hold, spectators one grace window, so a lobby nobody returns to
    disbands as it does today; `attemptReconnect` hands a returning user their
    seat because `userToLobby` is restored. Sequence numbers continue
    `RESTORED_SEQ_GAP` above the stored value. Corrupt or wrong-version entries
    are logged and deleted. Tests: `rmhbox/__tests__/durable-lobbies.test.ts`.
- **`rmhtube/`** — watch-together hub, port 7003, path `/rmhtube-ws/`.
  Hard auth. Leader-authoritative sync (2s heartbeat), media queue, chat.
  **Restores rooms from DB on boot** (rmhbox restores lobbies only with durable lobbies on; see above).
- **`ladder-worker/`** — RMHLadder job-discovery pipeline consumer. No port. The
  schedule is a **pg-boss cron** (queue `ladder.pipeline`, `exclusive`, UTC,
  `LADDER_CRON_SCHEDULE`, default every 12h): the worker registers the queue +
  schedule through `lib/jobs/scheduled-consumer.server.ts` and consumes it, the
  `jobs` worker's timekeeper fires it (D4: there is no `node-cron` anywhere). The
  DB worker-lease stays as a second guard against a redelivered run. Self-bootstraps
  an empty DB on startup (seed → probe sources → queue a run if empty/stale). Manual
  triggers: `pnpm ladder:seed | ladder:probe | ladder:run`. The daily data-lifecycle
  cleanup that used to live here is the `ops.data-cleanup` cron in `jobs`
  (`lib/cleanup-job.server.ts`).
- **`homes-worker/`** — RMHHomes listings-scraper consumer. No port. pg-boss cron
  (queue `homes.scrape`, `exclusive`, UTC, `HOMES_CRON_SCHEDULE`, default every 6h),
  same `scheduled-consumer` pattern as the ladder worker. Aggregates public housing
  feeds (Craigslist/RSS) into `EXTERNAL` `HomeListing` rows and notifies
  watchers. Self-bootstraps default sources + a first run on an empty DB. Built
  by `pnpm build` and run as its own compose service.
- **`jobs/`** — the durable async backbone (rewrite R2). No port. A **pg-boss**
  consumer that drains queues and runs background work that used to block
  request handlers: `engagement.progression` (achievements/XP/quests/webhooks),
  `event.reminder` (T-24h/T-15m RSVP reminders), and the `email.weekly-digest`
  cron. D3 ports from the Go supervisor: `streak.reminder-sweep` (hourly),
  `lights-out.recap` (Lights Out → Discord recap, every 5 min; REST only, no gateway presence),
  `bot-worker.*` (the RMHark synthetic users, `lib/rmhark-ai/bot-worker.server.ts`: `maintain` every minute
  gated by the admin interval, `post` / `reply` every `BOT_POST_TICK_MS` / `BOT_REPLY_TICK_MS` (default 5 min),
  `dm` every `BOT_DM_TICK_MS` (default 1 min); registers nothing without `DEEPSEEK_API_KEY`),
  `vibe-worker.thumbnails` (RMHVibe gallery thumbnails, `lib/rmhvibe/thumbnail-worker.server.ts`: every minute, up to 5
  `thumbnailStale` pages per batch (drains while batches are full and progressing), Playwright against the OS
  Chromium (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, in the slim image's `runtime-chromium` layer; the `jobs`
  service has `mem_limit` 1280m and `HOME=/tmp` for it), WebP to object storage, optimistic `updatedAt` clear;
  `exclusive`, no retries; always registered),
  and `doctrine.*` (`daily-puzzles` 00:00 UTC + at boot, `sahur-activation` every minute,
  `reputation-decay` hourly on Mondays; `features/doctrine/engine/jobs.server.ts`). The status service
  watches the recap and sahur queues in pg-boss (B06) and `doctrine_puzzle` itself (A19). Hourly `ops.deepseek-balance` (`:05` UTC, `lib/jobs/maintenance.server.ts`)
  samples the DeepSeek account balance into `deepseek_balance_snapshot` for
  `/admin/deepseek` and prunes rows older than 400 days; it skips silently when
  `DEEPSEEK_API_KEY` is unset.
  `ops.data-cleanup` (daily 04:00 UTC session/verification/notification/comment-view purge, `exclusive`, no retries).
  **The Discord bot** (D3, `server/discord-bot/`: Alex `/chat` + the tamagotchi + the `/sohumtracker` tracker, a port of
  `go-services/internal/discordbot`) runs here only with `DISCORD_BOT_RUNTIME=node`: the gateway (`@discordjs/ws`,
  REST via `@discordjs/rest`, both imported only then) lives in this process, and its Go tickers are the crons
  `discord-bot.care-tick` (`6-59/10`), `discord-bot.watch-flush` (every minute), `discord-bot.watch-identity` (`:23`)
  and `discord-bot.watch-summary` (`11-59/30`), each a no-op until READY. Unset, the Go supervisor runs the bot. On
  SIGTERM it closes the gateway, lets in-flight replies finish (`DISCORD_BOT_DRAIN_GRACE`, 60 s, beside pg-boss's 30 s;
  `stop_grace_period` is 90 s) and closes the tracker's open sessions. `guard.ts` holds the live-test limits
  (`DISCORD_BOT_GUILD_ALLOWLIST`, `DISCORD_BOT_CHANNEL_ALLOWLIST`): never set them in production.
  Owns pg-boss queue maintenance/scheduling (the web tier is send-only). **It is the only scheduler (D4):** background
  work is a pg-boss cron here, or a queue its own worker consumes (ladder, homes); `lib/__tests__/scheduler-ratchet.test.ts`
  allowlists the per-process `setInterval`s that remain (SSE keepalives, cache GC, hub game ticks) and fails on a new one.
  Degrades safely: with no `DATABASE_URL` it exits and the web tier runs the
  work inline. Logic lives in `lib/jobs/` + `lib/social/engagement-effects.server.ts`.
  `jobs/index.ts` is a boot sequence plus one `REGISTRATIONS` table (a new queue
  family is one row; `registry.ts` isolates failures and logs `jobs.started` /
  `jobs.register_failed`). `jobs/queue-policy.ts` wraps the pg-boss instance the
  `register*` functions get: scheduled queues are polled every 5-30 s instead of
  pg-boss's 2 s default (unscheduled, user-fed queues keep 2 s), and its
  `SCHEDULE_OVERRIDES` table spreads the `*/N` sweeps off minute 0 — a new
  sweep should pick an offset there. Heavy SDKs (`openai`, `sharp`, `undici`)
  are imported on first use in their leaf modules, not at load, so the idle
  worker does not carry them.
- **`nitro/`** — not a service: Nitro startup plugins for the web tier,
  registered in `vite.config.ts`. `reflect-metadata.ts` (required by the
  Better Auth passkey plugin — do not remove), `security-headers.ts`
  (defense-in-depth response headers), `anon-html-cache.ts` (marks anonymous
  default-locale HTML on an audited path allowlist edge-cacheable, and
  authenticated HTML `private, no-cache` — never `no-store`, which would cost
  every signed-in page its back/forward-cache eligibility), and `warmup.ts`
  (per-worker cold-start warmup: opens the Prisma pool + primes the anon
  homepage feed/sidebar caches so the first request after a deploy/restart
  isn't cold).
- **Metrics** — every Node process runs the `lib/perf/` collector
  (`process-metrics.ts`); each hub serves `GET /internal/metrics` (compose-network
  only, optional `INTERNAL_METRICS_TOKEN`), web workers and `jobs` publish to Redis.
  Read at `/admin/performance`; see `docs/runbooks/performance-metrics.md`.
- **`web-cluster.mjs`** — the web container's PID 1 (Dockerfile `CMD`). A
  cluster primary that runs Nitro's `.output/server/worker.mjs` × `WEB_WORKERS`,
  REPLACES a worker that exits (logging its exit code or signal; `SIGKILL` is
  the OOM killer) and forwards SIGTERM so the workers drain. It exists because
  Nitro's own node-cluster primary forks once and never replaces a worker: two
  deaths took the whole container down (2026-10-21). Tested by
  `server/__tests__/web-cluster.test.ts`.
- **`shared/`** — `createLogger(service)` (structured JSON lines),
  `createServerPrismaClient(logger)` (`@prisma/adapter-pg`, pool
  `SERVER_DB_POOL_SIZE` default 5), `createRateLimiter(rules)` (per
  `socketId:event` sliding window), `session-auth.ts` (the ONE Better Auth session
  check — see Auth below) and `redis-adapter.ts` (opt-in Socket.IO Redis
  adapter). **Room/lobby abstractions are NOT shared** — each hub owns its own.

### Deleted (replaced by Go)

The dead Node fallbacks — `vibe-worker/` (Playwright thumbnail renderer), `bot-worker/` (synthetic
AI feed users), `status/` (status page) —
were removed in the rewrite reap (R0-T5). `status` lives in
`go-services/internal/status/` (the Go `status` binary) — see `go-services/CLAUDE.md`; the bot-worker and the vibe-worker now run in `jobs`. Recover the old Node source from git
history if a rollback ever needs it.

## Dev, build, prod

- **Dev:** `pnpm dev` = concurrently Vite (7005) + socket-server + rmhbox +
  rmhtube + ladder-worker + homes-worker + jobs, each under `tsx watch`. The
  Go-replaced workers (vibe/discord-bot/status) do not run in dev (the Node discord-bot starts in `jobs` only with
  `DISCORD_BOT_RUNTIME=node` and a token). The recap, doctrine and bot-worker crons run in `jobs` (D3), so they do (the bot-worker idles without `DEEPSEEK_API_KEY`).
- **Build order is load-bearing:** `pnpm build` = build-vibe-packages →
  `vite build` → esbuild bundles exactly **6 entrypoints**
  (socket-server, rmhbox, rmhtube, ladder-worker, homes-worker, jobs) into
  `dist-server/**/*.cjs` with `--packages=external` (deps, including the
  generated Prisma client, resolve at runtime — `prisma generate` must have run).
- **Adding a new Node service** requires editing the `build` and `start`
  scripts in `package.json` AND `docker-compose.yml`. Ask whether it should
  be a Go worker instead (that's the migration direction).
- **Prod:** Docker Compose via `deploy.sh` — **not PM2** (old README claim).
  Web deploys blue/green via `deploy/hotswap-web.sh` (spare port 7015,
  health-gated Apache flip).

## Client connection conventions

- Env: `VITE_SOCKET_URL`, `VITE_RMHBOX_SOCKET_URL`, `VITE_RMHTUBE_SOCKET_URL`
  (baked at build time as compose build args).
- Each app has a client singleton `lib/<app>/socket.ts`
  (`connect<App>()`, `getSocket()`, `disconnect<App>()`) that must pass the
  matching `path` (`/socket/`, `/rmhbox-ws/`, `/rmhtube-ws/`).
- Auth handshake: socket.io `auth` callback sends `{ token }` (Better Auth
  session; rmhbox also accepts `{ discordToken, channelId, guildId }`).
- Event names: `<app>:<domain>:<action>` client→server; server→client names
  are centralized in `lib/<app>/events.ts` and imported by **both** sides —
  never inline event strings.
- Apache maps the external paths to loopback ports. Each hub serves
  `{"status":"ok","uptime":N}` at the **root `/health` of its own listener**;
  the public `<origin>/socket/health` · `/rmhbox-ws/health` · `/rmhtube-ws/health`
  paths are an Apache rewrite ONTO that endpoint, not a second one — and they
  only exist once `deploy/apache/rmhstudios.conf` has been hand-installed on the
  VPS (the deploy never touches `/etc/apache2`). The status service probes the
  internal `/health` for exactly that reason (`go-services/cmd/status`).

## Gotchas

1. **Single-instance assumption.** All hub state is process-local. The
   `@socket.io/redis-adapter` is wired in each hub but OFF unless
   `REALTIME_REDIS_ADAPTER=1` (and `REDIS_URL` reachable at boot;
   `shared/redis-adapter.ts`; otherwise logged, in-memory adapter, hub still
   starts) but that only lays the backplane: **room/lobby/
   stake state still lives in process memory**. rmhbox's opt-in durable lobbies
   (above) survive a restart of ONE instance; they are not a shared live store
   (each process still owns its Maps), so running two replicas is NOT yet safe.
   Do not raise replica counts.
2. **Auth.** Every hub validates a Better Auth session through
   `shared/session-auth.ts` (`createSessionAuth().resolveSocketSession`): the
   credential is the raw token in socket.io `handshake.auth.token` (no hub
   reads cookie/bearer/`?token=`; widening that is a deliberate security change
   in `extractSessionToken`), a `session JOIN user` lookup, expiry check, and a
   bounded 60 s positive cache (`createAuthCache`). Hubs only adapt the result:
   socket-server soft (non-ok = anonymous), rmhbox/rmhtube hard
   (`AUTH_REQUIRED` / `AUTH_FAILED` / `SESSION_EXPIRED`). Discord Activity OAuth
   (rmhbox `discordToken`, socket-server `discordToken`) is a different
   credential and stays in the hubs.
3. rmhtube persists rooms; rmhbox persists lobbies only with
   `RMHBOX_DURABLE_LOBBIES=1` + `REDIS_STATE_URL` (off by default), and never a
   round in progress.
4. Leaderboard/match writes are fire-and-forget — never block gameplay on DB
   success.
5. Per-socket rate limits reset on reconnect; the rule maps in each
   `config.ts` are the de-facto event allowlists.
6. `tsconfig.server.json` includes more than gets bundled — esbuild's 6
   entrypoints (socket-server, rmhbox, rmhtube, ladder-worker, homes-worker,
   jobs) are the truth.
7. **Server code imports `lib/` RELATIVELY, never through `@/`.** esbuild does
   apply the `paths` map in `tsconfig.server.json`, so `@/lib/x` resolves —
   right up until the file isn't in the image's build context (gotcha 8). Then
   the map misses, the specifier falls back to looking like a package name, and
   `--packages=external` emits a literal `require("@/lib/x")` with no error at
   all. It throws `MODULE_NOT_FOUND` on load, which for a top-level import means
   the service dies on start. That is how the whole socket hub shipped dead once
   — every casino table and multiplayer game unreachable — off one
   `@/lib/economy/ledger-core`. A relative specifier fails loudly at build time
   instead, which is the entire reason for this rule.
8. **Don't import outside `server/`, `lib/` and `features/`.** The `server-builder` stage
   copies exactly those three trees (`features/` since A1: moved handlers live there), so `pnpm build` (whole working tree) can
   pass while the image build fails with "Could not resolve" — or, via gotcha
   7, doesn't fail at all and ships a bundle that crashes on boot. A new
   `lib/` import is now free (the stage copies `lib/` wholesale; it used to be
   a curated per-module `COPY` list, and adding one import to a handler was a
   deploy-time build break). Reaching into `components/`, `stores/` or
   `hooks/` is still the old failure, so shared code belongs in `lib/`.
   `lib/__tests__/server-bundle-copies.test.ts` walks the real import graph
   (following `@/…` as well as relative specifiers) and catches this in
   `web-ci`, before it reaches main.

## Before you commit to `server/`

`pnpm check:consistency` (repo `CLAUDE.md` → "The commit gate") runs before
every commit; it includes `lib/__tests__/server-bundle-copies.test.ts`, which
is the only thing standing between a new `lib/` import and a service that dies
on boot. Also confirm:

- [ ] **Relative imports into `lib/`, never `@/`** (gotcha 7) — a relative
      specifier fails loudly at build time; `@/` can ship a bundle that throws
      `MODULE_NOT_FOUND` on start.
- [ ] **Nothing is imported from outside `server/` and `lib/`** (gotcha 8) —
      those are the only trees the image's build context carries, and
      `pnpm build` passing says nothing about the image build.
- [ ] **The event name lives in `lib/<app>/events.ts`** and both sides use it;
      per-socket rate-limit rule maps in each `config.ts` are the de-facto
      event allowlist, so a new event needs an entry or it is silently dropped.
- [ ] **Auth strictness matches the hub** (socket-server soft; rmhbox / rmhtube
      hard), and gameplay never blocks on a leaderboard/match write.
- [ ] **No new cron or `setInterval` sweep** — periodic background work is a
      pg-boss cron registered in `jobs/index.ts` (`exclusive` where reentrancy
      matters, a deliberate `retryLimit`, ticks that catch their own errors).
      `scheduler-ratchet.test.ts` fails on a new server-side `setInterval`.
- [ ] The service still starts: `pnpm dev` boots all six workers/hubs, and a
      broken import surfaces immediately there.
