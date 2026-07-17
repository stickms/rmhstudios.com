# Website Performance Audit — 2026-07-17

Full-stack optimization audit of rmhstudios.com, run against the current tree
(`main` @ 20f98f3). Supersedes prior audits — every finding below was verified
against the code as it exists today, with file:line references. Scope: why the
site is slow for real users at current data volumes and concurrency, and what
to change, in priority order.

**Method:** six parallel deep-dive passes (database/Prisma, API hot paths,
SSR + i18n, client bundle, client runtime, realtime/workers/infra), findings
cross-verified against source. Previously-fixed items (denormalized counters,
Redis view buffering, feed partial index, session cookie cache, home-feed
virtualization, lazy heavy libs) were checked and are listed under "already
healthy" so they don't get re-litigated.

---

## Remediation status (implemented on `claude/website-performance-audit-veciar`)

Most of this audit has been implemented and verified (`tsc --noEmit` + `vite
build` green) across six commits. Summary:

**Done — infrastructure/config:** Prisma pool default 10→20 + acquire timeout
10s→5s; `NODE_OPTIONS` heap caps on web/socket/rmhbox/rmhtube; container
healthcheck now hits a new cheap `/api/health` instead of SSR-ing `/`; Apache
`ProxyTimeout` + new `deploy/apache/mpm_event.conf` (raised MaxRequestWorkers);
new `deploy/postgres/postgresql.tuning.conf`; Redis maxmemory headroom;
`DATABASE_POOL_SIZE` documented.

**Done — database:** the `communityId`/`originalId`/bookmark-`rmheetId` indexes
+ denormalized `Community.postCount` (migration `20260717120000`); feed search &
hashtag autocomplete moved onto FTS/the `Hashtag` table; explore hot-posts pool
cached; `getFollowingIds` capped; `getUserDisplayMap` batched; post-create
gamification deferred; thread `createMany`.

**Done — API/SSR/client/realtime:** session cookieCache 60→300s; presence
caching; bucketed OG cache key + guarded avatar fetch + SWR headers; single-op
Redis limiter; DeepSeek timeout; soonest-expiry limiter eviction; 30-min DM SSE
lifetime. Root-route `staleTime` (kills the per-navigation session refetch **and
the full i18n catalog re-download**); per-request QueryClient; per-locale
i18next instance cache; parallelized library/news loaders; widened perf-lite.
Shared `<VirtualPostList>` for secondary feeds; one shared message-stream SSE
bus; shared session context per card; store dirty-check fixes; GroupChat
autoscroll; `useCardSheen`/doctrine-poller/glass-blur. Farming-sim leak +
dirty-gated broadcast; rmhtype batched emit; rmhbox/rmhtube auth caches; O(1)
rate-limiter cleanup; relay rate limits; undercover static-data singleton.

**Correction to §5 (bundle):** the premise below — "route splitting is OFF,
4–5 MB entry" — is **wrong for the installed TanStack Start version**. A
production build confirms routes ARE code-split (883 chunks) and every heavy lib
(maplibre/three/monaco/pdfjs/markdown/…) is already a lazy async chunk. The
measured first-visit eager JS is **~334 KB brotli**, not 1–1.3 MB. `§5.1`'s
`autoCodeSplitting: true` one-liner is also a no-op — the option is omitted from
the plugin's input schema. No bundle change was needed. Dead-dep removal
(`recharts`/`katex`/`@tiptap/*`, unused) was left as optional hygiene (zero
runtime benefit, would desync the lockfile).

**Also done (second pass):** bounded reactions extended to **all** the remaining
read paths (bookmarks, thread, profile own/repost/pinned, similar — §2.3);
**comment-tree batching** (per-parent BFS → 2 queries/level via a ROW_NUMBER
id-window + hydrate, §2.5); **rmhbox weekly/monthly + per-minigame boards** cached
(§2.6); **core-namespace-only SSR i18n payload** (§4.1 — SSR render instance AND
the loader payload both trimmed to core namespaces so they render identically, no
hydration mismatch; the rest of the active locale backfills client-side, mirroring
the existing en-core backfill); **origin LRU cache for `/api/image-proxy`** (§1.2 —
the code half: a cache hit skips both the upstream fetch and the sharp transcode).
All verified with `tsc` + `vite build`.

**The i18n trade-off (accepted, documented):** a direct load of a game/app route
in a non-English locale briefly shows English for that route's own strings until
the client backfill lands; the shell + feed are translated throughout, and
client-side navigation (the common case) is unaffected because the backfill runs
right after hydration.

**Genuinely external — cannot be run from the repo (config is committed; applying it is a deploy step):**
- **Cloudflare cache rule** for `/api/image-proxy*` and `/api/feed/image/*` —
  now a committed, idempotent script: set `CLOUDFLARE_API_TOKEN` (scoped: Zone →
  Cache Rules → Edit) + `CLOUDFLARE_ZONE_ID` and run
  `bash deploy/apply-cloudflare-cache-rules.sh` (supports `DRY_RUN=1`). Safe to
  edge-cache: these responses are non-user-specific. The origin LRU already cuts
  the transcode cost; this offloads delivery to the edge too.
- **Applying** `deploy/postgres/postgresql.tuning.conf` +
  `deploy/apache/mpm_event.conf` on the VPS host — a single committed,
  idempotent command: `sudo bash deploy/apply-perf-tuning.sh` (supports
  `DRY_RUN=1`). It cannot run from CI / the sandboxed webhook (writes under /etc,
  restarts services), so an operator runs it once on the host.
- **Multi-core / replicated web serving** (§1.1) — the single biggest remaining
  "slow under load" win (all SSR + API + SSE currently share one event loop).
  The installed Nitro (`node-cluster` preset) makes this a **build + env +
  capacity** toggle, no code change required:
  1. Build the web image with `NITRO_PRESET=node-cluster` (a build-time env in
     CI / the Docker build) — Nitro then emits a cluster entry that forks workers
     which share the one listening port, so the blue/green hotswap (single
     container, single port) keeps working unchanged.
  2. Set `NITRO_CLUSTER_WORKERS=<n>` at runtime (env on the `web` service).
  3. **Raise the container limits first** — `docker-compose.yml` caps `web` at
     `mem_limit: 1g` / `cpus: 1.5` with `NODE_OPTIONS=--max-old-space-size=768`.
     N workers need ~N× the heap and ≥N cores to actually parallelize, so bump
     `cpus`/`mem_limit` and lower per-worker `--max-old-space-size` accordingly
     (e.g. 2 workers → `cpus: 3`, `mem_limit: 2g`, `--max-old-space-size=768`
     each). This capacity call is the only decision that's genuinely yours.
  The alternative (N separate containers behind an Apache `balancer://`) also
  works but reworks the blue/green deploy — cluster mode is the lower-risk lever.
- **Edge-caching anonymous page HTML** (§1.1) — must be a Cloudflare
  **cookie-bypass** cache rule so signed-in shells are never served from cache.
  Deliberately NOT implemented as origin logic, where a cookie-detection slip
  would serve one user's authenticated page to another — a privacy bug. Configure
  it at the edge (Cache Rule: cache HTML only when the session cookie is absent).

Everything the *repository* can contain is committed: the code fixes, the config
files, the origin-side image cache, and two turnkey apply scripts
(`apply-cloudflare-cache-rules.sh`, `apply-perf-tuning.sh`). What's left is
supplying credentials + running those scripts, and one capacity/topology
decision — all operations on Cloudflare and the VPS, outside the repo.

**Intentionally skipped (low value / already healthy):** group-chat page size +
DM-search trigram (§2.10, already conversation-scoped); fonts-per-theme +
Discord-SDK eager split (§5 — measured eager bundle is already ~334 KB brotli);
the `socket.on` lazy-registration refactor (§7, too invasive for the payoff);
dead-dep removal (zero runtime benefit, would desync the lockfile).

---

## Executive summary — why the site collapses under load

The slowness is not one bug; it is a **serving topology that funnels 100% of
work through one throttled Node process**, multiplied by a handful of
per-request costs that are each 10–100× larger than they need to be:

1. **One Node process serves everything.** SSR for every page, all ~340 API
   routes, every SSE stream, satori OG rendering, and all sharp image
   transcoding share a single event loop capped at **1.5 vCPU / 1 GB**
   (`Dockerfile:360`, `docker-compose.yml:105-107`). No cluster, no replicas,
   no HTML edge caching — Cloudflare passes every page view to origin.
2. **The DB pool for that entire tier is 10 connections**
   (`lib/prisma.server.ts:15`, `DATABASE_POOL_SIZE` unset in prod), with a
   10 s acquire timeout. ~15–25 concurrent feed requests exhaust it; everything
   else queues for up to 10 s. This alone produces "fast when quiet,
   unusable when busy."
3. **Several hot queries are full-table scans** of the posts table (`rmheet`):
   community pages (no `communityId` index), feed search / hashtag autocomplete
   / "similar posts" (leading-wildcard `ILIKE`), explore hot-posts (sort on
   un-indexed `likeCount`). Each one holds a pool connection for hundreds of
   ms to seconds, compounding #2.
4. **Every avatar/image is transcoded on the web box.** `/api/image-proxy`
   has no file extension so Cloudflare doesn't cache it by default; each
   unique image spawns up to 7 srcSet width variants, each an upstream fetch
   + sharp AVIF encode (sharp's slowest encoder) inside the SSR process.
5. **Non-English users download the full ~300 KB translation catalog in every
   SSR response — and again on every client-side navigation**, because the
   root loader has no `staleTime` and re-fires per navigation
   (`app/routes/__root.tsx:119-123`).
6. **First visit downloads ~4–5 MB of minified JS** (~1.0–1.3 MB brotli)
   because route-level code splitting is off (`autoCodeSplitting` not set,
   `vite.config.ts:186-188`) — the feed page ships maplibre-gl (~800 KB), the
   Discord SDK, socket.io-client, react-markdown, and every `_site` page's
   code.
7. **After load, non-home timelines render every loaded post** (no
   virtualization, no memo), and the messages page opens **three duplicate
   SSE streams** — on HTTP/1.1 that saturates the browser's 6-per-origin
   connection pool and makes the whole site read as hung.
8. **Apache and Postgres are both untuned.** Apache's default ~400 workers
   are eaten by held SSE/WS connections; Postgres runs stock config
   (128 MB shared_buffers) on the same box, outside any resource limit.

Fix items 1–4 and the site stops collapsing under load. Fix 5–7 and it feels
fast. Everything else in this document is ranked hygiene.

---

## Top 12 fixes by leverage (impact × effort)

| # | Fix | Effort | Where |
|---|-----|--------|-------|
| 1 | Enable route code splitting: `router: { autoCodeSplitting: true }` | 1 line | `vite.config.ts:186` |
| 2 | `staleTime` (hours/Infinity) on root route loader; invalidate on login/locale change | ~5 lines | `app/routes/__root.tsx:119` |
| 3 | Set `DATABASE_POOL_SIZE=25–40` for web; lower `connectionTimeoutMillis` to ~2 s; document the var | env + 1 line | `lib/prisma.server.ts:15-17`, `.env.example` |
| 4 | Cloudflare Cache Rule: cache-everything on `/api/image-proxy*` and `/api/feed/image/*` (key incl. query string) | CF dashboard | — |
| 5 | Add missing indexes: `RMHark @@index([communityId, createdAt(Desc), id(Desc)])`, `@@index([originalId])`, `RMHarkBookmark @@index([rmheetId])` | 1 migration | `prisma/schema.prisma:1443-1452, 4075-4085` |
| 6 | Run 2–3 web replicas (Nitro node-cluster preset or scaled containers behind Apache balancer); raise CPU cap; set `NODE_OPTIONS=--max-old-space-size=768` | config | `Dockerfile:360`, `docker-compose.yml:105-107` |
| 7 | SSR-serialize only core i18n namespaces for non-en; backfill rest client-side (mechanism already exists for en) | ~20 lines | `__root.tsx:103-112`, `lib/i18n/resources.server.ts:79-81` |
| 8 | Route feed search + hashtag autocomplete + similar/AI-search through FTS / the `Hashtag` table instead of `ILIKE '%q%'` | ~1 day | `lib/feed/timeline.ts:449,523`, `api/feed/hashtag-search.ts:27`, `api/rmharks/$id/similar.ts:35` |
| 9 | Lazy-wrap the 6 bundle leaks: ListingsMap, RideMap, rmhbox lobby shell, AltairShell, Markdown, Discord SDK | ~½ day | see §5 |
| 10 | Shared virtualized list for profile/tag/community/bookmarks/explore timelines (reuse home-feed windowing) | ~1–2 days | `components/feed/*Column.tsx` |
| 11 | Apache MPM tuning (`MaxRequestWorkers`, `ProxyTimeout`) + tuned `postgresql.conf` + PgBouncer | config | `deploy/apache/rmhstudios.conf` |
| 12 | Raise session `cookieCache.maxAge` 60 s → 300 s (hot pollers currently fall back to per-request DB session lookups) | 1 line | `lib/auth.ts:36-39` |

---

## 1. Infrastructure & serving topology

### 1.1 CRITICAL — Single Node process, no HTML edge caching
- `Dockerfile:360` runs one `node .output/server/index.mjs`; `docker-compose.yml:105-107` caps it at `cpus: 1.5`, `mem_limit: 1g`. A second container exists only for seconds during blue/green hotswap (`deploy/hotswap-web.sh:190-196`).
- No SSR page route sets `Cache-Control`, so Cloudflare forwards every page view — including anonymous landing/blog/news/game pages — to this one event loop.
- **Fix:** (a) `s-maxage`/`stale-while-revalidate` on SSR responses when no auth cookie is present; (b) 2–3 web replicas via Nitro `node-cluster` preset or scaled containers behind an Apache balancer. The prerequisites (Redis-backed rate limits/caches, cookie-cached sessions) are already in place.

### 1.2 CRITICAL — CPU-bound media work inside the SSR process
- `app/routes/api/image-proxy.ts:43-95`: upstream fetch (up to 10 s) + sharp per request, no origin cache. `components/ui/OptimizedImage.tsx:21,52-58` routes **all** external images (every Discord/Google avatar in every card) through it and emits a 7-width srcSet → up to 7 transcode keys per image.
- No file extension on the path → **Cloudflare does not cache it by default**; the 30-day `Cache-Control` is wasted. A feed page ≈ 20 avatar transcodes; modest first-visit traffic demands 30–70 sharp jobs/sec from 1.5 CPUs.
- `lib/image-optimize.ts:122-126` prefers AVIF — sharp's slowest encoder (~5–10× webp).
- `app/routes/api/feed/image/$filename.ts:32-53` has **no rate limit** and accepts arbitrary `w/h/q` 1–2048 → cache-busting re-encodes on demand.
- ffmpeg transcodes also spawn in the web container (`lib/audio/transcode.server.ts:34`).
- **Fix:** CF cache rule (top-12 #4); origin LRU/R2 variant cache keyed `(url,w,q,f)`; collapse avatar srcSet to one ~96 px variant (rendered at 40–48 px); fixed width whitelist + rate limit on `feed/image`; prefer webp or cap AVIF effort; long-term move media work out of the SSR process.

### 1.3 HIGH — Apache untuned while holding every SSE/WS connection
- `deploy/apache/rmhstudios.conf`: no MPM/worker/keepalive/`ProxyTimeout` settings anywhere in `deploy/`. Debian event-MPM default ≈ 400 workers. Every SSE stream (feed, messages ×N — see §6.2) and WS connection holds a slot for its lifetime; DM streams force-reconnect every 5 min (`app/routes/api/messages/stream.ts:124-132`). A few hundred concurrent users exhaust the pool and *all* requests queue.
- **Fix:** explicit `MaxRequestWorkers`/`ThreadsPerChild` sized to connection count, `ProxyTimeout`, committed to `deploy/apache/`.

### 1.4 HIGH — Postgres stock-configured, unbounded, co-resident
- Postgres runs on the host (`docker-compose.yml:36-50`) with no tuning in the repo (no shared_buffers/work_mem/max_connections config, no PgBouncer). Container limits sum ≈ 7.4 GB (8.4 GB during hotswap) — on an 8 GB VPS that risks swap, which matches "extremely slow under load" perfectly.
- Fleet connection budget is undocumented: web 10, hubs 5 each + separate raw auth pools of 10 (`server/socket-server/index.ts:54-59`, `server/rmhbox/auth.ts:12-17`, `server/rmhtube/auth.ts:20-25`), workers 3 each, Go 5 — ≈ 65–75 total, +10 during hotswap, against stock `max_connections=100`.
- **Fix:** tuned `postgresql.conf` (shared_buffers ~25% RAM, effective_cache_size, work_mem per connection budget); verify host RAM vs limit sum; PgBouncer; shrink idle hub auth pools; document the budget.

### 1.5 HIGH — 1 GiB web container without a Node heap flag
- No runtime `NODE_OPTIONS` (`Dockerfile:360`); V8 doesn't reliably size old-space to a cgroup → OOM-kill/restart flaps or GC thrash near the ceiling.
- **Fix:** `NODE_OPTIONS=--max-old-space-size=768` on web (proportional for hubs); alert on restarts.

### 1.6 MEDIUM — Self-inflicted SSR probes
- Status service hits the public `/` through Cloudflare→Apache→SSR every 15 s (`go-services/internal/status/status.go:35`); web healthcheck curls `/` (full homepage SSR) every 30 s (`docker-compose.yml:119-124`).
- **Fix:** point both at a cheap health endpoint; lengthen the public probe.

---

## 2. Database

### 2.1 CRITICAL — `RMHark.communityId` has no index → community surfaces seq-scan all posts
- `prisma/schema.prisma:1443-1452`: RMHark indexes cover userId/createdAt/thread — **not `communityId`**. The feed partial index explicitly covers only `communityId IS NULL`.
- Every community feed (`lib/community.server.ts:104-114`), community post count (`:58`), and the `/communities` directory groupBy (`lib/communities.server.ts:50-55`) is O(all posts) per request. `communityId` is also a `SetNull` FK — deleting a community seq-scans `rmheet`.
- **Fix:** `@@index([communityId, createdAt(sort: Desc), id(sort: Desc)])`; denormalize `postCount` onto `Community` (pattern already exists on `User.postCount`).

### 2.2 CRITICAL — Leading-wildcard ILIKE scans on interactive paths
- Prisma `contains/insensitive` emits `ILIKE '%q%'`, which cannot use the trigram index built on the expression `lower("content")` (migration 20260717110700). Five paths do this on the posts table:
  - Feed `?search=` — `lib/feed/timeline.ts:449-451, 523-525` (rate limit allows 160/min/user)
  - Hashtag autocomplete **per keystroke** — `app/routes/api/feed/hashtag-search.ts:27-35` (take 300, regex-tallied in JS; its "no tag table" comment is stale — `Hashtag` exists at `schema.prisma:1850-1861` with `postCount`)
  - Similar posts — `app/routes/api/rmharks/$id/similar.ts:35-48` (8 OR'd terms, take 200)
  - AI ask-feed / AI search — `app/routes/api/ai/ask-feed.ts:44-58`, `api/ai/search.ts:59-91` (plus un-indexed `orderBy likeCount`)
- `/api/search` was already fixed with raw FTS SQL (`app/routes/api/search.ts:21-67`) — these paths never got the same treatment. A handful of users typing in the search box degrades the whole DB.
- **Fix:** hashtag autocomplete → `Hashtag` table (`startsWith`, `orderBy postCount desc, take 15` — fully indexed). Feed search + similar + AI paths → the same `content_tsv @@ websearch_to_tsquery` id-resolution used by `searchPosts()`, then hydrate.

### 2.3 HIGH — Unbounded `reactions` include on every secondary read surface
- `lib/feed/map-feed-item.server.ts:46` fetches **all** reaction rows per post; used by community feed, tag feed, profile timeline (`api/profile/$id/rmharks.ts:128,141`), bookmarks, thread detail (`lib/feed/thread.server.ts:24`), explore (`lib/explore.server.ts:113`), and per comment (`api/rmharks/$id/comment.ts:63`). One viral post with 20k reactions ships 20k rows on every render of those pages. The home timeline was already fixed with bounded `loadReactionSummaries` (`timeline.ts:202-237`) — port it everywhere and delete `reactions` from `rmharkInclude`.

### 2.4 HIGH — Explore "hot posts": per-request 7-day scan sorted by un-indexed `likeCount`
- `lib/explore.server.ts:109-114`: `createdAt >= 7d orderBy likeCount desc` per request per viewer with the heavy include from 2.3. O(posts/week) sort per page view.
- **Fix:** cache the viewer-independent candidate pool 60–120 s (like `loadExploreBase` at `:91` already does), overlay per-viewer state with two cheap `IN` queries.

### 2.5 HIGH — Comment threads: up to ~86 queries per request
- `api/rmharks/$id/comment.ts:146-165`: BFS with one `fetchComments` per parent (up to 80) across 6 serial waves, plus per-comment `_count` and unbounded reactions. 80 parallel queries on a 10-connection pool queue 8-deep and starve everything.
- **Fix:** one query per level (`parentId IN (...)` + `ROW_NUMBER() OVER (PARTITION BY parentId)` cap) → ≤6 queries; finish the comment-counter denormalization (likeCount/replyCount already exist).

### 2.6 HIGH — RMHbox leaderboards: unbounded `groupBy` over all match history per request
- `api/rmhbox/leaderboard.ts:38-50` (7/30-day, no take), `:96-107` (all-time per minigame, no date bound), then JS-sorts every distinct player. `history.ts:104-125` uses offset pagination + full count.
- **Fix:** all-time → read the already-indexed `RMHboxProfile.totalWins/totalScore`; period boards → small rolling aggregate maintained at match end, or 60 s viewer-independent cache; history → keyset pagination.

### 2.7 MEDIUM — Write amplification: every like/comment/follow awaits ~10 serial side-effect queries
- `lib/social/engagement.server.ts:60-72` (and `:121-155`, `:210-241`): core 2-query txn, then awaited: notification pref read + dedupe + create, push-subscription findMany, achievement, XP (2 upserts), quests (1+N upserts), webhook endpoint findMany (nearly always empty). ~10× DB load on the site's highest-write path and like-button p95 latency.
- **Fix:** respond after core txn + SSE publish; move side effects to `void`-ed background/queue; negative-cache "has webhooks"/"has scheduled posts" per user (also `api/rmharks.ts:70-73`).
- Same shape on post creation: `api/rmharks.ts:369-387` awaits `rMHark.count` (full per-user COUNT) + achievements + XP + quests serially before responding.

### 2.8 MEDIUM — Following feed builds unbounded `userId IN (…)` lists
- `lib/social/follow-graph.server.ts:20-26` loads the entire follow list (no take); 10–50k-follow users produce giant IN lists on every feed/explore/tag read (`timeline.ts:441,457,552`).
- **Fix:** subquery join (`WHERE "userId" IN (SELECT ...)`) or cap; long-term fan-out-on-write for high-degree users.

### 2.9 MEDIUM — `getUserDisplayMap` cold path is N parallel findUniques
- `lib/user-display.server.ts:44-59` issues one PK query per cold author id (~40 per feed page after each 60 s TTL expiry), despite the header comment claiming a batched findMany. Also one Redis GET per id on L1 miss.
- **Fix:** collect misses → single `findMany({ id: { in } })` + Redis `MGET`, then populate per-id cache entries.

### 2.10 MEDIUM — Assorted
- `RMHarkBookmark` lacks `@@index([rmheetId])` (count in `api/rmharks/$id/insights.ts:38` seq-scans; cascade delete scans too); `RMHark.originalId` (SetNull FK) un-indexed — post hard-deletes scan `rmheet` (`schema.prisma:1407-1408, 4075-4085`).
- Thread creation holds an interactive transaction for up to 25 serial INSERTs (`api/rmharks/thread.ts:73-96`) → `createMany`.
- DM search: un-indexed ILIKE over message content (`api/messages/search.ts:44`) → trigram index or scoped pre-filter.
- Group-chat open ships 200 messages in one payload (`api/group-chats/$id/index.ts:30-32`) → paginate at 30–50.
- Redis: `REDIS_URL` only defaulted in compose for `web`, `.env.example` ships it commented — if unset in prod, feed cache/counter buffering silently degrades to direct Postgres. `allkeys-lru` at 256 MB can evict dirty `viewbuf:*` counter buffers → use `volatile-ttl`/`noeviction` and alert when `redisEnabled() === false`.

---

## 3. API / server runtime

### 3.1 HIGH — Session cookie-cache can't refresh outside better-auth routes
- `lib/auth.ts:36-39` sets `cookieCache: { maxAge: 60 }`, but 362 `getSession` call sites build their own `Response.json(...)` and **discard** the refreshed `session_data` Set-Cookie. Idle-tab polling (heartbeat 60 s, unread-count 45 s, presence 60 s — none of which can re-set the cookie) therefore does the full DB session path every request once the 60 s window lapses: ~150 extra point lookups/sec per 1,000 idle users, each consuming a pool connection.
- **Fix:** raise `maxAge` to ~300 s, and/or add a short Redis session cache keyed by token (invalidate on sign-out/ban). Verify refresh semantics against better-auth 1.6.17 before relying on cookie re-set.

### 3.2 HIGH — Polling fan-in ≈ 4–5 req/min/user + forced SSE reconnects
- `lib/usePresenceHeartbeat.ts:28` (60 s), `lib/useNotificationCount.ts:73` (45 s + focus), `RightSidebar.tsx:96` (60 s online-count), `FriendsOnlineWidget.tsx:48` (60 s friends), messages stream force-closed every 5 min server-side (`api/messages/stream.ts:124-132`) → session re-resolution per reconnect. Endpoints are individually cheap (Redis counters); the session+routing overhead dominates.
- **Fix:** ride unread/presence counts on the existing feed SSE connection; batch heartbeat+counts into one endpoint; lengthen DM stream lifetime with jittered reconnects.

### 3.3 MEDIUM — `/api/presence/friends`: 4 uncached queries/user/min, unbounded follow list
- `lib/presence.server.ts:21-53`: raw full `follow.findMany` (ignores the cached `getFollowingIds` at `lib/social/follow-graph.server.ts:19`) + 3 more queries, no caching, while "online" is answered from `lastSeenAt` that is itself throttled to 5-min writes — stale anyway.
- **Fix:** reuse cached following ids; cache result 30–60 s; answer from the Redis presence set.

### 3.4 MEDIUM — OG images: engagement-keyed cache busting + unguarded avatar fetch
- `lib/og/post-image.server.tsx:83`: PNG cache key includes like/comment/repost counts — any engagement change forces a full satori→resvg re-render (50–300 ms CPU on the SSR box); `:47-58` avatar fetch has no timeout/SSRF guard/cache; `:22-38` fonts fetched from Google at boot, and a failed fetch makes every OG request retry then 500. HTTP cache only `max-age=600`.
- **Fix:** bucket counts in the key (`floor(count/10)`), avatar LRU + `safeFetch` + timeout, local font files, `s-maxage` + `stale-while-revalidate`.

### 3.5 MEDIUM — Assorted
- Redis rate limiter: 3 sequential round trips per check (`lib/redis.server.ts:122-126`) → single Lua `EVAL`.
- DeepSeek/OpenAI client has no timeout (`lib/ai/text.server.ts:8-12`) — SDK default 10 min; called in-request by translate/transform/tutor; per-viewer re-translation with no `(postId, lang)` cache → set `timeout: 20_000`, cache translations.
- In-memory limiter evicts oldest-inserted (not oldest-expiring) at 10k keys (`lib/rate-limit.ts:72-75`) — silently resets live counters under load.
- `redisPresenceCount` writes a temp union key per online-count request (`lib/redis.server.ts:215-219`) → `SUNION` or 10 s memo.

---

## 4. SSR & i18n

### 4.1 CRITICAL — Non-en SSR embeds the full 66-namespace catalog; root loader refires per navigation
- `app/routes/__root.tsx:103-123`: `getInitialI18n` → `localeResources(locale)` returns the **entire** catalog (`lib/i18n/resources.server.ts:79-81`) into the dehydrated payload — ~250–300 KB raw per page view for every non-English visitor (32 locales, incl. RTL markets), plus serialization CPU per request.
- With no `staleTime` on the root loader (router sets only `defaultPreloadStaleTime`, `app/router.tsx:15`), **every client-side navigation** refires it: two server-fn round trips (session resolution + the full catalog again) per click, sitewide.
- The client i18n split is already excellent (13 core en namespaces eager, rest lazy — `lib/i18n/resources.ts`, `resources.en-core.ts`); the SSR path simply bypasses it.
- **Fix:** serialize core namespaces only and backfill via the existing `LOCALE_LOADERS` chunks (mirror `backfillEnRest`, `lib/i18n/instances.ts:32-47`); add `staleTime: Infinity` + explicit `router.invalidate()` on login/logout/locale switch.

### 4.2 HIGH — TTFB blocks on session everywhere; deferred streaming used on exactly one route
- Root loader awaits session + i18n before the shell streams (`__root.tsx:120-122`). Only the home feed uses the deferred-promise/`<Await>` pattern (`_site/index.tsx:62`, `FeedLayout.tsx:85-94`). Leaderboard, news, profile, library fully await their data — DB-bound TTFB sitewide.
- Library loader is a 4-step **sequential** server-fn waterfall (`_site/library/index.tsx:78-83`) → `Promise.all` or merge; news loader is 2 sequential uncached queries (`_site/news/index.tsx:11-15`) → parallel + `cached()`.
- Leaderboard/profile/library call raw `auth.api.getSession` instead of the request-memoized `getRequestSession` (`_site/leaderboard.tsx:12-23`, `_site/profile/$id.tsx:19`, `library/index.tsx:52-59`) — duplicate Better-Auth + tier work per SSR.
- **Fix:** propagate the deferred pattern; `getRequestSession()` everywhere; per-route `staleTime`.

### 4.3 MEDIUM — Per-request server allocations
- Per-request i18next instance init over 66 namespaces (`lib/i18n/instances.ts:12-18`) → cache one instance per locale.
- Module-scope shared `QueryClient` across all SSR requests (`components/Providers.tsx:22-34`) — memory accumulation + latent cross-user data-bleed hazard → `useState(() => new QueryClient())`.
- All 32 locale bundles statically imported into the server build (~tens of MB heap, slower cold start — `lib/i18n/resources.server.ts:10-41`) — acceptable once 4.1 is fixed, else lazy-load per locale.

---

## 5. Client bundle

### 5.1 CRITICAL — Route code splitting is off: 615 routes eagerly bundled
- `vite.config.ts:186-188` omits `autoCodeSplitting`; `routeTree.gen.ts` static-imports every route. Import-closure from `app/router.tsx` reaches ~1,283 modules. First visit to the feed ≈ **4–5 MB minified JS (~1.0–1.3 MB brotli)** parsed before interactivity. The repo already documents the failure mode (`app/routes/library.$slug.tsx:18-24`).
- **Fix:** `tanstackStart({ srcDirectory: "app", router: { autoCodeSplitting: true } })`. Estimated 60–75% cut in initial payload combined with 5.2. Verify build + smoke-test SSR/hydration after enabling.

### 5.2 HIGH — Six heavy libs leak into the eager graph
| Lib (est. min size) | Leak chain | Fix |
|---|---|---|
| maplibre-gl ~800 KB + 65 KB CSS | `components/homes/ListingsMap.tsx:4-6`, `components/rideshare/RideMap.tsx:5-6` ← static from homes/rideshare routes | `lazy(() => import(...))`, CSS inside lazy module |
| @discord/embedded-app-sdk ~180 KB | `__root.tsx:13` → `lib/discord-sdk.ts:4` — but `isDiscordActivity()` only reads URLSearchParams | split the check into a tiny module; dynamic-import SDK in `useDiscordSdk` |
| socket.io-client ~90 KB + rmhbox lobby UI | `app/routes/rmhbox/$lobbyId.tsx:18-32`, `rmhbox/index.tsx:18-23` (only game that leaks — others are lazy) | lazy-wrap like `cookgame.tsx:7-9` |
| howler ~40 KB + Altair shell | `app/routes/altair.tsx:12` → `AltairShell.tsx:14-15` (layout route undoes the lazy index route) | lazy AltairShell; audio on first gesture |
| react-markdown/unified ~120 KB | `blog.$slug.tsx:10`, `news.$slug.tsx:10`, BuildDetail, wiki | shared lazy Markdown wrapper |
| react-easy-crop, embla, react-icons/fa | `login.tsx:12,15`, news index | lazy / swap fa → lucide |

### 5.3 MEDIUM — Dead weight & visibility
- Never imported anywhere: all 20 `@tiptap/*`, `recharts`, `katex`, `lodash-es`, 3 `@fontsource/*`; `playwright` sits in prod deps; `pixi/d3/gsap/konva/matter-js/p5/chart.js` are vibe-package-only. Remove from `package.json` + prune `heavyExternals`.
- `chunkSizeWarningLimit: 4000` + `reportCompressedSize: false` (`vite.config.ts:243-245`) silence all size feedback; no analyzer in CI → add visualizer step to `web-ci.yml`, lower limit to ~800 KB.
- 12 decorative Google-Font families fetched (deferred) for every visitor (~300–600 KB) for themes most users never activate (`__root.tsx:96`) → load per active theme.
- Motion features use `domMax` (`lib/motion-features.ts:14`) — `domAnimation` suffices if no drag/layout projection needed.

---

## 6. Client runtime

### 6.1 HIGH — Every timeline except home renders all loaded posts, unvirtualized and unmemoized
- `ProfileColumn.tsx:884,918`, `TagColumn.tsx:86`, `CommunityColumn.tsx:252`, `BookmarksColumn.tsx:78`, `ExploreColumn.tsx:190`, `PostDetail.tsx:460` all `items.map(<RMHarkCard/>)` directly; `RMHarkCard` is not memoized (the `memo` wrapper exists only on the home `FeedItem`). DOM grows unboundedly on scroll; each 20-item append re-renders all loaded cards → O(N²) over a long scroll; no `feed-card-cv` content-visibility class.
- **Fix:** extract the home `useWindowVirtualizer` block (`FeedList.tsx:93-139`) into a shared `<VirtualPostList>`; minimum: render memoized `FeedItem` + `feed-card-cv`.

### 6.2 HIGH — Three duplicate `/api/messages/stream` EventSources on the messages page
- `useUnreadCount.ts:31` is a ref-counted singleton (good), but `MessagesColumn.tsx:155` and `ConversationView.tsx:312` each open their own stream with independent reconnect loops. With a conversation open: 4 held SSE connections → saturates the HTTP/1.1 6-per-origin pool → every subsequent fetch queues → "the whole site is hung." The `useUnreadCount` comment documents this exact failure mode.
- **Fix:** generalize into one shared message-stream bus (mirror `hooks/useFeedSSE.ts`).

### 6.3 MEDIUM — Re-render storms as data accumulates
- ~3 `authClient.useSession()` subscriptions **per card** (`RMHarkCard.tsx:58`, `RMHarkActions.tsx:35`, `RMHarkOverflowMenu.tsx:74`) instead of the app's own shared context (`Providers.tsx:85-90`) → ~80 subscriptions per screen; any session emit re-renders every card.
- `userDisplayStore.setUsers` dirty-check compares `cosmetics` by reference — a fresh object in every API response — so every author with cosmetics gets a new cache entry per fetch, re-rendering all their visible cards via `useFreshUser` (3 subs/card). Structurally compare it (`stores/userDisplayStore.ts:41-63`).
- `feedStore.updateItem` allocates a new items array even on no-match (`stores/feedStore.ts:296-302`); `FeedList` subscribes to the whole store (`FeedList.tsx:53-54`) → return `state` unchanged on miss; granular selectors.
- GroupChatView smooth-scrolls + re-renders the full unvirtualized list on every message (`GroupChatView.tsx:253-255`) → autoscroll only near bottom, `behavior:'auto'`.
- `useCardSheen` re-renders per mousemove (`hooks/useCardSheen.ts:8-16`) — replace with the CSS-var pattern from `useGlassLight`.
- `useDoctrineSahur` runs a 30 s poller **per consumer** (two mount together — `hooks/useDoctrineSahur.ts:28-32`) → ref-counted singleton.

### 6.4 MEDIUM — Backdrop-filter glass on scroll-pinned chrome
- 20–28 px blur `glass-*` classes on sticky headers/sidebar (`app/globals.css:541-594`, `PageLayout.tsx:91`, `FeedColumn.tsx:138`) re-sample the backdrop every scrolled frame. `perf-lite` only triggers at ≤4 GB/≤4 cores (`Providers.tsx:184-188`) — mid-range devices pay full price. Widen the heuristic (RUM signal exists in `lib/rum.ts`) or reduce blur while `data-scrolled`.

---

## 7. Realtime tier & workers

- **Farming-sim leak (MEDIUM-HIGH):** `handlers/rmh-farming-sim.ts:169-170` — `farms`/`codeToFarm` maps have zero `.delete()` calls; every farm ever visited stays resident in a 768 MB container. Presence loop broadcasts every farm's full list every **100 ms** unconditionally (`:987-991`); full 576-tile JSON upsert per dirty farm every 5 s. Fix: evict empty farms after grace (dream-rift pattern), dirty-flag the broadcast.
- **No rate limits on relay events (MEDIUM):** `server/socket-server/config.ts:39-97` has no rules for `rfs:*`, `ndw:*`, slice-it, and others; unknown events pass (`server/shared/rate-limit.ts`). One client can pump thousands of msgs/sec fanned to rooms. Add movement-event rules (~1200/min like `altair:game:input`).
- **rmhtype progress is O(players²) (MEDIUM):** one room-wide emit **per player** per 200 ms tick (`handlers/rmhtype.ts:570-590`) — 16-player room ≈ 1,280 msgs/sec. Batch into one array payload.
- **Deploy reconnection storm (HIGH):** every deploy recreates all hubs in place (`deploy.sh:777`); rmhbox auth does a **Discord API call + uncached session SELECT per connection** (`server/rmhbox/auth.ts:34-63`), rmhtube likewise (`server/rmhtube/auth.ts:42`); socket-server's 60 s auth cache (`index.ts:83-95`) is cold. Port the auth cache to both hubs; jittered client reconnect.
- 202 `socket.on` per connection + 18 disconnect walkers, some O(all lobbies) (`server/socket-server/index.ts:214-254`) → lazy registration / reverse index. Rate-limiter cleanup is O(50k) per disconnect (`server/shared/rate-limit.ts:91-97`) → nested map.
- Feed SSE bus: `setMaxListeners(1000)` ceiling (`lib/realtime-bus.server.ts:24`) — monitor; per-topic channels are the strategic fix.
- **Clean (verified, leave alone):** hub game state is in-memory with room-scoped broadcasts (no `io.emit` anywhere in `server/`); rmhtube/rmhbox loops bounded with idle-skips and GC; ladder/homes workers leased, batched, 12 h/6 h cadence; Go supervisor disciplined (no busy loops); deploy pipeline health-gated with migration lock timeouts.

---

## Already healthy — do not re-fix

Home feed virtualization + measurement cache; singleton feed SSE with backoff; idle-deferred sidebar widgets; IO-gated view beacons/link previews; lazy composer/emoji-picker/monaco/three/tone/pdfjs/fuse/confetti; exemplary `LazyMotion` usage; conservative React Query defaults (60 s staleTime, no focus refetch); client i18n core/rest split; anon + signed-in first-page feed caches; denormalized engagement counters; Redis-buffered views/presence/unread counts; keyset pagination in the feed; `/api/search` FTS; request-scoped session memo; SSRF-guarded external fetches; Apache gzip; `.server.ts` stubbing keeping heavy libs out of SSR.

---

## Suggested rollout

**Phase 0 — config-only, same day, no code risk:**
Cloudflare cache rule for image proxy paths (§1.2) · `DATABASE_POOL_SIZE` + lower acquire timeout (§ top-12 #3) · `NODE_OPTIONS` heap flag (§1.5) · explicit `REDIS_URL` + eviction policy (§2.10) · Apache MPM settings (§1.3) · `postgresql.conf` tuning (§1.4) · cookieCache 300 s (§3.1) · healthcheck endpoints (§1.6).

**Phase 1 — small diffs, huge wins (~1 week):**
`autoCodeSplitting` (§5.1) · root-loader `staleTime` + core-namespace SSR i18n (§4.1) · missing indexes migration (§2.1, §2.10) · feed search/hashtag/similar → FTS/Hashtag table (§2.2) · lazy-wrap the six bundle leaks (§5.2) · bounded reactions everywhere (§2.3) · explore pool cache (§2.4).

**Phase 2 — structural (~2–3 weeks):**
Web replicas + SSR `s-maxage` for anonymous pages (§1.1) · shared `<VirtualPostList>` (§6.1) · message-stream singleton (§6.2) · store dirty-check/selector fixes (§6.3) · engagement side-effects to background queue (§2.7) · comment-tree batching (§2.5) · rmhbox aggregates (§2.6) · SSE-carried counts replacing pollers (§3.2) · hub auth caches + farming-sim eviction (§7).

**Measure as you go:** RUM plumbing already exists (`lib/rum.ts`, `/api/rum`); add p50/p95 TTFB + event-loop lag + pool-wait metrics before Phase 1 so each change is verifiable. Add the bundle analyzer to CI (§5.3) so regressions are visible at review time.
