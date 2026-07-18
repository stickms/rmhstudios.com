---
doc: full-rewrite-design
version: 2
date: 2026-07-18
baseline_commit: efb6269
repo: stickms/rmhstudios.com
status: design
audience: [llm-agents, humans]
machine_readable: true
supersedes: []
builds_on:
  - docs/performance-audit-2026-07-17.md # per-request fixes; largely implemented
  - docs/scalability-audit-2026-07-17.md # scale roadmap; Phase-1 items largely implemented
  - docs/feed/plan.md # feed phases 0/1/3 shipped; 2/4 gated
owner_decisions:
  - id: OD-1
    date: 2026-07-18
    decision: 'docs/ and public/ contents stay in the repo; no media relocation, no history rewrite'
conventions:
  task_id: '<phase>-T<n> (stable; never renumber)'
  file_paths: 'repo-relative'
  sql: 'PostgreSQL 16+ unless noted; templates marked TEMPLATE need per-env values'
  verify: 'shell commands run from repo root unless noted'
---

# Full Rewrite Design & Implementation Spec — rmhstudios.com

This document is both the **design rationale** (§1–§7) and the **executable
implementation spec** (§8–§10) for a ground-up rewrite of the platform's
architecture: serving topology, database, async backbone, frontend/build, and
the deletion of every verified-unused subsystem.

## How to use this document (agents)

1. Work phase-by-phase (§8). Never start a task whose `depends_on` is not
   `done`. Never start a phase before the previous phase's `exit_gate` passes.
2. Each task block is self-contained: `files`, `steps`, `verify`,
   `acceptance`, `rollback`. Run every `verify` command; a task is `done` only
   when all `acceptance` items hold.
3. Inventories in §9 are **exact and verified** against `main@efb6269`
   (2026-07-18). Re-verify any inventory item with the given `reverify`
   command before acting on it — the tree moves fast (111 migrations in 18
   weeks).
4. Baseline commands that must stay green after every task:
   ```bash
   pnpm exec tsc --noEmit          # needs NODE_OPTIONS=--max-old-space-size=8192 until R3-T1
   pnpm lint
   pnpm exec vitest run
   pnpm build
   (cd go-services && make gazelle && make test)   # only when go-services/ touched
   ```
5. Repo conventions that bind every task: no new type/lint warnings vs base
   branch; `routeTree.gen.ts` is generated, never edited; CSP/security headers
   change in BOTH `deploy/apache/rmhstudios.conf` and the Helm Traefik
   middleware; `.server.ts` modules never imported from client code;
   user-facing strings via `t()` + `pnpm i18n:extract`.

---

## 1. Verdict and scope

The stack of record — TanStack Start + Vite 8 + React 19 + Nitro, PostgreSQL +
Prisma 7, Better Auth, Socket.IO Node hubs, Go worker fleet — **survives**.
The July 2026 audits already fixed the per-request layer (indexes, caches,
bounded queries, keyed SSE, SSR i18n trim, multi-core SSR, edge cache). What
this rewrite changes is the **structure** that patches cannot reach:

| id  | Today (verified)                                                                                         | Target                                                                                                           |
| --- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| S-1 | 1 Prisma schema, 225 models, ~25 products, 1 shared pool                                                 | 6 Postgres schemas, per-domain roles + PgBouncer budgets, partitioned + TTL'd hot tables, 10 dead tables dropped |
| S-2 | 1 SPA route tree: 616 route files, 13,731-line `routeTree.gen.ts`, feed + 20 games + 8 apps in one graph | SSR **platform app** (shell/feed/content/API) + per-game/app **static client bundles** in a pnpm workspace       |
| S-3 | 3 realtime systems (web SSE bus; Node Socket.IO hubs; unshipped Go gateway+hub fleet)                    | 2 (SSE bus + Node hubs on flag-gated Redis adapter); Go realtime duplicate **deleted**                           |
| S-4 | 3 async mechanisms (2 Node cron containers, Go supervisor tickers, in-process timers), **no queue**      | pg-boss (Postgres) + one `jobs` container + Go supervisor; ladder/homes cron containers retired                  |
| S-5 | 164 npm deps (~27 dead/misclassified), 5 dead Node worker dirs, ~10 dead DB models, dead `cmd/ledger`    | all deleted; dependency budget enforced in CI                                                                    |
| S-6 | **Zero DB backups**; single Redis 320MB `allkeys-lru` also holding dirty counters                        | backups+WAL precondition; Redis split cache/state                                                                |

Out of scope by owner decision **OD-1**: any change to `docs/` (245 MB) or
`public/` (276 MB) contents, media relocation, git-history rewriting.

Rejected alternatives (§11): framework/language migration, microservices,
finishing the Go hub port, Kafka/NATS, renaming `rmheet*` tables, migrating
existing cuid PKs.

---

## 2. Performance contract

Budgets are CI gates from R0-T3 (warn) and R3-T1 (block). "Done" = green in
production RUM, not merged code.

```json
{
  "user_facing_p75": {
    "ttfb_anon_edge_cached_ms": 100,
    "ttfb_authed_ssr_ms": 400,
    "lcp_mobile_ms": 2000,
    "inp_ms": 200
  },
  "payload_budgets_brotli_kb": {
    "platform_shell_eager_js": 300,
    "platform_eager_css": 40,
    "game_or_app_entry_eager_js_excl_engine_chunk": 500
  },
  "backend_p99": {
    "hot_read_api_ms": 250,
    "social_schema_statement_ms": 50,
    "web_event_loop_lag_ms": 100,
    "db_pool_wait_ms": 10
  },
  "realtime": {
    "sse_fanout": "O(interested_clients)",
    "deploy_to_restored_realtime_s": 30
  },
  "operational_floors": {
    "backup": "nightly pg_dump to R2 + WAL archiving; restore drill quarterly",
    "redis_state_keys_survive_eviction": true,
    "big_table_index_builds": "CREATE INDEX CONCURRENTLY, out-of-band from prisma migrate deploy"
  }
}
```

Current measured baselines: platform shell eager JS ≈ 334 KB brotli;
`globals.css` = 2,129 lines eager on every route; all other metrics collected
(`lib/rum.ts` → `/api/rum`) but not aggregated anywhere — fixed by R0-T3.

---

## 3. Target architecture

```
                Cloudflare (TLS · edge cache: anon HTML, image proxy, static)
                     │
                  Apache (VPS)  ← unchanged front door, blue/green flip
   ┌──────────┬──────┴─────┬──────────────┬───────────────┐
   │ /        │ /socket/   │ /rmhbox-ws/  │ /rmhtube-ws/  │
   ▼          ▼            ▼              ▼               │
 web:7005   socket:7001  rmhbox:7676   rmhtube:7003       │
 (Nitro     (Socket.IO   (Socket.IO)  (Socket.IO)         │
 node-cluster + rmhmusic)     └── Redis adapter, flag-gated┘
 N workers)
   │ serves: SSR platform app  +  static game/app bundles (own builds)
   │
 jobs (Node, pg-boss consumers: side-effects, media, retention, reconcile)
 supervisor (Go: 6 workers)   status:7008 (Go)   assets:7007 (Go)
   │
 PgBouncer ──► PostgreSQL  [schemas: core │ social │ econ │ games │ apps │ ops]
 redis-cache (allkeys-lru) │ redis-state (noeviction, AOF)
 R2/S3 (media)             │ pg-boss queue (in `ops` schema)
```

Delta vs `docs/architecture.md` today: PgBouncer added; 6 DB schemas; Go
gateway/hub topology + Helm `rmhstudios-go` + k8s scripts deleted; `jobs`
container added; `ladder-worker` + `homes-worker` containers retired into
`jobs`; media CPU work moved off the SSR event loop; Redis split into two
roles. Everything else (front door, hotswap, Dockerfile two-image build,
Better Auth, `.server.ts` stubbing, `--site-*` tokens, 32-locale i18n) is
deliberately unchanged.

---

## 4. Database design

### 4.1 Domain schemas

One Postgres cluster, six schemas, Prisma `multiSchema`. `ALTER TABLE … SET
SCHEMA` is metadata-only (brief ACCESS EXCLUSIVE lock, no rewrite).

```yaml
schemas:
  core:
    {
      role: rmh_core,
      models: ~13,
      contents: 'User, Session, Account, Verification, Passkey, PushSubscription, NotificationPreference, AppearancePreference, Referral, DeveloperApiKey, RmhCodeToken',
    }
  social:
    {
      role: rmh_social,
      models: ~55,
      contents: 'RMHark family (rmheet_*), Follow, Hashtag, PostHashtag, UserProfile, Notification, Conversation, DirectMessage(+Reaction), GroupChat family, Community family, ContentReport, UserBlock, UserMute, UserStrike, AdminAuditLog, FeedAnnouncement family, ScheduledPost, PostUnlock, Prediction(+Position), NewsArticle, BlogPost, CreatorMembership, RMHarkBookmark, RMHarkEdit',
    }
  econ:
    {
      role: rmh_econ,
      models: ~24,
      contents: 'CoinTransaction, UserInventory, UserAchievement, DailyStreak, UserQuest, UserSeasonProgress, DailyWheelSpin, CoinStake, Storefront*, GiftMembership, Subscription, PromoClaim, RedemptionRequest, ImageGenBudget, EloRating, RankedChallenge, WagerMatch, Tournament*',
    }
  games:
    {
      role: rmh_games,
      models: ~60,
      contents: 'all per-game saves/matches/players (Altair*, SynapseStorm*, RMHbox*, RmhType*, RmhStudy*, Versecraft*, DreamRift*, FarmingSimFarm, TempleOfJoySave, VoidBreakerPlayer, NeonDriftwayPlayer, SignalForgePlayer, VegaPlayer, LaundryPlayer, Player, DailyPuzzleScore, ForestExplorerSave, MusicGuess*), Doctrine family',
    }
  apps:
    {
      role: rmh_apps,
      models: ~60,
      contents: 'Ladder* (~26), Home* (~5), Rideshare (4), Library* (4), Album* (2), RmhTube* (5 post-deletion), RmhMusic rooms (2 post-deletion), Song family, Flashcard*, Playlist*, UserBuild family, VibePage*, AiPersona*',
    }
  ops:
    {
      role: rmh_ops,
      models: ~18,
      contents: 'WebhookEndpoint, WebhookDelivery, ApiIdempotencyKey, Ledger* (Go-owned), DiscordAlex*/DiscordChatSession/DiscordActivity*/DiscordDaily* (Go-owned), LadderWorkerLease, Media, Feedback, SecurityReport, pgboss.*',
    }
notes:
  - 'All cross-domain FKs point at core.user — they keep working across schemas.'
  - 'Go raw-SQL tables (ledger_*, discord_alex_*, discord_chat_session, ladder_worker_lease) land in ops; Go queries become schema-qualified.'
  - 'Table names (including rmheet*) are NOT renamed. Ever. (§11 NG-4)'
```

Why this buys speed, not just tidiness: per-role PgBouncer budgets make pool
starvation cross-domain-impossible; migration blast radius is contained
(`games` DDL cannot lock `social`); a future physical split is pre-paid;
per-schema statement p99 becomes measurable.

### 4.2 Dead models (drop; verified zero code references)

See inventory §9.3 with reverify commands. Expand/contract: R0-T8 removes the
writes/reads; R1-T3 drops the tables.

### 4.3 Primary-key policy

- Existing tables keep their PKs (203/225 are `cuid()` text; keyset
  `(createdAt desc, id desc)` indexes exist and work). **No retro-migration.**
- New append-only or high-volume tables MUST use time-sortable keys: UUIDv7
  (`uuidv7()` if PG ≥ 18, else app-generated ULID) or `BigInt` identity for
  internal-only tables. Rationale: insert locality + PK-order scans replace a
  secondary index.
- Enforced via schema-review checklist (R0-T9 adds it to `lib/CLAUDE.md`).

### 4.4 Partitioning + retention

```yaml
partition_by_month_range: # native RANGE partitions; old months DROP in O(1)
  - {
      table: social.notification,
      retention_days: 90,
      note: 'never drop unread rows; coalesce first',
    }
  - { table: ops.webhook_delivery, retention_days: 30 }
  - { table: games.doctrine_access_log, retention_days: 180 }
  - { table: social.admin_audit_log, retention_days: 180 }
  - { table: apps.ladder_product_event, retention_days: 90 }
  - { table: apps.ladder_application_event, retention_days: 90 }
  - { table: apps.ladder_alert_event, retention_days: 90 }
never_partition:
  - {
      table: social.direct_message,
      reason: 'full history is product surface; partial unread idx + pagination suffice',
    }
  - { table: social.group_message, reason: 'same' }
retention_without_partitioning:
  - {
      what: 'soft-deleted rmheet rows',
      grace_days: 30,
      mechanism: 'pg-boss job hard-delete batches (extends lib/cleanup.server.ts)',
    }
  - {
      what: 'session/verification purge',
      mechanism: 'existing cleanup worker → moves to jobs container (R2-T4)',
    }
constraint: 'partitioned-table PK must include the partition key → PK becomes (id, createdAt); the @@unique/@@id in Prisma changes accordingly; all FKs INTO these tables must be dropped (none exist on the listed tables — reverify: §9.3-RV)'
```

### 4.5 Counters + unread

- Keep all denormalized counters and Redis view/presence buffering
  (`lib/hot-counters.server.ts`).
- Reconciliation becomes scheduled jobs with emitted drift metrics (R2-T5) —
  never hand-run scripts.
- Real unread columns, maintained at write time, pushed as SSE deltas:

```sql
-- R1-T6 (expand)
ALTER TABLE core."user"        ADD COLUMN "unreadNotificationCount" integer NOT NULL DEFAULT 0;
ALTER TABLE social.conversation ADD COLUMN "unreadOneCount" integer NOT NULL DEFAULT 0,
                                ADD COLUMN "unreadTwoCount" integer NOT NULL DEFAULT 0;
-- backfill via batched UPDATE ... FROM (SELECT count(*) ...) as in scripts/reconcile-social-counts.ts
```

### 4.6 Platform floor

- **PgBouncer** transaction pooling; per-role budgets
  (`web ≤ 40, jobs ≤ 10, socket ≤ 8, rmhbox ≤ 5, rmhtube ≤ 5, supervisor ≤ 5, status ≤ 2, assets ≤ 2`;
  headroom for hotswap +web budget).
- **Backups** (R0-T1) precede every schema-touching task. Verified absent
  2026-07-18 (`grep -ril 'pg_dump|wal-g|pgbackrest' deploy/ scripts/ .github/` → nothing relevant).
- **Redis split** (R0-T2): `redis-cache` keeps `allkeys-lru`; `redis-state`
  gets `noeviction` + `appendonly yes` and holds `viewbuf:*`, `ratelimit:*`,
  presence sets, unread mirrors. Today's single instance
  (`docker-compose.yml:395`) can evict dirty view buffers — data loss with a
  config-sized fix.
- Migration discipline (already landed, now mechanical): `lock_timeout` +
  `statement_timeout` wrappers; expand/contract; `CREATE INDEX CONCURRENTLY`
  out-of-band for `rmheet`/`notification`/`follow`/`direct_message`/`session`.

---

## 5. Realtime design

- **Keep** the keyed SSE bus (`lib/feed-sse.ts`: `feed:created`,
  `feed:post:<id>`, `feed:user:<id>`; Redis transport in
  `lib/realtime-bus.server.ts`) — this shipped 2026-07-17 and is the target
  shape.
- **Keep** Node Socket.IO hubs as the production realtime tier. Add: Redis
  adapter behind env flag + sticky sessions (dormant until >1 instance);
  graceful drain + state snapshot on SIGTERM; client reconnect jitter; lazy
  per-game handler registration (today: 202 `socket.on` per connection).
- **Delete** the Go realtime duplicate (gateway, gamehub, rmhbox, rmhmusic,
  rmhtube, `pkg/realtime`, Helm `rmhstudios-go`, k8s deploy scripts). Honest
  status: gamehub 1/18 games ported, Go-rmhbox 1/9 minigames; zero production
  requests ever. Note: the `pkg/events` cross-replica origin bug is **already
  fixed** (wire-envelope framing in `go-services/pkg/events/events.go`;
  `go-services/CLAUDE.md` is stale). We delete a _working_ duplicate — tagged
  `pre-rewrite-go-realtime` for resurrection.
- **Fold pollers into SSE** once unread columns exist: notification badge
  (45 s poll), presence widgets (60 s), online-count (60 s) become server-push
  deltas on the existing per-user channel; one heartbeat POST remains.

## 6. Async backbone design

**pg-boss** (Postgres-backed queue, `ops` schema; Node library). Chosen over
Redis Streams (Redis here is a lossy LRU cache), BullMQ (same Redis problem),
and Kafka/NATS (wrong scale class; new infra). Rides existing Postgres +
PgBouncer + backups.

```yaml
queues:
  engagement-side-effects:
    {
      producer: 'web (like/comment/follow/post routes)',
      consumer: jobs,
      replaces: '~10 awaited serial queries on the like path (lib/social/engagement.server.ts)',
    }
  media-transcode:
    {
      producer: 'web (image-proxy miss, audio upload)',
      consumer: jobs,
      replaces: 'sharp/ffmpeg on the SSR event loop',
    }
  webhook-delivery:
    {
      producer: web,
      consumer: jobs,
      replaces: 'inline delivery attempts',
      features: [retry-backoff, dead-letter],
    }
  ai-moderation:
    {
      producer: web,
      consumer: jobs,
      replaces: 'fire-and-forget DeepSeek calls',
      features: [daily-budget, sampling],
    }
  scheduled-posts:
    {
      producer: 'cron (pg-boss schedule)',
      consumer: jobs,
      replaces: 'lazy materialization on timeline reads (scheduled/publish.server.ts)',
    }
  retention: { producer: 'cron', consumer: jobs, replaces: 'ladder-worker daily cleanup cron' }
  reconcile-counters:
    {
      producer: 'cron weekly',
      consumer: jobs,
      replaces: 'hand-run scripts/reconcile-*.ts',
      emits: 'drift metrics',
    }
  ladder-pipeline:
    {
      producer: 'cron 0 */12 * * *',
      consumer: jobs,
      replaces: 'ladder-worker container',
      mutual_exclusion: 'pg-boss singleton job (replaces ladder_worker_lease)',
    }
  homes-pipeline:
    { producer: 'cron 0 */6 * * *', consumer: jobs, replaces: 'homes-worker container' }
  feed-fanout:
    {
      status: GATED,
      gate: 'docs/feed/plan.md §4 trigger conditions',
      note: 'FeedEntry hybrid fan-out finally has a durable home',
    }
consumers_host: 'new `jobs` container (slim image, esbuild bundle server/jobs/index.ts) — Go supervisor keeps its 6 pure-Go workers unchanged'
```

## 7. Frontend design

### 7.1 Workspace decomposition

```
apps/web/          TanStack Start SSR app: _site shell, feed, profiles, messages,
                   communities, explore, search, news/blog/library, account/admin,
                   rmhladder (SEO-relevant, stays), login/legal, ALL /api routes.
apps/games/<name>/ one Vite app per game: client-rendered, own deps (three/rapier/
                   pixi live HERE), own i18n namespaces, own CSS; built to static
                   hashed bundles served by web under /<game>/.
apps/apps/<name>/  rmhtube, rmhmusic, rmhtype, rmhstudy, rmhcode, studio — same model.
packages/ui/       components/ui + PageLayout + tokens.css (--site-* system)
packages/session/  client session read + /api/auth glue + tier helpers
packages/i18n/     runtime + per-package namespace manifests (declarative)
packages/api-client/ typed fetch wrappers for /api used by games/apps
server/            unchanged hubs + shared/ + NEW jobs/
go-services/       supervisor, status, assets, pkg/* only (post R4-T1)
```

Measured wins per extraction: `apps/web` route-file count and
`routeTree.gen.ts` line count drop every PR; `holdUntilCrawlEnd: false`
workaround (`vite.config.ts:299` — "130 eager routes" break the dep crawl) and
the 8 GB tsc heap become unnecessary; a game dep upgrade cannot regress the
feed; game deploys stop invalidating shell caches.

Serving mechanics: each game builds `index.html` + hashed assets; `apps/web`
serves them via Nitro route rules (same origin — auth cookies just work; games
call `/api` via `packages/api-client`). Games are client-rendered (no SSR/SEO
need; the marketing/landing pages for games stay in `apps/web`).

### 7.2 Data/state layers

- **Remove `@tanstack/react-query` from the shell.** Provided globally, used
  by exactly 7 files, all in `app/routes/strategies/` (verified). Port those
  to router loaders; if strategies wants query caching it carries the dep in
  its own package after extraction.
- Router loaders + `createServerFn` remain the data path; the 6 Zustand
  stores remain the client-state path.

### 7.3 CSS + i18n

- `globals.css` (2,129 lines) → `packages/ui/tokens.css` (tokens, 6 `.style-*`
  theme blocks, a11y/reduced-motion; the only eager CSS; ≤40 KB brotli) +
  per-package styles loaded with their package.
- i18n: per-package namespace manifests generate the `loadNamespaces` wiring
  (today imperative across 83 route files). SSR still serializes only the 12
  core namespaces of the active locale (shipped 2026-07-17); unchanged.
- `locales/` stays committed (OD-1-adjacent; it is regenerable but that's a
  separate decision, not taken here). Game/app namespace JSON moves next to
  its package; `i18next-parser` config gains per-package inputs.

### 7.4 API routes

All ~395 API files stay in `apps/web` (shared auth/rate-limit/Prisma
plumbing). New: a generated ownership manifest `docs/api-ownership.json`
(route glob → domain schema → owning package) produced by R1-T2, consumed by
lint to prevent cross-domain Prisma access from the wrong route family.

### 7.5 Build pipeline

- The three hand-synced external lists (`heavyExternals`, `ssrOnlyExternals`,
  Nitro `traceDeps` — `vite.config.ts:107-151`) shrink as heavy libs move into
  game packages; remainder generated from package manifests.
- `stubServerFiles` plugin survives; add per-package eslint rule
  `no-restricted-imports` for `*.server` from client code.
- Keep the esbuild step for `server/*` bundles (add `server/jobs`).
- CI: per-package bundle-size delta gate + Lighthouse budget on the shell
  (warn R0-T3 → block R3-T1).

---

## 8. TASK GRAPH (implementation spec)

Phase ordering: `R0 rails+reap → R1 database → R2 async → R3 frontend → R4
realtime cleanup → R5 evidence-gated`. R1/R2 may overlap after R1-T2; R3 may
start once R0 is done (it touches disjoint files from R1/R2).

Legend: `risk: low|med|high` = production blast radius. Every task implicitly
ends with the baseline commands from "How to use this document" §4.

### PHASE R0 — Rails + reap (no architecture changes)

```yaml
- id: R0-T1
  title: Database backups + WAL archiving + restore drill
  depends_on: []
  risk: low
  files: [deploy/backup/, deploy/systemd/, deploy/README.md, .env.example]
  steps:
    - Add deploy/backup/pg-backup.sh: nightly `pg_dump -Fc` of the prod DB,
      upload to R2 bucket `rmh-db-backups/` via the existing rclone/aws-cli
      pattern used in deploy.sh R2 sync; retain 30 dailies + 12 monthlies.
    - Add WAL archiving: install wal-g on the VPS host; postgresql.conf
      `archive_mode=on`, `archive_command='wal-g wal-push %p'` appended to
      deploy/postgres/postgresql.tuning.conf; document in deploy/backup/README.md.
    - Add deploy/systemd/rmh-db-backup.{service,timer} (03:30 UTC daily).
    - Add deploy/backup/restore-drill.sh: restore latest dump into a throwaway
      container, run `SELECT count(*) FROM "user"` + prisma validate; document
      quarterly cadence.
    - Env: R2 credentials via existing secret handling (fail-closed like
      webhook-server.cjs); never commit values.
  verify:
    - "bash -n deploy/backup/pg-backup.sh deploy/backup/restore-drill.sh"
    - "shellcheck deploy/backup/*.sh"
  acceptance:
    - One successful backup uploaded to R2 (operator-confirmed).
    - restore-drill.sh completes against that backup.
  rollback: "delete timer; no runtime coupling"

- id: R0-T2
  title: Split Redis into cache and state roles
  depends_on: []
  risk: med
  files: [docker-compose.yml, lib/redis.server.ts, lib/hot-counters.server.ts, .env.example]
  steps:
    - Add compose service `redis-state`: redis:7.4-alpine,
      `--maxmemory 128mb --maxmemory-policy noeviction --appendonly yes`,
      mem_limit 192m, internal only. Existing `redis` renamed role only
      (stays `redis-cache` alias; keep service name for zero-downtime).
    - lib/redis.server.ts: add second client factory `redisState()` bound to
      `REDIS_STATE_URL` (falls back to REDIS_URL when unset — degraded but
      compatible). Move the callers that hold STATE keys to it:
      hot-counters viewbuf:*/presence, redisRateLimit, unread mirrors.
      Cache keys (redisGetJSON/SetJSON for cached()) stay on the LRU client.
    - .env.example: document REDIS_STATE_URL.
  verify:
    - "pnpm exec vitest run"
    - "grep -n 'REDIS_STATE_URL' .env.example docker-compose.yml lib/redis.server.ts"
  acceptance:
    - viewbuf/ratelimit/presence keys observed on redis-state in staging;
      eviction test (fill redis-cache) does not touch state keys.
  rollback: "unset REDIS_STATE_URL → all callers fall back to single Redis"

- id: R0-T3
  title: RUM aggregation + CI budget gates (warn-only)
  depends_on: []
  risk: low
  files: [app/routes/api/rum.ts, app/routes/api/client-error.ts, .github/workflows/web-ci.yml, lib/rum.ts]
  steps:
    - Forward /api/rum + /api/client-error to the chosen sink (both endpoints
      are validate-then-discard today and documented as wire-ready). Sink
      choice is an operator decision (Sentry vs Grafana Faro vs Axiom);
      implement behind RUM_SINK_URL env — absent = current no-op.
    - web-ci.yml: add bundle-size job — `pnpm build`, then report brotli sizes
      of the entry chunks vs budgets in §2 (script scripts/ci/bundle-budget.ts,
      reads budget JSON from this doc's §2 block copied to
      scripts/ci/perf-budgets.json). warn-only (`continue-on-error: true`).
    - Add p75 TTFB/LCP/INP panels wherever the sink lands (operator step).
  verify: ["pnpm build", "node scripts/ci/bundle-budget.ts --check"]
  acceptance: ["CI shows budget report on PRs; RUM rows visible in sink (operator-confirmed)"]
  rollback: "remove workflow job; endpoints revert to no-op without RUM_SINK_URL"

- id: R0-T4
  title: "Deletion wave 1a: dead npm dependencies"
  depends_on: []
  risk: low
  files: [package.json, pnpm-lock.yaml, vite.config.ts]
  steps:
    - Remove the §9.1 confirmed-dead list from package.json.
    - Reclassify vibe-only deps per §9.1 (dependencies → devDependencies).
    - vite.config.ts: prune stale entries from heavyExternals ('recharts',
      'katex') and ssrOnlyExternals ('@tiptap/*') that now reference removed deps.
    - "pnpm install" to resync the lockfile.
  verify:
    - "pnpm install --frozen-lockfile=false && pnpm exec tsc --noEmit && pnpm build && pnpm exec vitest run"
    - "for d in $(cat §9.1 list); do grep -rE \"from ['\\\"]$d\" app components lib server hooks stores && exit 1; done; true"
  acceptance: ["build+tests green with removed deps; lockfile has no orphan entries"]
  rollback: "git revert (single commit)"

- id: R0-T5
  title: "Deletion wave 1b: dead Node workers + playwright reclassification"
  depends_on: [R0-T4]
  risk: low
  files: [server/bot-worker/, server/doctrine-worker/, server/recap/, server/vibe-worker/, server/status/, lib/rmhvibe/vibe-screenshot.server.ts, package.json, server/CLAUDE.md, docs/architecture.md]
  steps:
    - Delete the five dead worker dirs (§9.2; not built by pnpm build, not in
      compose; Go supervisor owns these workers in prod).
    - Delete lib/rmhvibe/vibe-screenshot.server.ts (Node thumbnail fallback;
      Go vibe-worker owns thumbnails via chromedp). Remove its import sites
      (reverify: `grep -rn vibe-screenshot lib app server`).
    - Move `playwright` dependencies→devDependencies (still used by scripts/epic/*).
    - Update server/CLAUDE.md (drop fallback-workers section; ADD homes-worker,
      which the doc currently omits) and architecture.md rollback note.
  verify:
    - "pnpm build && pnpm exec tsc --noEmit"
    - "grep -rn 'server/bot-worker\\|server/doctrine-worker\\|server/recap\\|server/vibe-worker\\|server/status' package.json Dockerfile docker-compose.yml deploy.sh; test $? -eq 1"
  acceptance: ["prod images build; compose config validates (docker compose config -q)"]
  rollback: "git revert; workers were dead code"

- id: R0-T6
  title: "Deletion wave 1c: specs/ + one-off scripts + Go cmd/ledger + tag"
  depends_on: []
  risk: low
  files: [specs/, scripts/, go-services/cmd/ledger/, docs/README.md]
  steps:
    - "git tag pre-rewrite-go-realtime && git push origin pre-rewrite-go-realtime  # BEFORE any Go deletion"
    - Delete specs/ (5 files, zero runtime references; vega.md flagged stale).
    - Delete the §9.4 one-off scripts (confirmed unreferenced). Do NOT delete
      the §9.4 'confirm-with-owner' items without owner ack.
    - Delete go-services/cmd/ledger (no BUILD.bazel, no image, not deployed).
      Keep internal/ledger + its tables (Go supervisor writes them? reverify:
      `grep -rn 'internal/ledger' go-services/cmd go-services/internal` — if
      only cmd/ledger references it, delete internal/ledger too; the
      ledger_* TABLES stay either way).
    - docs/README.md: remove specs/ mention; add this doc to the index.
  verify: ["cd go-services && make gazelle && make test", "pnpm exec vitest run"]
  acceptance: ["CI green; tag exists on origin"]
  rollback: "git revert; tag preserves everything"

- id: R0-T7
  title: Stop-writes on dead DB models (expand/contract step 1)
  depends_on: []
  risk: med
  files: [scripts/reconcile-feed-counts.ts, prisma/schema.prisma, "call sites per §9.3 reverify"]
  steps:
    - For each §9.3 model: re-run its reverify command; remove any write/read
      call sites found (expected: only scripts/reconcile-feed-counts.ts:38
      reads rmheet_view — delete that branch).
    - Mark the models with a `/// DEAD — drop scheduled R1-T3` triple-slash
      comment in schema.prisma (no migration yet).
    - Add pg log-based observation note to the R1-T3 task: before drop, check
      `pg_stat_user_tables.seq_scan+idx_scan` deltas over 7 days ≈ 0.
  verify: ["pnpm exec tsc --noEmit && pnpm exec vitest run"]
  acceptance: ["zero references to the 10 accessors (§9.3 commands all return empty)"]
  rollback: "git revert"

- id: R0-T8
  title: Doc-truth fixes riding along
  depends_on: [R0-T5]
  risk: low
  files: [CLAUDE.md, AGENTS.md, go-services/CLAUDE.md, lib/CLAUDE.md]
  steps:
    - CLAUDE.md/AGENTS.md: "~199 models" → "225 models (2026-07-18 census)".
    - go-services/CLAUDE.md: pkg/events origin bug is FIXED (wire envelope);
      supervisor runs 6 workers (streak-saver included).
    - lib/CLAUDE.md: add the §4.3 PK policy checklist for new models.
  verify: ["git diff --stat"]
  acceptance: ["docs match code"]
  rollback: trivial

exit_gate_R0:
  - R0-T1 restore drill passed (operator-confirmed)
  - budgets reporting in CI (R0-T3)
  - all deletions merged, CI green, dependency count reduced (record number)
```

### PHASE R1 — Database

```yaml
- id: R1-T1
  title: PgBouncer + per-role pool budgets
  depends_on: [R0-T1]
  risk: high
  files: [docker-compose.yml, deploy/pgbouncer/, .env.example, lib/prisma.server.ts, server/shared/prisma-client.ts, go-services/pkg/config/, go-services/pkg/db/]
  steps:
    - Add compose service `pgbouncer` (edoburu/pgbouncer or official):
      transaction pooling, `max_client_conn=200`, per-user pools from §4.6
      budget table; userlist for the six rmh_* roles (created R1-T2 step 1;
      until then a single role entry).
    - Cut services over one at a time via DATABASE_URL host:port swap
      (status → assets → supervisor → hubs → jobs-precursor workers → web
      last during a hotswap). Watch pool-wait metrics between each.
    - "Prisma note: transaction pooling requires no session state; the repo
      already avoids prepared-statement pitfalls via @prisma/adapter-pg —
      verify with the smoke suite; if prepared statements bite, set
      `statement_cache_size=0` on the adapter or use pgbouncer
      `max_prepared_statements` (pgbouncer ≥ 1.21 supports protocol-level
      prepared statements)."
  verify: ["docker compose config -q", "smoke: pnpm exec vitest run + staging feed/page loads"]
  acceptance: ["all services on PgBouncer for 7 days; db_pool_wait p99 ≤ 10ms; direct-connection count to Postgres = pgbouncer only"]
  rollback: "point DATABASE_URL back at :5432 per service (env-only)"

- id: R1-T2
  title: Domain schemas (multiSchema) — batched SET SCHEMA moves
  depends_on: [R1-T1]
  risk: high
  files: [prisma/schema.prisma, prisma/migrations/, go-services/internal/**.go raw SQL, lib/rmhladder/worker-lease.ts, docs/api-ownership.json]
  steps:
    - "Step 1 — roles: CREATE ROLE rmh_core LOGIN ...; ×6; GRANT USAGE per §4.1;
      wire into pgbouncer userlist (TEMPLATE — operator supplies passwords)."
    - "Step 2 — schema objects: CREATE SCHEMA core AUTHORIZATION rmh_core; ×6."
    - "Step 3 — batches in dependency order ops → apps → games → econ → social → core.
      Per batch, one migration file:
        ALTER TABLE \"webhook_endpoint\" SET SCHEMA ops;  -- etc.
      + schema.prisma: datasource `schemas = [...]` + `@@schema(\"ops\")` per
      model + `previewFeatures`/config per Prisma 7 multiSchema docs.
      + update Go raw SQL + worker-lease.ts to schema-qualified names in the
      SAME deploy."
    - "Step 4 — search_path safety: set `ALTER ROLE rmh_web SET search_path =
      core,social,econ,games,apps,ops,public` during transition; remove after
      all code is schema-qualified."
    - "Step 5 — generate docs/api-ownership.json: script walks app/routes/api/**,
      maps each file's prisma model usage → schema; commit the manifest."
  verify:
    - "pnpm exec prisma validate && pnpm exec prisma migrate diff --from-schema-datasource --to-schema-datamodel  # empty after each batch"
    - "cd go-services && make test"
    - "node scripts/ci/api-ownership-check.ts  # every api route maps to exactly one primary schema"
  acceptance: ["all 225→215 models carry @@schema; zero cross-schema privilege errors in a week of prod logs; per-schema statement p99 visible"]
  rollback: "per batch: ALTER TABLE ... SET SCHEMA public + revert the code commit (metadata-only, seconds)"

- id: R1-T3
  title: Drop dead tables (expand/contract step 2)
  depends_on: [R0-T7, R1-T2]
  risk: med
  files: [prisma/schema.prisma, prisma/migrations/]
  steps:
    - "Precondition per table: 7-day pg_stat_user_tables scan-delta ≈ 0 (R0-T7)."
    - "One migration:
       DROP TABLE IF EXISTS social.rmheet_view;                 -- RMHarkView
       DROP TABLE IF EXISTS apps.rmhtube_playlist_item, apps.rmhtube_playlist;
       DROP TABLE IF EXISTS apps.rmhtube_user_stats;
       DROP TABLE IF EXISTS apps.rmh_music_queue_item, apps.rmh_music_chat_message;
       DROP TABLE IF EXISTS apps.build_version;
       DROP TABLE IF EXISTS games.doctrine_sahur_participation;
       DROP TABLE IF EXISTS social.feed_announcement_poll;      -- children first if FK'd (reverify)
       DROP TABLE IF EXISTS apps.song_rating;
      + remove the 10 models (and dangling relations) from schema.prisma."
    - "rmheet_comment_view: keep pending product confirmation; if confirmed,
      same procedure in a follow-up migration."
  verify: ["pnpm exec prisma validate && pnpm exec tsc --noEmit && pnpm exec vitest run"]
  acceptance: ["prod deploy clean; error rate flat for 48h"]
  rollback: "restore from R0-T1 backup (tables were verified dead; data loss is the accepted point)"

- id: R1-T4
  title: Partition log-shaped tables
  depends_on: [R1-T2]
  risk: high
  files: [prisma/migrations/, prisma/schema.prisma, lib/cleanup.server.ts]
  steps:
    - "Order: apps.ladder_product_event, ladder_application_event,
      ladder_alert_event (young/small) → ops.webhook_delivery →
      social.notification (largest, last)."
    - "Per table (TEMPLATE, run in low-traffic window):
       1. CREATE TABLE <t>_p (LIKE <t> INCLUDING DEFAULTS INCLUDING CONSTRAINTS)
          PARTITION BY RANGE (\"createdAt\");
          -- PK becomes (id, \"createdAt\"): create PRIMARY KEY on the
          -- partitioned table accordingly; recreate secondary indexes as
          -- partitioned indexes.
       2. Create monthly partitions current-2 .. current+3 + a DEFAULT partition.
       3. Backfill in batches: INSERT INTO <t>_p SELECT * FROM <t> WHERE id > $cursor ORDER BY id LIMIT 50000; (repeat)
       4. In one short txn under lock_timeout=5s: LOCK TABLE <t> IN ACCESS EXCLUSIVE MODE;
          copy the tail delta; ALTER TABLE <t> RENAME TO <t>_old; ALTER TABLE <t>_p RENAME TO <t>;
       5. Keep <t>_old one release; then DROP."
    - "Prisma: partitioned tables keep working through the same model; change
      @@id to ([id, createdAt]) for these models and adjust any upsert-by-id
      call sites (reverify each: `grep -rn '<model>.upsert' lib app server`)."
    - "Partition maintenance job (create-ahead + drop-expired per §4.4
      retention) added to lib/cleanup.server.ts, scheduled via R2 queue (until
      then: the existing daily cleanup cron)."
  verify: ["EXPLAIN on the hot notification queries shows partition pruning; pnpm exec vitest run"]
  acceptance: ["monthly DROP PARTITION observed replacing bulk DELETEs; autovacuum time on notification down"]
  rollback: "swap-back rename retained for one release (<t>_old)"

- id: R1-T5
  title: Unread-count columns + SSE deltas; retire count-polling
  depends_on: [R1-T2]
  risk: med
  files: [prisma/schema.prisma, prisma/migrations/, lib/notifications.server.ts, lib/messages.server.ts, app/routes/api/notifications/unread-count.ts, app/routes/api/messages/stream.ts, lib/useNotificationCount.ts, hooks/useFeedSSE.ts]
  steps:
    - Apply §4.5 DDL (expand); backfill batched.
    - Maintain at write time: notification insert → +1; mark-read → -N (the
      scalability branch already wired the decrement path — extend to insert).
      DM: bump unread{One,Two}Count on send; zero on conversation read.
    - Redis-state mirror stays as write-through cache; DB column is truth.
    - Push `unread` deltas on the existing per-user SSE channel
      (`feed:user:<id>`); client `useNotificationCount` consumes SSE and drops
      its 45s poll (keep a 5-min failsafe poll).
  verify: ["pnpm exec vitest run; staging: unread badge correct across 2 devices after read"]
  acceptance: ["/api/notifications/unread-count QPS reduced >90% in prod"]
  rollback: "feature-flag SSE-unread off → clients resume polling (keep endpoint)"

exit_gate_R1:
  - PgBouncer fronting 100% of connections for 7 days, pool-wait p99 ≤ 10 ms
  - all models schema-qualified; zero privilege errors for 7 days
  - dead tables dropped; partitioned tables pruning in EXPLAIN
  - social statement p99 ≤ 50 ms on the RUM/metrics dashboard
```

### PHASE R2 — Async backbone

```yaml
- id: R2-T1
  title: pg-boss + jobs container
  depends_on: [R1-T1]
  risk: med
  files: [package.json, server/jobs/index.ts, Dockerfile, docker-compose.yml, .env.example]
  steps:
    - Add pg-boss dep; boss schema objects live in `ops` (constructorOptions
      `schema: 'ops_pgboss'`).
    - server/jobs/index.ts: boss.start(), register queue workers per §6 table
      (empty handlers land first; queues fill in T2–T5). Structured logs via
      server/shared/logger.ts. Health endpoint on :7010.
    - Dockerfile: add jobs bundle to the existing esbuild step; compose service
      `jobs` (slim image, mem 512m/0.5cpu, DATABASE_URL via pgbouncer role rmh_ops).
  verify: ["pnpm build; docker compose config -q; boss smoke test in vitest (testing/jobs/)"]
  acceptance: ["jobs container healthy in prod; queue tables visible in ops_pgboss"]
  rollback: "scale jobs=0; producers not yet wired"

- id: R2-T2
  title: Engagement side-effects → queue
  depends_on: [R2-T1]
  risk: med
  files: [lib/social/engagement.server.ts, app/routes/api/rmharks.ts, server/jobs/handlers/engagement.ts]
  steps:
    - Like/comment/follow/post routes: respond after core txn + SSE publish;
      enqueue one `engagement-side-effects` job carrying {type, actorId,
      targetId, entityId} for notification create/dedupe, push subscriptions,
      achievements, XP, quests, webhooks (the ~10 currently-awaited queries).
    - Handler is idempotent (job key = `${type}:${actorId}:${entityId}`).
  verify: ["vitest suite for handler idempotency; staging like-storm script"]
  acceptance: ["like-path server p95 < 100 ms; zero lost side effects across a deploy (queue drains)"]
  rollback: "env flag ENGAGEMENT_INLINE=1 restores the awaited path"

- id: R2-T3
  title: Media work off the SSR event loop
  depends_on: [R2-T1]
  risk: med
  files: [app/routes/api/image-proxy.ts, app/routes/api/feed/image/$filename.ts, lib/audio/transcode.server.ts, server/jobs/handlers/media.ts]
  steps:
    - image-proxy miss path: enqueue `media-transcode` {url,w,q,f}; respond
      302 to the original URL (first viewer unoptimized; variant cached for
      everyone after). Hits keep the existing origin LRU. Edge cache rule
      (already scripted) absorbs delivery.
    - feed/image variant misses: same pattern with the fixed width whitelist.
    - Audio: upload path stores original, enqueues transcode; UI already
      tolerates 'processing' state (verify; else add).
    - jobs handler runs sharp/ffmpeg with concurrency 2, teamSize sized to the
      container CPU.
  verify: ["staging: cold avatar renders (302) then optimized on 2nd load; event-loop lag under image storm flat"]
  acceptance: ["zero sharp/ffmpeg invocations inside web (add a counter metric); web event-loop lag p99 ≤ 100 ms during image-heavy load test"]
  rollback: "env MEDIA_INLINE=1 restores in-process transcode"

- id: R2-T4
  title: Fold ladder/homes cron containers into jobs
  depends_on: [R2-T1]
  risk: med
  files: [server/jobs/handlers/{ladder,homes,retention}.ts, docker-compose.yml, server/ladder-worker/, server/homes-worker/, package.json]
  steps:
    - Register pg-boss schedules — ladder `0 */12 * * *`, ladder-cleanup
      `0 4 * * *`, homes `0 */6 * * *` — each as singleton jobs
      (`singletonKey`) reusing lib/rmhladder pipeline + lib/cleanup.server.ts
      unchanged.
    - Retire the ladder_worker_lease raw-SQL mutual exclusion in favor of
      pg-boss singleton semantics (keep table until R5 review).
    - Remove ladder-worker + homes-worker compose services and their esbuild
      entries; delete server/ladder-worker/, server/homes-worker/ after one
      clean week (keep lib/rmhladder — it is the pipeline, jobs is just the host).
  verify: ["staging: forced run of each schedule completes; overlap test (two manual fires) → single execution"]
  acceptance: ["two fewer containers; ladder:status report unchanged; scrape cadence metrics unchanged"]
  rollback: "compose services restorable from git; schedules removable at runtime"

- id: R2-T5
  title: Reconciliation as scheduled jobs with drift metrics
  depends_on: [R2-T1]
  risk: low
  files: [server/jobs/handlers/reconcile.ts, scripts/reconcile-feed-counts.ts, scripts/reconcile-social-counts.ts]
  steps:
    - Weekly schedule invoking the two reconcile modules (refactor scripts to
      export run() and keep CLI shims); emit per-counter drift gauges to logs/
      metrics; alert threshold drift > 1% rows touched.
  verify: ["manual run in staging; drift metrics visible"]
  acceptance: ["reconcile runs appear weekly without operator action"]
  rollback: trivial

exit_gate_R2:
  - like-path p95 < 100 ms server-side in prod
  - zero lost jobs across a deploy (drain verified)
  - ladder/homes containers gone; scrape cadences unchanged
  - zero in-web sharp/ffmpeg invocations (metric)
```

### PHASE R3 — Frontend decomposition (repeatable per-surface procedure)

```yaml
- id: R3-T1
  title: Workspace scaffold + budgets to blocking
  depends_on: [R0-T4]
  risk: med
  files: [pnpm-workspace.yaml, packages/ui/, packages/session/, packages/i18n/, packages/api-client/, .github/workflows/web-ci.yml, tsconfig.json]
  steps:
    - Fix pnpm-workspace.yaml (currently has no `packages:` key and
      placeholder allowBuilds values): `packages: ['.', 'apps/*', 'apps/games/*', 'apps/apps/*', 'packages/*', 'cli']`.
    - Scaffold packages/ui (move components/ui + PageLayout + extract
      tokens.css from globals.css §7.3), packages/session, packages/i18n,
      packages/api-client. apps/web remains the current root app initially
      (path aliases; physical move of app/ into apps/web can trail).
    - Per-package tsconfig with project references; root `tsc -b`.
    - Flip §2 budget gates from warn to block for the shell.
  verify: ["pnpm -r exec tsc --noEmit  # NO heap flag needed per package", "pnpm build && node scripts/ci/bundle-budget.ts --check --strict"]
  acceptance: ["workspace installs; shell budget blocking in CI"]
  rollback: "workspace config is additive; revertible per commit"

- id: R3-T2
  title: "PROCEDURE — extract one game/app to its own build (repeat per §9.5 order)"
  depends_on: [R3-T1]
  risk: med
  files: ["apps/games/<name>/ (new)", "app/routes/<name>*.tsx (removed)", "components/<name>/ (moved)", "lib/<name>/ (moved)", "locales/*/c-<name>.json etc (moved)", vite.config.ts]
  steps:
    - Scaffold apps/games/<name>: vite + react, no SSR; import moved
      components/lib; deps that only this surface uses (three/rapier/pixi/
      tone/howler per §9.5) move to its package.json and OUT of the root.
    - Route handoff: delete app/routes/<name>.tsx (+subdir); add a Nitro route
      rule in apps/web serving apps/games/<name>/dist/index.html at /<name>
      with hashed assets under /<name>/assets/ (far-future immutable).
    - Socket contract unchanged (same origin, same /socket/ path); API calls
      via packages/api-client.
    - i18n: move the game's c-*/r-* namespaces into the package manifest;
      regenerate loadNamespaces wiring; `pnpm i18n:extract` scoped run.
    - CSS: game styles leave globals.css if present.
    - Record metrics in the PR description: routeTree.gen.ts line delta, shell
      eager-bundle delta, root dependency-count delta.
  verify:
    - "pnpm -r build; pnpm exec tsc -b"
    - "playwright smoke (scripts/epic or manual): game loads at /<name>, auth'd
       API call succeeds, socket connects, i18n non-en shows translated shell"
    - "node scripts/ci/bundle-budget.ts --check --strict"
  acceptance: ["game functionally identical in staging; shell metrics improved or flat; no root-dep regression"]
  rollback: "per-game git revert; route rule removal restores 404 → previous commit restores route"

- id: R3-T3
  title: React Query removal from the shell
  depends_on: [R3-T1]
  risk: low
  files: [components/Providers.tsx, app/routes/strategies/**, package.json]
  steps:
    - Port the 7 strategies files from useQuery/useMutation to router loaders +
      createServerFn (or extract strategies per R3-T2 and carry the dep there).
    - Remove QueryClientProvider + @tanstack/react-query from the root.
  verify: ["pnpm exec tsc --noEmit; strategies pages smoke in staging"]
  acceptance: ["react-query absent from shell bundle analysis"]
  rollback: "git revert"

- id: R3-T4
  title: CSS split + i18n manifests
  depends_on: [R3-T1]
  risk: med
  files: [app/globals.css, packages/ui/tokens.css, packages/i18n/manifests/, lib/i18n/]
  steps:
    - Move tokens + 6 .style-* theme blocks + a11y/reduced-motion into
      packages/ui/tokens.css (eager, ≤40 KB brotli). Feed/site styles move to
      their consuming layers; verify all 7 themes + RTL + high-contrast render.
    - Namespace manifests per package; generate the imperative loadNamespaces
      calls (83 sites) from manifests; delete hand-written ones.
  verify: ["pnpm build; visual pass over light/high-contrast/RTL; node scripts/ci/bundle-budget.ts --check --strict"]
  acceptance: ["eager CSS ≤ 40 KB brotli; all themes/RTL verified"]
  rollback: "git revert per step"

exit_gate_R3:
  - shell eager JS ≤ 300 KB brotli (CI-blocked)
  - per-package tsc without heap flags; `holdUntilCrawlEnd` workaround deleted
    from vite.config.ts (crawl settles)
  - routeTree.gen.ts line count reduced ≥ 60% from 13,731 (record final)
  - game deploys produce zero shell-asset invalidations
```

### PHASE R4 — Realtime consolidation + Go cleanup

```yaml
- id: R4-T1
  title: Delete the Go realtime/gateway topology
  depends_on: [R0-T6]   # tag exists
  risk: low
  files: [go-services/cmd/{gateway,gamehub,rmhbox,rmhmusic,rmhtube}/, go-services/internal/{gateway,gamehub,rmhbox,rmhmusic,rmhtube}/, go-services/pkg/realtime/, deploy/helm/rmhstudios-go/, deploy/helm/rmhstudios/, deploy/deploy-go.sh, deploy/deploy-k8s.sh, deploy/k8s/, go-services/docker-compose.go.yml, .github/workflows/go-microservices.yml, docs/architecture.md, docs/codebase-overview.md, go-services/CLAUDE.md]
  steps:
    - Reverify supervisor workers do not import pkg/realtime or the deleted
      internals: `grep -rn 'pkg/realtime\|internal/gamehub\|internal/rmhbox\|internal/rmhmusic\|internal/rmhtube\|internal/gateway' go-services/internal/{doctrine,vibeworker,recap,discordbot,botworker,streaksaver} go-services/cmd/supervisor` → must be empty. pkg/events stays if any keeper uses it.
    - Delete the listed trees; `make gazelle`; re-scope go-microservices.yml
      (drop helm lint/template of the deleted chart; keep bazel test + e2e for
      supervisor/status/assets).
    - Also fold standalone worker binaries (cmd/{discord-bot,recap,doctrine-worker,vibe-worker,bot-worker}) into supervisor-only targets if nothing else invokes them (reverify Dockerfile go-builder stage copies).
    - Update architecture.md / codebase-overview.md / go-services/CLAUDE.md
      (remove the "future topology" sections; note the resurrection tag).
  verify: ["cd go-services && make gazelle && make test; docker build --target runner-full ."]
  acceptance: ["prod images build; supervisor/status/assets unchanged in prod for a week"]
  rollback: "git revert or restore from tag pre-rewrite-go-realtime"

- id: R4-T2
  title: Socket.IO Redis adapter (flag-off) + sticky sessions
  depends_on: [R0-T2]
  risk: med
  files: [server/socket-server/index.ts, server/rmhbox/, server/rmhtube/, package.json, deploy/apache/rmhstudios.conf]
  steps:
    - Add @socket.io/redis-adapter wired to redis-state, enabled only when
      SOCKET_REDIS_ADAPTER=1; document sticky-session requirement (Apache
      route-based stickiness stanza prepared but commented).
    - Staged two-instance socket-server test with the flag on (compose scale).
  verify: ["two-instance staging test: cross-instance room broadcast received"]
  acceptance: ["flag-off in prod (no behavior change); staged test recorded green"]
  rollback: "flag stays off"

- id: R4-T3
  title: Hub drain, state snapshots, reconnect jitter
  depends_on: [R0-T2]
  risk: med
  files: [server/rmhbox/lobby-manager.ts, server/shared/, deploy/hotswap-web.sh, client socket setup (lib/)]
  steps:
    - SIGTERM handler: stop accepting, snapshot rmhbox lobby state to
      redis-state (rmhtube already DB-restores), emit `server:draining` with
      per-client random 0–10 s reconnect delay; exit after grace.
    - Client: honor the jitter hint on reconnect (all three hub clients).
  verify: ["staging deploy: reconnect spike spread ≥ 5 s; rmhbox lobby survives restart"]
  acceptance: ["deploy reconnect auth spike flattened in hub metrics"]
  rollback: "handlers are additive"

- id: R4-T4
  title: Lazy per-game handler registration in socket-server
  depends_on: []
  risk: med
  files: [server/socket-server/index.ts, server/socket-server/handlers/*]
  steps:
    - Register a game's handlers on first `<prefix>:join`-class event instead
      of all 18 games' ~202 handlers per connection; disconnect walkers become
      a reverse index of joined games.
  verify: ["vitest handler tests; staging: each of the 18 games playable"]
  acceptance: ["per-connection listener count drops ~10×; disconnect O(joined games)"]
  rollback: "git revert"

exit_gate_R4:
  - go-services contains only supervisor/status/assets + pkg/*
  - two-instance adapter test green (flag-off in prod)
  - deploy reconnect spike flattened; rmhbox lobbies survive deploys
```

### PHASE R5 — Evidence-gated (unchanged from the scalability audit; do not pre-build)

```yaml
- {
    id: R5-G1,
    item: 'managed Postgres (PITR) + read replica',
    gate: 'DB CPU/IO p95 sustained > 60% or ops burden',
  }
- {
    id: R5-G2,
    item: 'feed fan-out-on-write (FeedEntry) via feed-fanout queue',
    gate: 'docs/feed/plan.md §4 triggers',
  }
- { id: R5-G3, item: 'external search engine', gate: 'FTS p95 > 200 ms sustained' }
- {
    id: R5-G4,
    item: 'web replicas beyond node-cluster (Apache balancer)',
    gate: 'event-loop lag p99 > 100 ms with WEB_WORKERS maxed',
  }
- {
    id: R5-G5,
    item: 'Turnstile + email verification + T&S pipeline',
    gate: 'abuse metrics (accounts/IP/day) or pre-open-registration',
  }
```

---

## 9. INVENTORIES (exact, verified 2026-07-18 @ efb6269)

### 9.1 Dead npm dependencies

```yaml
delete_dependencies: # zero import sites across app/ components/ lib/ server/ hooks/ stores/ scripts/ cli/ testing/
  - '@tiptap/extension-character-count'
  - '@tiptap/extension-code-block-lowlight'
  - '@tiptap/extension-color'
  - '@tiptap/extension-highlight'
  - '@tiptap/extension-image'
  - '@tiptap/extension-link'
  - '@tiptap/extension-placeholder'
  - '@tiptap/extension-table'
  - '@tiptap/extension-table-cell'
  - '@tiptap/extension-table-header'
  - '@tiptap/extension-table-row'
  - '@tiptap/extension-task-item'
  - '@tiptap/extension-task-list'
  - '@tiptap/extension-text-align'
  - '@tiptap/extension-text-style'
  - '@tiptap/extension-underline'
  - '@tiptap/pm'
  - '@tiptap/react'
  - '@tiptap/starter-kit'
  - lowlight
  - '@fontsource/ibm-plex-mono'
  - '@fontsource/ibm-plex-sans'
  - '@fontsource/newsreader'
  - recharts
  - katex
  - marked
  - turndown
  - discord.js # Node Discord bot fully removed; go-services/internal/discordbot owns it
delete_dev_dependencies: ['@types/katex', '@types/turndown']
reclassify_to_devDependencies: # vibe-package build inputs only, never imported by the app
  - pixi.js
  - lodash-es
  - immer
  - uuid
  - playwright # after R0-T5 deletes the Node vibe-screenshot fallback; scripts/epic/* keeps it as devDep
prune_config_references:
  - 'vite.config.ts heavyExternals: recharts, katex'
  - 'vite.config.ts ssrOnlyExternals: @tiptap/*'
reverify: |
  for d in <dep>; do grep -rE "from ['\"]${d}(/|['\"])|require\\(['\"]${d}" app components lib server hooks stores scripts cli testing; done
keep_despite_suspicion:
  [
    dotenv,
    '@napi-rs/canvas',
    canvas-confetti,
    epubjs,
    pdfjs-dist,
    monaco-editor,
    maplibre-gl,
    satori,
    '@resvg/resvg-js',
    web-push,
    reflect-metadata,
    tone,
    three,
    howler,
    react-markdown,
    fuse.js,
    jszip,
    sharp,
  ]
```

### 9.2 Dead code trees

```yaml
node_workers_superseded_by_go: # not built by pnpm build, absent from docker-compose; Go supervisor owns these in prod
  - server/bot-worker/
  - server/doctrine-worker/
  - server/recap/
  - server/vibe-worker/
  - server/status/
node_files:
  - lib/rmhvibe/vibe-screenshot.server.ts # Node thumbnail fallback; Go vibe-worker (chromedp) is authoritative
go_never_integrated:
  - go-services/cmd/ledger/ # no BUILD.bazel, no image, not deployed
go_realtime_duplicate: # R4-T1; tag pre-rewrite-go-realtime first
  - go-services/cmd/{gateway,gamehub,rmhbox,rmhmusic,rmhtube}/
  - go-services/internal/{gateway,gamehub,rmhbox,rmhmusic,rmhtube}/
  - go-services/pkg/realtime/
  - deploy/helm/rmhstudios-go/
  - deploy/helm/rmhstudios/ # legacy chart
  - deploy/deploy-go.sh
  - deploy/deploy-k8s.sh
  - deploy/k8s/
  - go-services/docker-compose.go.yml
repo_root:
  - specs/ # 5 legacy AI-agent specs, zero runtime references
reverify: "grep -rn '<path-or-symbol>' package.json Dockerfile docker-compose.yml deploy.sh .github/workflows/ app lib server"
```

### 9.3 Dead database models (schema.prisma line @ efb6269)

```yaml
drop: # accessor = prisma client property; reverify = must return empty
  - {
      model: RMHarkView,
      table: rmheet_view,
      line: 1603,
      accessor: rMHarkView,
      note: 'no writers; only reader scripts/reconcile-feed-counts.ts:38 (delete branch); views = denormalized viewCount via lib/hot-counters.server.ts',
    }
  - { model: RmhTubePlaylist, table: rmhtube_playlist, line: 979, accessor: rmhTubePlaylist }
  - {
      model: RmhTubePlaylistItem,
      table: rmhtube_playlist_item,
      line: 993,
      accessor: rmhTubePlaylistItem,
    }
  - { model: RmhTubeUserStats, table: rmhtube_user_stats, line: 1024, accessor: rmhTubeUserStats }
  - {
      model: RmhMusicQueueItem,
      table: rmh_music_queue_item,
      line: 1940,
      accessor: rmhMusicQueueItem,
    }
  - {
      model: RmhMusicChatMessage,
      table: rmh_music_chat_message,
      line: 1960,
      accessor: rmhMusicChatMessage,
    }
  - { model: BuildVersion, table: build_version, line: 2515, accessor: buildVersion }
  - {
      model: DoctrineSahurParticipation,
      table: doctrine_sahur_participation,
      line: 3019,
      accessor: doctrineSahurParticipation,
    }
  - {
      model: FeedAnnouncementPoll,
      table: feed_announcement_poll,
      line: 4222,
      accessor: feedAnnouncementPoll,
      note: 'orphaned parent; option/vote children have 1 ref each — collapse or drop family together',
    }
  - { model: SongRating, table: song_rating, line: 685, accessor: songRating }
review_before_drop:
  - {
      model: RMHarkCommentView,
      table: rmheet_comment_view,
      note: 'written per (comment,viewer) forever; confirm no product surface, then same procedure',
    }
not_dead_despite_zero_prisma_refs: # written by Go raw SQL or lib raw SQL — keep tables
  - {
      tables: 'ledger_artifact, ledger_plan_run, ledger_plan_step, ledger_step_input',
      writer: 'go-services/internal/ledger/repo.go',
    }
  - { tables: 'discord_alex_*, discord_chat_session', writer: 'go-services/internal/discordbot/*' }
  - {
      tables: 'ladder_worker_lease',
      writer: 'lib/rmhladder/worker-lease.ts raw SQL (retired by R2-T4, table kept until R5 review)',
    }
reverify_RV: |
  # per model: both must return nothing
  grep -rn "\.<accessor>\b" app lib server scripts components stores hooks go-services
  grep -rn "<table>" go-services lib/**/*.server.ts --include=*.go --include=*.ts | grep -v schema.prisma | grep -v migrations
```

### 9.4 Stale scripts

```yaml
delete: # unreferenced by package.json, Makefile, Dockerfile, deploy.sh, .github/, docker-compose
  - scripts/assign-handles.ts
  - scripts/generate-blog-data.ts # + committed scripts/blog-data.json
  - scripts/seed-official-builds.ts
  - scripts/seed-news-from-git.ts
  - scripts/dream-rift-card.ts
  - scripts/dream-rift-engine-shot.ts
  - scripts/dream-rift-preview.ts
  - scripts/dream-rift-stacked-shot.ts
  - scripts/void-breaker-balance-sim.ts
  - scripts/clear-lights-out-leaderboard.ts
  - scripts/build-timing-report.sh
confirm_with_owner_first:
  - scripts/migrate-avatars-to-r2.ts # weak references found — verify
  - scripts/migrate-blogs.ts # weak references found — verify
  - scripts/news-pipeline/ # 6 files, self-referenced only; possibly run manually
keep: 'everything wired to package.json scripts (ladder:*, i18n:*, epic:*, reconcile-*, albums:migrate, library:metadata, backfill-vibe-thumbs, emoji:shortcodes, build-vibe-packages, gen-* asset generators)'
```

### 9.5 Frontend extraction order (R3-T2 iterations, biggest graph first)

```yaml
games: # entry route → moved trees → heavy deps that leave the root
  - {
      name: velum2099,
      routes: 'velum2099.tsx',
      components: components/velum2099 (608KB),
      deps: [three, '@react-three/*', rapier],
    }
  - {
      name: forest-explorer,
      routes: 'forest-explorer.tsx +3',
      components: components/forest-explorer (64 files),
      deps: [three],
    }
  - {
      name: rmhbox-client,
      routes: 'rmhbox.tsx + rmhbox/ (4)',
      components: components/rmhbox (95 files),
      deps: [socket.io-client stays shared],
    }
  - {
      name: altair,
      routes: 'altair.tsx + altair/ (4)',
      components: components/altair,
      lib: lib/altair (48 files),
      deps: [howler],
    }
  - { name: cookgame, routes: 'cookgame.tsx', components: components/cookgame (34 files) }
  - {
      name: kowloon-knockout,
      routes: 'kowloon-knockout.tsx +1',
      components: components/kowloon-knockout (28),
      lib: lib/kowloon-knockout (46),
    }
  - { name: temple-of-joy, routes: 'temple-of-joy.tsx +1', lib: 'lib/temple-of-joy (89KB data)' }
  - {
      name: void-breaker,
      routes: 'void-breaker.tsx',
      lib: 'lib/void-breaker (game.ts 88KB + renderer 60KB)',
    }
  - { name: dream-rift, routes: 'dream-rift.tsx', lib: lib/dream-rift (33 files) }
  - { name: rmh-capital, routes: 'rmh-capital.tsx + (6)' }
  - { name: rmh-pmc, routes: 'rmh-pmc.tsx + (6)' }
  - {
      name: remaining-small,
      routes: 'slice-it, synapse-storm, neon-driftway, laundry-sort, lights-out, house-always-wins, rochester-offensive, adaptive-intelligence, versecraft (+1), rmh-farming-sim (+1)',
      note: "may share one 'arcade' package",
    }
apps:
  - { name: rmhtube, routes: 'rmhtube.tsx + rmhtube/ (2)' }
  - { name: rmhmusic, routes: 'rmhmusic.tsx + rmhmusic/ (3)', deps: [tone] }
  - { name: rmhtype, routes: 'rmhtype.tsx + rmhtype/ (4)' }
  - { name: rmhstudy, routes: 'rmhstudy.tsx + rmhstudy/ (2)' }
  - { name: rmhcode, routes: 'rmhcode.tsx + rmhcode/ (2)' }
  - { name: studio, routes: 'studio.tsx + studio/ (1)' }
  - {
      name: strategies,
      routes: 'strategies.tsx + strategies/ (13)',
      note: 'carries @tanstack/react-query if R3-T3 chose extraction',
    }
stays_in_shell: 'feed, profiles, messages, groups, communities, explore, search, news/blog/library, wallet/store, admin, developer docs, rmhladder (_site, SEO), login/legal, secret/*, liquid-glass + marketing pages, ALL /api routes'
single_import_isolations:
  - {
      dep: monaco-editor,
      only_site: components/admin/DynamicMonacoEditor.tsx,
      action: 'admin-only lazy island; candidate to replace with a lighter editor',
    }
  - {
      dep: maplibre-gl,
      sites: 'components/homes/ListingsMap.tsx, components/rideshare/RideMap.tsx',
      action: 'already lazy; stays in shell packages for homes/rideshare',
    }
```

---

## 10. Verification matrix (run at every phase gate)

```yaml
build:
  [
    'pnpm install',
    'pnpm exec tsc --noEmit (per-package after R3-T1)',
    'pnpm lint',
    'pnpm exec vitest run',
    'pnpm build',
    'docker compose config -q',
    'cd go-services && make gazelle && make test',
  ]
perf_ci: ['node scripts/ci/bundle-budget.ts --check', 'Lighthouse budget on / (shell)']
prod_kpis:
  web: [ttfb_p75_cached, ttfb_p75_authed, lcp_p75, inp_p75, cf_anon_html_hit_ratio_gt_80pct]
  db:
    [
      pool_wait_p99,
      statement_p99_per_schema,
      partition_drops_vs_bulk_deletes,
      counter_drift_pct,
      backup_success_and_drill_age,
    ]
  async: [queue_depth_p95, job_age_p95, job_failure_rate, like_path_server_p95]
  realtime:
    [
      connections_per_hub,
      events_delivered_over_published,
      deploy_reconnect_spike,
      hub_auth_cache_hit_rate,
    ]
  hygiene:
    [
      root_dependency_count,
      apps_web_route_file_count,
      routeTree_gen_line_count,
      dead_model_count_eq_0,
    ]
```

---

## 11. Non-goals (rejected with reasons — do not reopen without new evidence)

```yaml
- {
    id: NG-1,
    rejected: 'new framework/language (Next.js, Remix, SolidStart, full-Go SSR)',
    reason: 'shell is already ~334KB eager post-audit; framework was never the measured problem; a migration is a year of risk to move a number that needs 34KB',
  }
- {
    id: NG-2,
    rejected: 'microservices per product',
    reason: 'schemas (§4.1) + packages (§7.1) give pool/build/deploy isolation without network hops or distributed transactions',
  }
- {
    id: NG-3,
    rejected: 'finishing the Go hub port',
    reason: '17 games + 8 minigames of parity work duplicating a working tier; deleted instead, resurrectable from tag pre-rewrite-go-realtime',
  }
- {
    id: NG-4,
    rejected: 'renaming rmheet* tables to rmhark*',
    reason: 'touches all raw SQL, Go code, hand-written indexes; zero performance value',
  }
- {
    id: NG-5,
    rejected: 'Kafka/NATS/Redis-Streams/BullMQ',
    reason: 'pg-boss on existing Postgres covers thousands-of-jobs/min with backups included; Redis here is a lossy LRU',
  }
- {
    id: NG-6,
    rejected: 'cuid→UUIDv7 migration of existing tables; partitioning DM/group history',
    reason: 'cost exceeds benefit at current scale; PK policy applies to new tables only',
  }
- {
    id: NG-7,
    rejected: 'media relocation out of repo / git history rewrite',
    reason: 'owner decision OD-1',
  }
- {
    id: NG-8,
    rejected: 'SSR for games',
    reason: 'games are client apps; SEO surfaces (landing pages) stay in apps/web',
  }
```
