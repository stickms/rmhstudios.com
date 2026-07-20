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
- **Moderation/admin:** `moderation.server.ts`, `admin-audit.server.ts`,
  `admin-review.server.ts`, `security-reports.ts`.
- **Webhooks (outbound developer API):** `webhooks/` (emit, events,
  signature).
- **i18n:** `i18n/` — see below.

## Auth patterns (canonical)

```ts
// API route
const session = await auth.api.getSession({ headers: request.headers });
if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
// admin:
if (!(session.user as { isAdmin?: boolean }).isAdmin)
  return Response.json({ error: 'Forbidden' }, { status: 403 });
```

Session `tier` is injected by the `customSession` plugin from
`entitlements.ts`. Note `lib/auth.ts` requires `reflect-metadata` — it is
installed at startup by the Nitro plugin `server/nitro/reflect-metadata.ts`;
don't remove that plugin.

## Database (Prisma)

- `prisma/schema.prisma`: 234 models, 5600+ lines. IDs are
  `String @id @default(cuid())`; models `@@map` to snake_case tables; ~61
  enums. Model families: auth/user, social feed (RMHark*), per-game
  player/match tables, economy (CoinTransaction, inventory, quests),
  media/library, Stripe subscriptions, moderation, Ladder*, Doctrine*,
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

- 32 locales, 66 namespaces (`lib/i18n/config.ts`); RTL: `ar`, `ur`, `fa`.
- **Only `en` is statically bundled**; other locales are code-split chunks in
  the auto-generated `lib/i18n/resources.<locale>.ts` files. SSR lazily loads
  only the _active_ locale on demand via `resources.server.ts`
  (`preloadLocale()` is awaited in the `__root.tsx` root loader before render;
  the sync `getServerI18n` path then reads the warmed cache) — it no longer
  imports all 32 catalogs at boot.
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

- Main suite: `pnpm exec vitest run` (config `vitest.config.ts`) — covers
  `testing/` (RMHBox phases) and colocated tests under `lib/rmhladder`,
  `lib/cookgame`, `lib/dream-rift`, `lib/rmhark-ai`, `lib/personas`,
  `lib/predictions`, `lib/versecraft/gen`, `lib/kowloon-knockout`, and some
  `components/`.
- Separate: `pnpm epic:test` (`vitest.epic.config.ts`, 60s timeout, spawns
  Chromium) for `scripts/epic/`.
