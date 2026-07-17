# RMH Studios — Scalability & Future-Proofing Audit

**Document type:** Full-codebase scale-readiness audit + phased roadmap
**Prepared:** 2026-07-17
**Scope:** Everything — database & Prisma layer, feed/social architecture (RMHarks), caching & shared state, realtime (SSE + Node socket hubs + Go fleet), infrastructure/deploy/observability, frontend load performance, and security/abuse at scale.
**Goal:** identify what breaks (and in what order) as users and data grow 10x–100x, and lay out the concrete path to an enterprise-grade, horizontally scalable, extremely fast, and secure platform — with special attention to the social layer.

> **How to read this.** Findings are grouped by dimension. Every finding is anchored to `file:line` on this branch. Each dimension opens with what is **already strong** (this codebase is unusually well-engineered for its size — many "obvious" fixes are already done and are listed so they don't get re-recommended). A consolidated **phased roadmap** is at the end.
>
> **Relationship to other docs.** This complements (does not replace) `docs/website-improvement-plan.md` (2026-06-30, product/quality audit), `docs/opti/plan.md` (2026-06-20, dead-code/bundle work — mostly executed), `docs/feed/plan.md` (feed design doc; Phases 2/4 deferred there are re-prioritized here), and the two security audits (`docs/security-audit-2026-07-12.md`, `-13.md`) whose still-open items are carried forward in §7.

---

## 0. Executive summary — what breaks first

Production today is a **single VPS** running Docker Compose: one Node SSR web instance (blue/green flipped), three Node realtime hubs, two Node workers, a Go supervisor/status/assets fleet, an ephemeral Redis, and **Postgres on the same host**. Cloudflare fronts one Apache. This is disciplined single-box engineering — but every stateful tier is a single point of failure, and most coordination assumes one process.

**Ordered by "what fails first as load grows":**

| # | Failure | Where | Trigger point |
|---|---|---|---|
| 1 | **Total data loss on host failure — there are no database backups at all** (no pg_dump, no WAL archiving, nothing in the repo) | VPS / deploy | Any disk/host failure, at any scale |
| 2 | **Feed SSE firehose**: every post/like event broadcast to every connected client over a single channel key, with a ~1,000-listener per-process ceiling | `lib/feed-sse.ts:88`, `lib/realtime-bus.server.ts:24` | ~1k concurrent feed viewers per instance |
| 3 | **Unauthenticated `ILIKE '%q%'` search** — full-table scans on the largest tables, feed search not rate-limited, cache explicitly bypassed | `app/routes/api/rmharks.ts:23-70`, `app/routes/api/search.ts:41-90` | One attacker, today |
| 4 | **Postgres connection exhaustion** — no PgBouncer/pooler anywhere; every process opens its own pool (~42 direct connections today); each web replica adds 10 | `lib/prisma.server.ts:13-18`, `server/shared/prisma-client.ts:26-31` | 2nd–8th web replica |
| 5 | **Hot-row write contention** — every post view is a synchronous `UPDATE` on the post row; every heartbeat updates `user.lastSeenAt`; viral posts serialize likes/views/comments on one row | `app/routes/api/rmharks/$id/view.ts:25-28`, `app/routes/api/presence/heartbeat.ts:22-24` | First viral post |
| 6 | **In-process caches & rate limits break on the 2nd web instance** — ~12 `apiCache` consumers, the main `rateLimit()` store, and Better Auth throttles are all per-process; invalidation is local-only | `lib/cache.ts:23-84`, `lib/rate-limit.ts:16-89`, `lib/auth.ts:34-47` | 2nd web replica |
| 7 | **Node socket hubs have no backplane** — no Socket.IO Redis adapter, all game/lobby state in module `Map`s, restart drops every session; the Go fleet's Redis fan-out (the intended fix) has a confirmed origin-tagging bug that silently drops all cross-replica broadcasts | `server/socket-server/index.ts:125-135`, `go-services/pkg/events/events.go:114-139` | 2nd hub replica / every deploy |
| 8 | **Zero bot resistance** — no CAPTCHA/Turnstile anywhere, no email verification, IP-keyed spoofable rate limits | `lib/auth.ts:48-67`, repo-wide | First motivated abuser |
| 9 | **Unbounded data growth** — no cleanup/TTL for notifications, sessions, comment-views; no partitioning; soft-deleted posts accumulate forever | `prisma/schema.prisma` + absence of any cleanup job | Months of organic growth |
| 10 | **Operating blind** — Go services emit Prometheus metrics into the void (no scraper), no log aggregation, no alerting, no error tracker; the uptime monitor runs on the box it monitors | `go-services/pkg/telemetry/telemetry.go`, `docker-compose.yml:217-252` | First serious incident |

**The single biggest cross-cutting theme: Redis is already provisioned in production (`docker-compose.yml:284-302`) and the code has correct seams for it (`lib/redis.server.ts`, `lib/realtime-bus.server.ts`) — but almost nothing uses it.** Rate limiting, data caching, session validation, presence, counters, and the socket hubs all still assume one process. Most of Phase 1 below is *wiring*, not new infrastructure.

---

## 1. Database & data layer

### Already strong — do not re-do
- **Denormalized counters on posts** — `RMHark.likeCount/commentCount/repostCount/viewCount` (`prisma/schema.prisma:1376-1379`), maintained atomically in transactions, reconciled by `scripts/reconcile-feed-counts.ts`. Feed reads never do `_count`.
- **Denormalized `User.followerCount`** (`prisma/schema.prisma:38`, indexed at `:313`), maintained in `lib/social/engagement.server.ts:213-241`; `Community.memberCount` with a desc index (`:4283, :4292`).
- **Keyset/cursor pagination + matching composite indexes** on the feed: `@@index([createdAt desc, id desc])` (`:1434`), per-author (`:1438`), and a hand-written **partial index** `rmheet_feed_scan_idx` (migration `20260716000000`) matching the feed's WHERE clause.
- Uniqueness guards on all join tables (likes/follows/reactions) prevent duplicates; FK backfill indexes exist (migration `20260621120000`).

### 1.1 Connection pooling — the structural blocker (P0)
- **No pooler anywhere.** Grep for `pgbouncer|pooler|connection_limit` across compose/deploy/env: nothing. Today's direct-connection budget: web (10, `lib/prisma.server.ts:13-18`) + 5 Node services × 5 (`server/shared/prisma-client.ts:26-31`) + Go supervisor (5, `go-services/pkg/config/config.go:43`) + status (2) ≈ **42**, plus +10 during blue/green overlap. Postgres defaults to ~100 `max_connections`; 8 web replicas alone would consume 80.
- **Fix:** PgBouncer in transaction-pooling mode in front of Postgres; point every `DATABASE_URL` at it; size app pools deliberately (`replicas × pool ≤ max_client_conn`). Document `DATABASE_POOL_SIZE`/`SERVER_DB_POOL_SIZE` in `.env.example` (currently undocumented). Add a **read replica** for feed/explore/leaderboard/search reads once on managed Postgres (§5.1).

### 1.2 Hot-row writes (P0)
| Path | Anchor | Problem | Fix |
|---|---|---|---|
| Post views | `app/routes/api/rmharks/$id/view.ts:25-28` | Unconditional `UPDATE rmheet SET viewCount = viewCount + 1` **per impression** — the highest-frequency single-row write in the system; competes with like/comment updates on the same row for viral posts | Buffer in Redis (`INCR`), flush to Postgres periodically (the reconcile script is already the drift-correction seam). Never synchronously UPDATE the post row per impression |
| Presence heartbeat | `app/routes/api/presence/heartbeat.ts:22-24` (client: `lib/usePresenceHeartbeat.ts:28`) | Every logged-in tab UPDATEs `user.lastSeenAt` every 60s — continuous churn/autovacuum pressure on the biggest table | Presence in Redis with TTL; drop the Postgres write (or move to a narrow `user_presence` table). Replace `online-count`'s full-table `COUNT` (`app/routes/api/presence/online-count.ts:15-17`, unindexed `lastSeenAt`) with a Redis counter |
| Likes/follows | `lib/social/engagement.server.ts:59-82, 206-241` | Correct and idempotent, but each serializes on the target row — viral post / celebrity follow spikes contend | Acceptable until very large; then sharded counters or async counter pipeline. Keep as-is for now, monitor lock waits |

### 1.3 Missing indexes & wrong query shapes (P1)
- **`UserProfile` has zero indexes** (`prisma/schema.prisma:1641-1691`) while `lib/leaderboard.server.ts:53-58` sorts the whole table by `xp desc` per request, uncached. → Add `@@index([xp(sort: Desc)])` + cache top-100 (§3).
- **Explore ignores the denormalized counter**: `lib/explore.server.ts:89-94` uses `orderBy: { followers: { _count: 'desc' } }` — a correlated COUNT over the whole `follow` table per request — when `User.followerCount` + index already exist. → One-line fix to `orderBy: { followerCount: 'desc' }`.
- **Profile page does three `COUNT(*)` aggregates per view** (`lib/profile.server.ts:54-56` / `:180-182`) instead of using `followerCount`. → Use the column; add denormalized `followingCount` and `postCount`.
- **`Follow` lacks `(followingId, createdAt desc)`** composite (`prisma/schema.prisma:1802-1814`) for paginated follower lists (`app/routes/api/profile/$id/followers.ts:27-37`); those lists also use a timestamp-only cursor that drops/duplicates rows on ties → convert to keyset `(createdAt, id)`.
- **DM conversation list cursor is inconsistent** (`lib/messages.server.ts:30-54`): `orderBy: lastMessageAt` but `cursor: { id }`, plus a two-column `OR` that defeats indexing. → Cursor on `(lastMessageAt, id)`; consider a `ConversationParticipant` join model.
- **DM unread** filters `read = false` with no supporting index (`prisma/schema.prisma:2093-2113`) → partial index `WHERE read = false` (or better: denormalized unread counters, §2.4).

### 1.4 Search: `ILIKE '%q%'` everywhere (P0 — also a security issue, §7)
- Unified search (`app/routes/api/search.ts:31-90`), user autocomplete (`app/routes/api/users/search.ts:24-35`), hashtag feeds (`lib/tags.server.ts:37-48`), and feed search (`lib/feed/timeline.ts:446-447, 520-521`) all use `contains`/`mode: insensitive` → leading-wildcard `ILIKE` → **sequential scans** that B-tree indexes cannot serve.
- **Fix (staged):** (a) extract hashtags at write time into `Hashtag` + `PostHashtag` tables — stop scanning `content` for `#tag`; (b) `pg_trgm` GIN indexes on `user.name/username/handle` for people search; (c) Postgres FTS (`tsvector` + GIN) for post search as the interim; (d) a dedicated search engine (Meilisearch/Typesense/OpenSearch) as the durable answer at very large scale.

### 1.5 Data lifecycle: nothing is ever cleaned up (P1)
- **No TTL/cleanup jobs and no partitioning anywhere** (checked all 100+ migrations, `scripts/`, Node workers, Go workers). Specifically:
  - `session`/`verification` rows are never purged (Better Auth doesn't GC them here).
  - `notification` grows unbounded per user forever.
  - `rmheet_comment_view` gets one row per (comment, viewer) forever (`app/routes/api/rmharks/$id/comment/$commentId/view.ts:26`).
  - Soft-deleted posts (`RMHark.deletedAt`) stay in the hot table forever.
  - `RMHarkView` (`prisma/schema.prisma:1582`) appears **dead** — nothing creates rows — confirm and drop.
- **Fix:** a scheduled cleanup worker (new Go supervisor goroutine — the worker-lease pattern already exists in `server/ladder-worker/index.ts:157-183`): purge expired sessions/verifications, trim notifications past N days / M per user, age out comment-views, hard-delete soft-deleted posts past a grace window. **Partition** `notification`, `direct_message`, and `*_like`/`*_view` tables by month (`RANGE`) so old partitions drop in O(1) and autovacuum stays bounded.

### 1.6 Primary keys (P3 — forward-looking only)
All 201 PKs are `cuid()` strings. For the future 100M+-row append-only tables (likes, views, notifications), 25-char text PKs mean ~2-3× wider indexes and poor insert locality. Not worth migrating existing tables; **for new high-volume append-only tables prefer `BigInt autoincrement` or time-sortable ULIDs.**

### 1.7 Migration safety at scale (P1)
`prisma migrate deploy` runs during deploy (`deploy.sh:733-750`) with **no `lock_timeout`/`statement_timeout`**. On a large table, an `ALTER TABLE` takes an `ACCESS EXCLUSIVE` lock — at scale that's an outage, not a blip. → Wrap migrations with `SET lock_timeout = '5s'` + retries; adopt expand/contract discipline; use `CREATE INDEX CONCURRENTLY` for indexes on big tables (requires running outside a transaction — Prisma supports this via `-- @raw` migration files).

---

## 2. Feed & social architecture (RMHarks)

### Already strong — do not re-do
- **Single unified read path** `getTimeline()` (`lib/feed/timeline.ts:719`) — one seam for caching/ranking/fan-out changes.
- Keyset cursors with legacy tolerance (`lib/feed/cursor.ts`); batched author-display resolution (`getUserDisplayMap`); bounded reaction aggregates via `groupBy` (`lib/feed/timeline.ts:199-234`) instead of per-row joins.
- **DMs and group chats already use correctly-targeted per-user/per-group realtime channels** (`lib/message-events.ts:53`, `lib/group-events.ts:53`) — this is the model the feed must adopt.
- Anonymous first-page feed cached 30s (`lib/feed/timeline.ts:714-734`); interest profiles have a proper L1+L2 (in-process + Redis) cache (`lib/feed/personalize.server.ts:50-95`) — **the exemplar pattern for §3**.
- Media pipeline: WebP conversion capped at 2048px with magic-byte validation (`app/routes/api/rmharks/image.ts`), dimensions baked into filenames for CLS-free layout, R2/S3 storage with immutable cache headers.

### 2.1 The SSE firehose — the first thing that breaks (P0)
- One channel key `FEED_KEY = "all"` (`lib/feed-sse.ts:88-114`). Every `rmhark.created`, `rmhark.liked/commented/reposted/deleted/edited` (`app/routes/api/rmharks.ts:301`, `lib/social/engagement.server.ts:64`) goes to **every SSE connection on every instance**; per-viewer "targeting" happens client-side after delivery (`app/routes/api/feed/stream.ts:57-73`). Even **mentions** — which carry `targetUserIds` (`lib/feed/notify-mentions.server.ts:50`) — travel the global channel and get discarded by everyone except the target.
- The bus's `EventEmitter` has `setMaxListeners(1000)` (`lib/realtime-bus.server.ts:24`) — a real ~1k-concurrent-feed-viewers ceiling per process. The stream endpoint has **no rate limit, no connection cap, and allows anonymous connections**.
- Wire cost at scale: 1M connected clients × 10 posts/sec ≈ 10M SSE writes/sec globally. **This breaks well before "millions of users."**
- **Fix:** keyed channels. Publish `rmhark.created` to per-follower (or follower-shard) channels using the fan-out from §2.2; put engagement patches on **per-post channels** that only clients currently viewing that post subscribe to; move mentions/DM-class events to the per-user channels that already exist. Cap SSE connections per user/IP; require auth for the personalized stream. The `createBus` abstraction already supports arbitrary keys — this is a topology change, not a rewrite.

### 2.2 Feed generation: fan-out-on-read with no cache for signed-in users (P1)
- **Following feed** (`lib/feed/timeline.ts:424-508`): loads the viewer's **entire follow list** (`lib/social/follow-graph.server.ts:19-28`) and passes it as `userId IN (...)` — unbounded; a user following 50k accounts ships a 50k-element array into the planner on every request.
- **For You** (`timeline.ts:514-603`): a global reverse-chron scan; ranking (`lib/feed/ranking.ts:106`) only reorders the ~20-40 rows of the current page. The audience `OR` (PUBLIC / self / FOLLOWERS+IN) defeats the partial feed index for signed-in viewers.
- **Signed-in feed reads have no cache at all** — every app-open runs two `findMany`s + in-memory merge.
- **Fix (staged, matches `docs/feed/plan.md` Phases 2/4 which were deferred):**
  1. **Phase 2 now:** Redis read-cache for the first feed page per user (short TTL, invalidated by the user's own posts/follows), and cache hydrated post objects by id so pages share hydration.
  2. **Phase 4 when growth demands:** hybrid fan-out-on-write — materialize a `FeedEntry(ownerId, postId, createdAt)` timeline table for authors under ~10k followers at post time (async, via the queue from §4.5); merge-on-read only for whale authors. This removes both the unbounded `IN` and the global scan.

### 2.3 Comments, polls, reactions (P1)
- **Comments load unbounded**: the GET fetches *every* comment for a post, builds the tree in memory, and computes per-comment `_count`s (`app/routes/api/rmharks/$id/comment.ts:30-79`). A 100k-comment thread = 100k rows + aggregates per open. → Keyset-paginate within parents; denormalize per-comment like/reply counts like posts.
- **Poll tallies aggregate live on every feed render** (`lib/feed/timeline.ts:64-82` `_count.votes` per option). → Denormalize vote counts per option.
- **Reaction toggle re-reads all reaction rows for the post** (`lib/social/reactions.server.ts:33`) — unbounded on viral posts. → Return the bounded `groupBy` summary instead.

### 2.4 Notifications & unread counts (P1)
- Unread badge = `notification.count({ userId, read: false })` polled every 45s per client (`app/routes/api/notifications/unread-count.ts:15`, `lib/useNotificationCount.ts:73`); DM unread is worse — the DM stream **recomputes full unread (all conversations) on every delivered event** and force-closes/reconnects every 5 minutes (`app/routes/api/messages/stream.ts:9-28, 95-117`). At 1M active clients that's ~22k count-queries/sec for notifications alone.
- Viral-post pile-on: 100k likes → 100k notification rows + 100k preference reads for one recipient (`lib/notifications.server.ts:92-143`).
- **Fix:** denormalized unread counters (Redis or columns) updated on insert/mark-read, pushed as deltas over the already-correct per-user channels; coalesce like/repost notifications per entity ("X and 500 others"); cache notification preferences; stagger or drop the 5-minute stream force-close.

### 2.5 Explore/trending computed per request (P2)
`listExplore` (`lib/explore.server.ts:44-117`) scans 400 recent posts + regex-extracts hashtags + runs the `_count` user sort **on every explore open**, uncached (`app/routes/api/explore.ts:13`). → Background-precompute trending/suggestions on a 1-5 min cadence into Redis; serve explore from cache. (The hashtag table from §1.4 makes trending a simple indexed GROUP BY.)

### 2.6 Media serving edge cases (P2)
- The on-demand image variant route (`app/routes/api/feed/image/$filename.ts:32`) runs sharp per request on cache miss with **no GET rate limit** and accepts arbitrary `?w=` — cache-busting forces unbounded re-encodes (CPU DoS) if the CDN is bypassed. → Restrict to a fixed set of variant widths; rate-limit; production should serve exclusively from CDN.
- The local-filesystem storage fallback (`lib/storage/s3.server.ts:49-62`) silently breaks with >1 instance. → Fail loudly when S3/R2 is unconfigured in multi-instance mode.

---

## 3. Caching & shared state

### Already strong — do not re-do
- The **Redis backplane seam exists and degrades gracefully** (`lib/redis.server.ts`) — pub/sub, atomic rate limit, JSON get/set, all no-op without `REDIS_URL`. Redis runs in prod (`docker-compose.yml:284-302`).
- `lib/feed/personalize.server.ts:50-95` is the **correct L1 (in-process) + L2 (Redis) template**.
- The developer API is exemplary: Redis-first rate limiting with fallback, DB-backed idempotency, tier-scaled limits, `X-RateLimit-*` headers (`lib/api/with-developer-api.server.ts`).
- Static assets: immutable + 1y max-age on hashed assets; SWR on RSS/sitemap/oembed/OG routes; SSE correctly `no-cache`.
- React Query defaults are conservative (`components/Providers.tsx:22-34`: 60s staleTime, no focus refetch) — clients won't stampede.
- Every in-process cache is memory-bounded with GC timers.

### 3.1 In-process caches become incoherent at 2 instances (P1)
`apiCache` (`lib/cache.ts:23-84`) is a per-process Map; `invalidate*()` only clears the local instance. Coherence-sensitive consumers:

| Consumer | Anchor | TTL | Risk on multi-instance |
|---|---|---|---|
| User tier/entitlements (runs on **every authed request** via `customSession`) | `lib/entitlements.ts:69-95`, `lib/auth.ts:139-142` | 60s | Stale membership after Stripe/gift events |
| Author display cards (feed hot path) | `lib/user-display.server.ts:39-51` | 60s | Stale avatars/names, N× re-warm |
| Following-ids (feed audience filter) | `lib/social/follow-graph.server.ts:19-27` | 30s | Follows not reflected cross-instance |
| Hidden authors (blocks/mutes) | `lib/moderation.server.ts:22-35` | 30s | **Correctness: blocks may not hide content for 30s on other instances** |
| Sidebar pools, doctrine leaderboards, OG PNG renders | `lib/sidebar-data.ts:73-213`, `lib/og/*.tsx` | 60-600s | Thundering-herd recompute ×N on cold start |

**Fix:** a shared `cached(key, ttl, loader)` helper backed by `redisGetJSON/SetJSON` (promote the personalize pattern); broadcast `invalidate*()` over Redis pub/sub (reuse `createBus`) so all instances drop keys together.

### 3.2 Rate limiting is per-process (P0 — also §7)
`lib/rate-limit.ts:16-89` is an in-memory Map used by **~180-207 route call sites**; only ~8 use `redisRateLimit`. N instances → N× effective limits; every deploy resets counters. Better Auth throttles are also memory-backed by default (`lib/auth.ts:38`). **Fix:** make `redisRateLimit`-with-fallback the default inside `rateLimit()` itself (one wrapper change covers all call sites); set `BETTER_AUTH_RATE_LIMIT_DB=1` (or Redis secondary storage) in production.

### 3.3 Session validation hits Postgres on every request (P1)
No `session.cookieCache` in Better Auth config (`lib/auth.ts:17-144`); the Go fleet does a raw `SELECT ... FROM session JOIN user` per request/WS handshake with no cache (`go-services/pkg/auth/auth.go:47-80`). The request-scoped WeakMap (`lib/auth-session.server.ts:24-45`) only dedupes within one render. **Fix:** enable Better Auth cookie cache (signed, 30-60s TTL — pair with the existing `invalidateUserTier` seam for revocation) and/or a short-TTL Redis session cache consulted by both Node and Go before Postgres.

### 3.4 No edge caching of anonymous pages (P1 — the biggest cheap 100x lever)
SSR HTML sets no `Cache-Control` anywhere; Apache adds none (`deploy/apache/rmhstudios.conf` is a pure proxy); no ETags exist in `app/routes`. Anonymous landing/blog/news/game/leaderboard pages are fully dynamic per request. **Fix:** emit `Cache-Control: public, s-maxage=60-300, stale-while-revalidate=…` on SSR responses **when no auth cookie is present**, and let Cloudflare absorb anonymous read load; add ETags to hot public JSON.

### 3.5 Redis hardening for its new role (P2)
Today's Redis is 256mb `allkeys-lru` with **no persistence** (`docker-compose.yml:294-296`) — fine as a pure cache, wrong once it becomes the source of truth for rate limits, presence, unread counters, and buffered view counts. **Fix:** size it deliberately, enable AOF or move to managed Redis (§5.1), and split cache vs. state concerns (or accept documented loss semantics per key class). Add `REDIS_URL` to `.env.example` (currently absent — operators provisioning from the template silently run in degraded single-instance mode).

---

## 4. Realtime: SSE, Node socket hubs, Go fleet

**The architectural fact that matters most:** there are **three independent realtime systems with incompatible scaling stories** — the web SSE bus (Redis-capable, correct), the Node Socket.IO hubs (no backplane at all, single-process by documented design — `server/CLAUDE.md`), and the Go hub fleet (backplane scaffolded but broken, not in the production path). Unifying on one Redis backplane is the strategic move.

### Already strong — do not re-do
- Room-scoped broadcasts everywhere except casino (`server/rmhbox/lobby-manager.ts:135-148`, `server/rmhtube/sync-engine.ts:127-197`).
- rmhtube restores rooms from the DB on boot and persists every mutation fire-and-forget (`server/rmhtube/room-manager.ts:171-1235`) — the durability model the other hubs should copy.
- `connectionStateRecovery` on rmhbox/rmhtube; disconnect grace timers; duplicate-session eviction; worker leases with overlap guards (`server/ladder-worker/index.ts:157-183`).
- Go `Conn` backpressure (256-msg buffer, slow-consumer drop) — better discipline than the Node hubs.
- The internal HTTP→SSE bridge for bot workers (`app/routes/api/internal/notify-message.ts` + `lib/internal-auth.ts`) is a clean, secret-authorized pattern.

### 4.1 Casino global broadcast — pure win, fix immediately (P0)
`broadcastRoomList` does a **server-wide `io.emit`** to every connected socket (all 18 games) on every casino room mutation: `server/socket-server/handlers/holdem.ts:251-264` (fired from 6 sites), `blackjack.ts:282`, `roulette.ts:198`, `baccarat.ts:186`. O(all connections × room churn). **Fix:** scope to a `casino:lobby` room clients explicitly join. No architecture change needed.

### 4.2 Auth handshake thundering herd (P0)
- socket-server: a `SELECT ... FROM session` per connection on a max-10 pool (`server/socket-server/index.ts:49-107`), **no `connectionStateRecovery`** (present on the other two hubs), no reconnect jitter → a restart makes every client re-handshake simultaneously.
- rmhbox is worse: hard auth with a **Discord API round-trip per connection** (`server/rmhbox/auth.ts:60-100`) — a reconnection storm becomes a Discord rate-limit lockout.
- **Fix:** short-TTL in-process (later Redis) session-token cache; enable `connectionStateRecovery` on socket-server; client reconnect jitter; drain connections before deploys.

### 4.3 Single-process ceilings & restart data loss (P1)
- No Socket.IO Redis adapter anywhere (`server/socket-server/index.ts:125-135`; nothing in `package.json`). All lobby/game state is module-level `Map`s (`server/rmhbox/lobby-manager.ts:46-58`, `handlers/altair.ts:145-149`); a deploy drops every active game (`deploy.sh:753-762` accepts this).
- Every connection registers all 18 games' handlers (202 `socket.on` per socket, `index.ts:143-193`) — ~200 retained closures per connection, and 18 disconnect handlers walk on every disconnect.
- Casino money writes serialize on the shared 5-connection Prisma pool (`server/shared/prisma-client.ts:26`, `handlers/blackjack.ts:752-1519`).
- **Fix (ordered):** lazy per-game handler registration; dedicated/larger pool for settlements (batch per hand); then either `@socket.io/redis-adapter` + sticky sessions **or** finish the Go gamehub cutover — not both. Persist lobby snapshots to Redis for restart survival; minimum bar is graceful drain + client auto-rejoin.

### 4.4 The Go backplane bug — fix before any multi-replica claim (P1)
`pkg/events` Redis publish doesn't serialize the publisher's origin (`go-services/pkg/events/events.go:114-116`); the subscriber stamps every message with the **local** origin (`:133`), and `room.go:89-90` then drops it as self-originated. **Net effect: all cross-replica broadcasts are silently discarded.** Known caveat (`go-services/CLAUDE.md` gotcha #5), confirmed in code. **Fix:** serialize origin in the envelope; add a two-hub e2e test sharing one Redis before shipping any `replicas: 2` (the Helm chart already ships `gamehub: replicas: 2` — currently a lie).

### 4.5 No queue for spiky async work (P2)
No message queue exists anywhere (no BullMQ/pg-boss/NATS/Redis Streams in `package.json` or `go.mod`); background work is cron/ticker loops + DB leases. Feed fan-out-on-write (§2.2), notification coalescing, webhook delivery, and view-count flushing all need a durable "do this reliably, later" home. **Fix:** introduce one modest queue (Redis Streams or pg-boss — both fit existing infra) rather than more cron loops.

### 4.6 Connection limits unmodeled (P2)
No `nofile` ulimits on hub containers, no Apache MPM tuning (default `MaxRequestWorkers` ~150 with long-lived WS held open), no per-hub connection metrics. **Fix:** raise ulimits in compose; tune the Apache `event` MPM; export connection-count metrics + alerts; document the per-process connection budget.

---

## 5. Infrastructure, deploy & observability

### Already strong — do not re-do
- **Blue/green web hotswap** with health gating and prove-the-flip-then-rollback verification (`deploy/hotswap-web.sh:198-289`) — production-grade.
- Hardened containers (`read_only`, `cap_drop: ALL`, `no-new-privileges`, non-root, `pids_limit`); HMAC-signed deploy webhook with constant-time compare (`webhook-server.cjs:38-78`); native ARM64 CI builds with layer caching; slim/full image split.
- R2/CDN offload of static assets + avatar backfill (`deploy.sh:559-634`); fail-closed secret handling.
- Helm charts (Node + Go), k8s deploy script, and Terraform DNS already scaffolded with multi-node seams documented (`deploy/README.md:167-214`).

### 5.1 Externalize state — the existential item (P0)
- **No database backups exist.** No pg_dump, wal-g, pgbackrest, cron, or timer anywhere in the repo. Postgres lives on the same VPS as everything else (`DATABASE_URL=…@localhost:5432`, reached via `host.docker.internal`). Host loss = **total loss of all user data**.
- **Immediate (this week):** nightly `pg_dump` → R2 + WAL archiving, with restore tested. **Then:** managed Postgres (with PITR + read replica) and managed/persistent Redis. Remaining local-disk media (slice-it audio/covers, curated-build images — `scripts/reclaim-db.sh:67`) → R2 via the existing sync/backfill pattern.

### 5.2 Reliability gaps on the single box (P1)
- **No CPU/memory limits on any container** (only `pids_limit`) — one runaway process (vibe-worker Chromium, supervisor AI) can starve the box. → Add `mem_limit`/`cpus` per service.
- All non-web services restart **in place** on deploy (`deploy.sh:764` `--scale web=0`) — every hub drops all connections every deploy (compounds §4.2).
- Origin is plain HTTP behind Cloudflare with a documented-but-unenforced origin firewall (`deploy/apache/rmhstudios.conf:9-10, 44-65`). → Cloudflare Tunnel or Full-Strict TLS + enforce the CF-IP firewall (this also closes the rate-limit IP-spoofing hole, §7).
- Apache: no MPM tuning, no brotli/deflate, no `LimitRequestBody`, no h2, hardcoded CF IP ranges (`rmhstudios.conf:66-92`).

### 5.3 Observability: instrumented but blind (P1)
Go services expose Prometheus metrics **that nothing scrapes** (`go-services/pkg/telemetry/telemetry.go`; `:9090` isn't even host-published). Logs are JSON but roll off locally (10m×3, `docker-compose.yml:40-44`). No tracing, no alerting, no error tracker; `/api/rum` and `/api/client-error` validate and then **discard** (`app/routes/api/rum.ts:43-55`) — both are explicitly wire-ready to forward. The status service stores uptime history on the box it monitors.
**Fix (ordered):** off-box uptime monitor → forward RUM/client-error to Sentry/Grafana Faro (endpoints ready) → ship logs to a hosted sink (Loki/Axiom) → deploy Prometheus+Grafana to scrape existing metrics → Alertmanager with SLO burn alerts → OpenTelemetry tracing across Node↔Go.

### 5.4 CI/CD gaps (P2)
- **Deploys are not gated on CI**: `deploy.yml` has no `needs:` on web-ci/typecheck/Go tests — a red build still ships. → Gate CD on the CI matrix (or required checks via environments).
- Migration locking risk (§1.7). Multi-GB images slow pulls/rollbacks on the small disk.
- Perf regressions only caught by **weekly scheduled** Lighthouse/bundle-size runs, warn-only (`.github/workflows/bundle-size.yml:8-11`, `lighthouse*.yml`). → PR-time bundle-size delta + Lighthouse budget (warn first).

### 5.5 The staged infra path
1. **Stage 0 (days):** backups + WAL to R2; container memory limits; off-box uptime; RUM/errors→Sentry; migration timeouts; CD gated on CI.
2. **Stage 1 (managed state):** managed Postgres (PITR, replica) + PgBouncer; managed/persistent Redis; all media on R2; Cloudflare Tunnel/Full-Strict.
3. **Stage 2 (horizontal web):** N stateless web replicas behind a load balancer (needs §3.1-3.3 done); expand/contract migrations; Prometheus/Grafana/Alertmanager live.
4. **Stage 3 (k8s + realtime):** finish the Helm/k3s cutover (add HPA, PDB, anti-affinity, NetworkPolicy, RWX storage — none exist in the charts yet); fix the Go backplane bug first (§4.4); sticky sessions + adapter for hubs; Terraform expanded beyond DNS with remote state.

---

## 6. Frontend performance ("extremely fast to load")

### Already strong — this is a top-percentile frontend; do not re-do
- Route-level code splitting with rolldown auto-chunking; only `vendor-react` pinned (`vite.config.ts:149-173`); all 3D/heavy libs (three, monaco, tone, pixi, tiptap) reached only via `React.lazy` boundaries and externalized from the server bundle (`vite.config.ts:103-128`).
- i18n: only `en` statically bundled, 31 locales code-split, active non-en serialized inline for synchronous hydration (`lib/i18n/resources.ts:16-66`, `app/routes/__root.tsx:103-112`).
- Streaming SSR with deferred loaders on the feed (`app/routes/_site/index.tsx:57-62`); request-scoped session shared across root/sidebar/page loaders.
- Non-blocking body font + idle-deferred decorative fonts (`__root.tsx:90-96`); pre-compressed brotli/gzip assets; immutable cache headers; esnext target; conservative kill-switchable service worker; intent-based prefetch with a 50ms hover delay (`app/router.tsx:9-15`).
- First-party RUM (web-vitals → `/api/rum`), zero third-party analytics; `content-visibility: auto` on feed cards (`app/globals.css:2062-2076`); feed-store race hardening; device-tier CSS degradation (`components/Providers.tsx:184-188`).

### Remaining wins, by impact
1. **Feed list virtualization (P1).** `fetchNextPage` accumulates every page into the store and `FeedList` renders all rows (`stores/feedStore.ts:257-270`, `components/feed/FeedList.tsx:143-155`). `content-visibility` skips off-screen paint but **DOM nodes and fiber tree still grow unboundedly and all rows hydrate**. → `@tanstack/react-virtual` for feed, threads, leaderboards past ~50 rows. Biggest at-scale runtime win. (Deferred in the June plan pending scroll QA — that QA should now be scheduled, not indefinitely deferred.)
2. **Per-route i18n namespace splitting (P1).** All 66 namespaces of the active language ship on every page (~456 KB raw for en; game/admin namespaces load for users sitting on the feed) — `lib/i18n/config.ts:23`, `lib/i18n/resources.en.ts:71-138`. `CORE_NAMESPACES` (`config.ts:31-34`) already defines the always-needed 12. → Load `c-<game>`/`r-<game>`/admin namespaces on demand from their route chunks. Single largest i18n payload win; also shrinks the non-en SSR HTML payload automatically.
3. **Self-host + subset fonts (P2).** All fonts come from Google Fonts (two extra origins, full variable axes, no subsetting) — `__root.tsx:90-96, 155-156`. `@fontsource` packages are already installed but unused. → Self-host subsetted woff2, preload the one critical Inter file, add `size-adjust` fallback metrics. Removes the only third-party critical dependency (§ the kowloon route also has a render-blocking font link, `app/routes/kowloon-knockout.tsx:6-9`).
4. **Unblock TTFB from session resolution (P2).** The root loader awaits `getInitialUser` (session + entitlements DB hit) before the shell streams, for every request including logged-out (`__root.tsx:120-123`). → Defer it like the home feed does; keep only cheap locale resolution blocking. Pairs with the cookie cache (§3.3).
5. **Route the remaining 44 raw `<img>` files through `OptimizedImage` (P2)** — avatars/attachments ship full-res today; the resize endpoints already exist. 20-40% mobile image-byte savings on feed/profile.
6. **103 Early Hints / edge `Link:` preload for entry JS+CSS (P3)** (`deploy/apache/rmhstudios.conf` — Cloudflare supports Early Hints); raise OG-image cache from 10min to hours+SWR (`app/routes/api/og/post/$id.ts:45`); lazy-mount `CommandPalette`/`RecentsTracker` on first interaction; PR-time bundle budgets (§5.4).

---

## 7. Security & abuse at scale

The July 12/13 audits fixed most classic vulnerabilities (economy races → atomic conditional updates, SSRF rebinding → per-hop IP pinning, CSP reconciliation). Verified still open from those audits: **H-5** (in-memory ×4 rate limiter, spoofable IP trust), **M-3** (no email verification / account-linking policy), **M-5** (no global request-body cap; ~150 routes call `request.json()` unbounded, upload routes buffer entire files before size checks — `app/routes/api/library/upload.ts:66-78`), **M-8** (`'unsafe-inline'` still in `script-src` in both Apache and Traefik configs). New scale-specific findings:

### 7.1 Abuse economics (P0)
- **No CAPTCHA/Turnstile/bot-challenge anywhere** (exhaustive grep: zero matches) + no email verification + spoofable per-IP limits = mass account creation, spam, and scraping are economically trivial. → Cloudflare Turnstile on signup/login/reset; step-up challenges on abuse-flagged writes; edge bot-management rules; new-account restrictions (posting/DM caps that relax with account age).
- **Rate limits are IP-keyed at ~207 call sites; only ~9 key by user** (`app/routes/api/rmharks/ai-generate.ts:95` is a good example). Authenticated abuse rotates IPs freely; CGNAT users get falsely throttled. → Key authed endpoints by `session.user.id`; reserve IP keying for pre-auth. Combine with §3.2 (Redis store) — same wrapper change.

### 7.2 DoS surface (P0)
- Feed GET + search: unauthenticated, **no rate limit on the GET handler** (`app/routes/api/rmharks.ts:23-70` — only POST has one), search bypasses the anon cache by design (`lib/feed/timeline.ts:726-729`) and runs `ILIKE` scans (§1.4). `/api/search` runs four parallel scans per request (`app/routes/api/search.ts:41-90`). → Rate-limit the GETs now; require sessions for search; land §1.4.
- SSE stream: no rate limit, no connection cap, anonymous allowed (§2.1).
- `/api/rum` + `/api/client-error` are unauthenticated log-volume amplifiers (`app/routes/api/rum.ts:44-53`).

### 7.3 Cost-bound the AI surfaces (P1)
Auto-moderation calls DeepSeek on **every post/comment ≥ 12 chars** with no per-user limit, no global cap, and no daily budget (`lib/moderation/auto-moderate.server.ts:125-178`, invoked fire-and-forget from `app/routes/api/rmharks.ts:196-203`) — unlike `vibe/ai` and `versecraft/*` which enforce `redisRateLimit` + daily caps. Unbounded spend + no backpressure if the provider stalls. → Same budget/circuit-breaker wrapper as the other AI endpoints; queue + sample rather than call per item.

### 7.4 Developer API quota ceiling (P1)
Per-minute limits only (`starter: 120/min` = ~172k req/day forever, `lib/api/with-developer-api.server.ts:78`); no daily/monthly quota, no per-endpoint cost weighting; the limiter silently degrades to per-instance if Redis is down (`:32-36`). → Daily/monthly quota rows + cost units; meter uploads and feed reads separately.

### 7.5 Moderation & trust-and-safety readiness (P1)
- **DMs are never screened** and DM send is IP-throttled only, with `dmPrivacy` defaulting to `EVERYONE` (`app/routes/api/messages/$conversationId.ts:120-231`) → per-sender + per-recipient limits, new-account DM restrictions.
- **Report brigading**: no cap on distinct reports per account, no reporter-reputation weighting (`app/routes/api/moderation/report.ts:59-107`).
- **CSAM/illegal-content readiness gap**: no hash-matching (PhotoDNA/NCMEC), no preserve-and-report pipeline; automod files human-review reports but never blocks (`lib/moderation/auto-moderate.server.ts:8-9`). **A legal/operational must-have before large scale.**
- Economy backstop: add the deferred `CHECK (coins >= 0)` constraint + a ledger-vs-balance reconciliation job — today integrity rests on every future spend site remembering the conditional-update pattern.

### 7.6 Headers (P2)
CSP `connect-src 'self' https: wss:` (and `img-src`/`frame-src … https:`) allow exfiltration to any HTTPS host if injection ever lands; `'unsafe-inline'` remains in `script-src` (`deploy/apache/rmhstudios.conf:99-106`, mirrored in the Traefik middleware). → Nonce/hash-based script-src; tighten connect/img/frame-src to an explicit allowlist. Change both files together (repo convention).

---

## 8. Phased roadmap

Order chosen so each phase unlocks the next; items within a phase are independent.

### Phase 0 — Stop-the-bleeding (days; no architecture changes)
| Item | Section |
|---|---|
| Nightly `pg_dump` → R2 + WAL archiving; test a restore | §5.1 |
| Rate-limit the feed GET + `/api/search`; require session for search | §7.2 |
| Scope casino room-list broadcasts to a lobby room (kill `io.emit`-to-all) | §4.1 |
| `orderBy: { followerCount: 'desc' }` in explore; use counters in profile; add `UserProfile.xp` index | §1.3 |
| Container memory/CPU limits; off-box uptime monitor; RUM + client-error → Sentry | §5.2-5.3 |
| Migration `lock_timeout`/`statement_timeout`; gate CD on CI | §1.7, §5.4 |
| Budget/circuit-break the auto-moderation LLM calls | §7.3 |

### Phase 1 — Redis-first coordination (1-2 weeks; wiring, not new infra)
| Item | Section |
|---|---|
| `rateLimit()` → Redis-first with in-process fallback (one wrapper, all ~200 call sites); `BETTER_AUTH_RATE_LIMIT_DB=1`; key authed limits by userId | §3.2, §7.1 |
| `cached()` L1+L2 helper; migrate tier/user-display/follow-graph/hidden-authors/leaderboards; pub/sub invalidation broadcast | §3.1 |
| Better Auth cookie cache + Redis session cache (Node + Go) | §3.3 |
| View counts + presence into Redis (flush job); drop per-impression UPDATE and lastSeenAt writes | §1.2 |
| Denormalized unread counters (notifications + DMs) over per-user channels | §2.4 |
| Edge-cache anonymous SSR + hot public JSON (`s-maxage` + SWR) | §3.4 |
| Turnstile on signup/login/reset; email verification (needs email infra decision) | §7.1 |
| Cleanup worker: sessions, verifications, notification retention, comment-views, soft-delete sweep | §1.5 |

### Phase 2 — Social-layer scale-out (2-6 weeks)
| Item | Section |
|---|---|
| Feed SSE topology: per-follower/per-post/per-user channels; connection caps; auth-required personalized stream | §2.1 |
| Redis feed read-cache for signed-in first pages (feed plan Phase 2) | §2.2 |
| Hashtag extraction at write time + `pg_trgm`/FTS search (drop all `%LIKE%` paths) | §1.4 |
| Comment pagination + denormalized comment/poll counters | §2.3 |
| Precompute explore/trending/leaderboards into Redis on a schedule | §2.5, §1.3 |
| Introduce one queue (Redis Streams or pg-boss) for async fan-out work | §4.5 |
| Feed virtualization + per-route i18n namespaces + self-hosted fonts | §6.1-6.3 |
| PgBouncer + managed Postgres (PITR, read replica); managed Redis | §1.1, §5.1 |

### Phase 3 — Horizontal everything (as growth demands)
| Item | Section |
|---|---|
| Multiple stateless web replicas behind LB (unlocked by Phase 1) | §5.5 |
| Fix Go `pkg/events` origin bug; two-hub e2e test; then Socket.IO Redis adapter or Go gamehub cutover — pick one | §4.3-4.4 |
| Hybrid fan-out-on-write timelines (`FeedEntry`) for <10k-follower authors (feed plan Phase 4) | §2.2 |
| Partition notification/message/like/view tables by month | §1.5 |
| k8s cutover with HPA/PDB/anti-affinity/NetworkPolicy; Terraform beyond DNS | §5.5 |
| External search engine (Meilisearch/Typesense) when FTS strains | §1.4 |
| CSAM hash-matching + T&S pipeline before open registration at scale | §7.5 |
| Prometheus/Grafana/Alertmanager + OpenTelemetry tracing | §5.3 |

---

## 9. KPIs to watch (wire these before Phase 2)

- **DB:** connection count vs. `max_connections`; p99 query time on `rmheet`/`notification`/`follow`; row-lock waits on hot posts; table bloat on `user`/`rmheet`.
- **Realtime:** SSE/WS connections per instance; events delivered per event published (fan-out efficiency — should fall from O(all-clients) toward O(interested-clients)); reconnect-storm auth latency.
- **Web:** TTFB p75 (target <200ms cached, <600ms uncached); LCP/INP p75 from the existing RUM (once forwarded somewhere queryable); Cloudflare cache-hit ratio on anonymous HTML (target >80% after §3.4).
- **Abuse:** accounts created per IP/day; rate-limit rejections by key type; automod spend per day.
- **Ops:** backup success + restore-test cadence; deploy → alert MTTR once alerting exists.

---

*Method note: every claim above was anchored against the tree on branch `claude/scalability-audit-optimization-v5uftx` on 2026-07-17. Items known to be already remediated (per the July security audits or the June/July optimization passes) are listed in the "already strong" blocks so they are not re-opened. Runtime-only questions (Cloudflare edge rules, live Postgres settings, actual `max_connections`) are called out inline and need verification against the production environment.*
