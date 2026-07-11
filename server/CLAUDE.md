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

| Service | Runtime | Port | Entry |
|---|---|---|---|
| `web` (Nitro SSR) | **Node** | 7005 (blue/green spare: 7015) | `.output/server/index.mjs` |
| `socket` (games hub) | **Node** | 7001 | `dist-server/server/socket-server/index.cjs` |
| `rmhbox` (party games) | **Node** | 7676 | `dist-server/server/rmhbox/index.cjs` |
| `rmhtube` (watch together) | **Node** | 7003 | `dist-server/server/rmhtube/index.cjs` |
| `ladder-worker` (job cron) | **Node** | — | `dist-server/server/ladder-worker/index.cjs` |
| `supervisor` (5 background workers) | **Go** | 9090 (metrics) | `/app/bin/supervisor` |
| `status` | **Go** | 7008 | `/app/bin/status` |
| `assets` | **Go** | 7007 | `/app/bin/assets` |
| `minio` | infra | 9000/9001 | S3-compatible store |

Consequences:

- `server/doctrine-worker/`, `server/vibe-worker/`, `server/bot-worker/`,
  `server/recap/`, `server/status/` are **replaced by Go** (they run as
  goroutines inside the Go `supervisor`, or as the Go `status` binary). Their
  Node source remains only as a documented rollback path — it is not built by
  `pnpm build` and not run in prod.
- The Go realtime hubs (gamehub/rmhbox/rmhtube/rmhmusic/gateway) exist but are
  **not** in the production request path — Apache routes `/socket/`,
  `/rmhbox-ws/`, `/rmhtube-ws/` and `/` straight to the Node ports.

## Directory guide

### Active in production

- **`socket-server/`** — unified Socket.IO hub, port 7001, path `/socket/`.
  Hosts ~18 games/apps on one default namespace: Slice It, Neon Driftway,
  Synapse Storm, RMH Type, RMH Study, Altair, Kowloon Knockout, Rochester
  Offensive, **RMHMusic**, casino games (Blackjack/Hold'em/Baccarat/Roulette),
  Lights Out, Doctrine, Velum, Dream Rift, RMH Farming Sim.
  - **Soft auth**: anonymous connections allowed; a valid Better Auth session
    token attaches `socket.data.userId/userName/avatarUrl`.
  - **Handler contract**: `handlers/<game>.ts` exports
    `register<Game>Handlers(io, socket)` + `handle<Game>Disconnect(io,
    socket)` (casino games also `initialize<Game>(io)` at boot). Registered
    per-connection in `index.ts`. Isolation is by event-name prefix
    (`rmhtype:*`, `altair:*`, `bj:*`, …) + socket.io rooms — **no namespaces**.
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
  - Lobbies are in-memory only (lost on restart); 120s disconnect grace;
    match results persist fire-and-forget via `leaderboard.ts`.
- **`rmhtube/`** — watch-together hub, port 7003, path `/rmhtube-ws/`.
  Hard auth. Leader-authoritative sync (2s heartbeat), media queue, chat.
  **Restores rooms from DB on boot** (unlike rmhbox).
- **`rmhmusic/`** — collaborative listening. **Not a standalone server**: its
  RoomManager/SyncEngine/QueueManager/ChatHandler mount inside socket-server
  (port 7001) via `socket-server/handlers/rmhmusic.ts`. Auth required.
  (The standalone rmhmusic:7002 is the Go hub, k3s-only.)
- **`ladder-worker/`** — RMHLadder job-discovery cron. No port. `node-cron`
  schedule `LADDER_CRON_SCHEDULE` (default every 6h) around
  `lib/rmhladder/pipeline`. Self-bootstraps an empty DB on startup
  (seed → probe sources → run pipeline). Manual triggers:
  `pnpm ladder:seed | ladder:probe | ladder:run`.
- **`nitro/`** — not a service: Nitro startup plugins for the web tier,
  registered in `vite.config.ts`. `reflect-metadata.ts` (required by the
  Better Auth passkey plugin — do not remove) and `security-headers.ts`
  (defense-in-depth response headers).
- **`shared/`** — `createLogger(service)` (structured JSON lines),
  `createServerPrismaClient(logger)` (`@prisma/adapter-pg`, pool
  `SERVER_DB_POOL_SIZE` default 5), `createRateLimiter(rules)` (per
  `socketId:event` sliding window). **Auth and room/lobby abstractions are NOT
  shared** — each hub owns its own.

### Fallback only (replaced by Go — do not extend)

`doctrine-worker/` (daily puzzle gen, reputation decay), `vibe-worker/`
(Playwright thumbnail renderer), `bot-worker/` (synthetic AI feed users),
`recap/` (Lights Out Discord recaps), `status/` (status page). New work on
these behaviors belongs in `go-services/internal/<svc>/` — see
`go-services/CLAUDE.md`.

## Dev, build, prod

- **Dev:** `pnpm dev` = concurrently Vite (7005) + socket-server + rmhbox +
  rmhtube + ladder-worker, each under `tsx watch`. The replaced workers do
  not run in dev.
- **Build order is load-bearing:** `pnpm build` = build-vibe-packages →
  `vite build` → esbuild bundles exactly **4 entrypoints**
  (socket-server, rmhbox, rmhtube, ladder-worker) into `dist-server/**/*.cjs`
  with `--packages=external` (deps, including the generated Prisma client,
  resolve at runtime — `prisma generate` must have run).
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
- Apache maps the external paths to loopback ports; health checks live at
  `<origin>/socket/health` etc.

## Gotchas

1. **Single-instance assumption.** All hub state is process-local; there is no
   socket.io Redis adapter. Don't design for horizontal scaling here — that's
   what the Go fleet's Redis backplane is for.
2. Auth strictness differs by hub: socket-server soft, rmhbox/rmhtube/rmhmusic
   hard.
3. rmhtube persists rooms; rmhbox doesn't.
4. Leaderboard/match writes are fire-and-forget — never block gameplay on DB
   success.
5. Per-socket rate limits reset on reconnect; the rule maps in each
   `config.ts` are the de-facto event allowlists.
6. `tsconfig.server.json` includes more than gets bundled — esbuild's 4
   entrypoints are the truth.
