# lib/ — shared logic, server helpers, schemas

> Scope: guidance for working inside `lib/` (~920 files, 80+ subdirectories).
> Repo-wide context: [`/CLAUDE.md`](../CLAUDE.md).

`lib/` is the shared brain of the app: auth, database, feed, economy, i18n,
per-game logic, and every server-side helper. It lives at the **repo root**
(not `app/lib/`) and is imported as `@/lib/...`.

## The `.server.ts` rule (most important convention here)

A Vite plugin (`stubServerFiles()` in `vite.config.ts`) replaces any module
matching `*.server.{ts,tsx,js,jsx}` with `undefined` stubs **in the client
bundle only**. SSR/server builds get the real module.

- Anything touching Prisma, `node:*`, `pg`, `ioredis`, S3, web-push, secrets,
  or heavy Node deps **must** be named `*.server.ts`.
- The import specifier must literally contain `.server` for stripping to work
  — no `index.server` barrel re-exports.
- Client-safe pure logic, types, and zod schemas go in a plain file. The
  standard split is a pair: `coins.server.ts` (mutations) + `coins-schema.ts`
  (zod), `reactions.server.ts` + `reactions.ts`, etc.
- Importing a `.server` module from client code fails at runtime with
  `undefined` exports — not at build time. Be careful.

## Load-bearing modules (know these ~20)

| Module                                     | What it is                                                                                                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `prisma.server.ts`                         | `prisma` singleton (`@prisma/adapter-pg`, pool via `DATABASE_POOL_SIZE`, default 10)                                                                                                        |
| `auth.ts`                                  | Better Auth server config: Discord/Google/GitHub + email/password, passkey + Stripe + customSession plugins, custom user fields `username/handle/isAdmin/isVerified`, auto-handle on signup |
| `auth-client.ts`                           | `authClient` for the browser                                                                                                                                                                |
| `entitlements.ts`                          | `getUserTier(userId)`, tier ranks, `hasApiAccess/...` — resolves Stripe subscription + gift membership                                                                                      |
| `rate-limit.ts`                            | `rateLimit(ip, opts)`, `getClientIp` — in-memory, per-process, × `RATE_LIMIT_MULTIPLIER` (default 4)                                                                                        |
| `cache.ts`                                 | `apiCache` in-memory TTL cache (`invalidatePrefix` supported)                                                                                                                               |
| `redis.server.ts`                          | optional ioredis backplane — `redisPublish/Subscribe/RateLimit/GetJSON/SetJSON`; **no-ops when `REDIS_URL` unset**                                                                          |
| `realtime-bus.server.ts`                   | `createBus<T>(namespace)` — EventEmitter + Redis fan-out; the seam under all SSE                                                                                                            |
| `feed-sse.ts` / `feed-types.ts`            | feed event bus + the `FeedItem` client contract                                                                                                                                             |
| `notifications.server.ts`                  | `createNotification/...` — respects preferences, mirrors to web push (`push/send.server.ts`)                                                                                                |
| `coins.server.ts`                          | `awardCoins()` — the **only** correct way to grant coins (ledger + profile update)                                                                                                          |
| `user-display.ts`                          | `userDisplaySelect` + `resolveUser` — shared user shape incl. cosmetics                                                                                                                     |
| `storage/s3.server.ts` + `storage/keys.ts` | R2/S3 object store with local-FS fallback; key builders + filename safety                                                                                                                   |
| `seo.ts` / `schema.ts`                     | `buildMeta`, `buildCanonical`, `SITE_URL`; JSON-LD builders + `jsonLdScript`                                                                                                                |
| `rum.ts` / `client-errors.ts`              | Web Vitals + client error beacons (installed in `__root.tsx`)                                                                                                                               |
| `games.ts` / `apps.ts`                     | the catalog: single source of truth for game/app cards                                                                                                                                      |
| `internal-auth.ts`                         | shared-secret server-to-server auth (`authorizeInternalRequest`)                                                                                                                            |
| `ssrf-guard.server.ts`                     | `safeFetch` — required for any user-supplied URL fetch                                                                                                                                      |
| `utils.ts`                                 | `cn()` (twMerge+clsx), `formatCount`, `timeAgoShort`, `formatRelativeTime`                                                                                                                  |

## Domain map

- **AI:** `ai/text.server.ts` — DeepSeek via the `openai` SDK
  (`DEEPSEEK_API_KEY`, `api.deepseek.com/v1`); exports `transformText`,
  `translateText`, `askFeed`, etc. Prompts treat user content as data
  (prompt-injection defenses) — preserve that when editing. `ai/recap.server.ts`,
  `ai/summarize.server.ts`, `rmhark-ai/` (AI bot posting, pairs with the bot
  worker).
- **Feed/social:** `feed/` (timeline assembly, ranking, personalization,
  cursors, mentions), `social/` (engagement, reactions), `messages.server.ts`,
  `group-chat/`, `bookmarks.server.ts`, `explore.server.ts`, `tags.server.ts`.
- **Economy/progression:** `coins.server.ts`, `xp/`, `quests/`,
  `achievements/`, `battlepass/`, `streak.server.ts`, `staking/`, `gifting/`,
  `shop/`, `store/`, `storefront/`, `wheel/`, `wrapped/`, `ranked/` (elo).
- **Media:** `storage/`, `media/` (upload/attach/quota/sweep/policy),
  `image-optimize.ts`, `video-optimize.server.ts`, `og/post-image.server.tsx`
  (satori/resvg OG cards), `library/`, `albums*.ts`.
- **RMHLadder:** `rmhladder/` — job-discovery pipeline (`adapters/` for
  Ashby/Greenhouse/Lever/SmartRecruiters/generic, `classifiers/`,
  `pipeline/`, `scoring.ts`, `verification.ts`, `seed/`, `server/`). Driven by
  `server/ladder-worker` on a cron; **heavily unit-tested** — keep colocated
  `.test.ts` files passing.
- **Per-game/app logic:** one subdir per game (`altair/`, `rmhbox/`,
  `slice-it/`, casino games, `doctrine/`, `versecraft/`, …) and per app
  (`rmhtube/`, `rmhmusic/`, `rmhtype/`, `rmhstudy/`, `rmhvibe/`, `studio/`,
  `personas/`, `rideshare/`, `homes/`, `predictions/`). Realtime client
  sockets live at `lib/<app>/socket.ts` with event names in
  `lib/<app>/events.ts` (see `server/CLAUDE.md`).
- **`shared/`:** the cross-app tier. `realtime/client.ts` is the socket.io
  factory every app's `socket.ts` builds on (fast reconnect, wake signals,
  per-attempt auth, an opt-in outbox); `realtime/types.ts` holds the
  `RealtimeStatus` contract and the 15s `PEER_GRACE_MS` that the server's
  `PresenceGrace` reads too. `platform.ts` wraps the browser APIs that aren't
  everywhere (Web Audio — **always** go through `getAudioContext()`, never
  `new AudioContext()` — plus haptics, idle callbacks, wake lock, fullscreen,
  WebGL detection). `app-toast.ts` is the toast store for the full-screen apps.
- **Moderation/admin:** `moderation.server.ts`, `admin-audit.server.ts`,
  `admin-review.server.ts`, `security-reports.ts`.
- **Webhooks (outbound developer API):** `webhooks/` (emit, events,
  signature).
- **i18n:** `i18n/` — see below.

## Auth patterns (canonical)

```ts
// API route — the wrapper does the session check, so handlers never repeat it.
import { defineHandler } from '@/lib/api/handler.server';

POST: defineHandler({}, async ({ userId }) => …);                 // 401 if signed out
POST: defineHandler({ auth: 'admin' }, async ({ userId }) => …);  // 401 / 403
POST: defineHandler({ auth: 'optional' }, async ({ userId }) => …); // userId: string | null
```

Reach for the raw call below only outside an API route (server functions,
workers) — inside `app/routes/api/**` use `defineHandler`:

```ts
const session = await auth.api.getSession({ headers: request.headers });
```

Session `tier` is injected by the `customSession` plugin from
`entitlements.ts`. Note `lib/auth.ts` requires `reflect-metadata` — it is
installed at startup by the Nitro plugin `server/nitro/reflect-metadata.ts`;
don't remove that plugin.

## Database (Prisma)

- `prisma/schema.prisma`: 252 models, ~6000 lines. IDs are
  `String @id @default(cuid())`; models `@@map` to snake_case tables; 66
  enums. Model families: auth/user, social feed (RMHark*), per-game
  player/match tables, economy (CoinTransaction, inventory, quests),
  media/library, Stripe subscriptions, moderation, Ladder*, Doctrine\*,
  rideshare/homes, messaging.
- **New-table PK policy (rewrite R0-T7):** existing tables keep their `cuid()`
  PKs (the keyset `(createdAt desc, id desc)` indexes make them scannable). For
  any NEW append-only / high-volume table, prefer a time-sortable key —
  UUIDv7/ULID or `BigInt` identity — for insert locality, so a second
  `(fk, createdAt)` index isn't needed just to scan it.
- Workflow: `pnpm db:push` for local dev; real migrations via
  `pnpm db:migrate` (dev) / `pnpm db:migrate:prod` (deploy runs this).
  `postinstall` runs `prisma generate`.

## i18n pipeline

- 16 locales, 67 namespaces (`lib/i18n/config.ts`); RTL: `ar`, `ur`.
  `LOCALES` and `NAMESPACES` there are the registry: `locales/` on disk carries
  more directories and more `en/*.json` files than are registered, and anything
  unregistered is **never loaded** (the UI silently serves `defaultValue`s).
  Adding a namespace file means adding it to `NAMESPACES` in the same commit.
- **Only `en` is statically bundled**; other locales are code-split chunks in
  the auto-generated `lib/i18n/resources.<locale>.ts` files. SSR lazily loads
  only the _active_ locale on demand via `resources.server.ts`
  (`preloadLocale()` is awaited in the `__root.tsx` root loader before render;
  the sync `getServerI18n` path then reads the warmed cache) — it no longer
  imports all 16 catalogs at boot.
- Flow when strings change: `pnpm i18n:extract` (scan `t()` calls into
  `locales/*/…json`) → `pnpm i18n:translate` (machine-translate) →
  `pnpm i18n:resources` (regenerate the resource modules) →
  `pnpm i18n:coverage` (verify; `--strict` gate available).
- Locale resolution: `rmh-lang` cookie → Accept-Language → `en`
  (`lib/i18n/resolve.ts`); `<html lang/dir>` is set pre-paint by an inline
  script in `__root.tsx`.

## Caching / realtime / jobs

- Layers: `apiCache` (in-process TTL) → optional Redis (`redis.server.ts`) —
  everything degrades gracefully without Redis.
- All SSE rides `createBus` (`realtime-bus.server.ts`): local EventEmitter +
  optional Redis pub/sub.
- **No cron in the web tier.** Background work runs in separate processes
  (`server/` workers, Go supervisor — see `server/CLAUDE.md`). One notable
  lazy pattern: scheduled posts have no worker;
  `scheduled/publish.server.ts#publishDueForUser` materializes due posts when
  the author's timeline is touched.

## Placement quirks (historical inconsistency — follow existing neighbors)

- Some hooks live in `hooks/`, others as `lib/use*.ts` (`useStreak`,
  `useUnreadCount`, `usePushSubscription`, …).
- Zustand stores live in `stores/` (site-level) but also `lib/store/` and
  `lib/studio/store.ts` (feature-level).
- When adding new code, prefer `hooks/` for hooks and `stores/` for
  site-level stores; keep feature-internal state next to its feature.

## Testing

- Main suite: `pnpm test` (config `vitest.config.ts`, ~37s). Discovery is a
  **glob** — every `*.test.ts(x)` in the repo runs, and there is nothing to
  register. (It used to be a curated `include` list, and two test files sat in
  the repo for months without ever running because of it;
  `lib/__tests__/test-discovery.test.ts` is the gate that keeps that from
  recurring.) `pnpm test <path>` takes any file or directory.
- Separate: `pnpm test:epic` (`vitest.epic.config.ts`, 60s timeout, launches
  Chromium) for `scripts/epic/`, gated by `.github/workflows/epic-tests.yml`.
- Coverage: `pnpm test:coverage` — informational, never a gate.
- **Isolation is on and stays on.** `--no-isolate` is ~40% faster and produces
  order-dependent failures (`lib/rmhladder/pipeline/*` fail on a different set
  of seeds each shuffle). Details and the rest of the speed work:
  [`docs/testing.md`](../docs/testing.md) §Speed.
- **`lib/__tests__/` is where the repo's consistency is executable.** The
  design/tab-strip gate, the game-viewport contract, the filter-cost budget,
  the theme-token and colour-vision contracts, the API-handler adoption
  backlog, the i18n catalog/namespace integrity, the rAF-loop allowlist and the
  server-bundle copy check all live there, and `pnpm check:consistency` runs
  that subset on every commit. When you fix one of their backlog entries,
  **delete the entry in the same commit** — those lists are one-directional and
  each has a test that fails when an entry no longer violates its rule, so a
  stale allowlist cannot quietly become permanent.

## Before you commit to `lib/`

`pnpm check:consistency` (repo `CLAUDE.md` → "The commit gate") runs before
every commit. On top of what it checks:

- [ ] **`.server` discipline:** anything touching Prisma, `node:*`, secrets or
      heavy Node deps is named `*.server.ts`, the specifier literally contains
      `.server`, and no client component imports it (it fails at *runtime* with
      `undefined` exports, not at build time).
- [ ] **One way to do each thing:** coins only through `awardCoins()`, user
      shapes through `userDisplaySelect`/`resolveUser`, user-supplied URLs
      through `safeFetch`, SSE through `createBus`, audio through
      `getAudioContext()`. A second path is the drift this directory exists to
      prevent.
- [ ] **Schema changes carry a migration** (`pnpm db:migrate`) — `db:push` is
      dev-only, and deploys run `prisma migrate deploy`. New high-volume tables
      take a time-sortable key (rewrite R0-T7).
- [ ] **i18n edits keep the registry honest:** a new `locales/en/<ns>.json`
      needs its `NAMESPACES` entry in `lib/i18n/config.ts` in the same commit,
      or nothing ever loads it.
- [ ] **Colocated tests still pass** — `lib/rmhladder/` in particular is
      heavily unit-tested, and its suite is the contract for the pipeline.
