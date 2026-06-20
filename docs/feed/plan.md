# Making the RMHark Feed Behave Like Twitter

A plan for evolving our feed toward Twitter-like behavior — scale, end-to-end
correctness, and user intuition. Grounded in how Twitter actually assembles
timelines (read vs. write path, fan-out, hybrid celebrity handling, caching,
eventual consistency) and mapped onto our current code.

> Reality check: rmhstudios.com is not at 200M DAU. The point of this plan is to
> adopt the *shape* of Twitter's architecture where it buys us correctness and
> intuition today, and to leave clean seams where true scale work plugs in later.
> Each phase is independently shippable. We do **not** build fan-out-on-write
> until the data says we need it (see Phase 4 trigger conditions).

---

## 1. How Twitter actually works (the relevant bits)

From the reference article, the load-bearing ideas:

- **Pre-construct, don't compute on request.** Home timelines are built ahead of
  time and cached, trading real-time accuracy for read latency.
- **Fan-out on write (regular users).** A new tweet is pushed into every
  follower's materialized feed table asynchronously (CDC → Kafka → workers).
  Reads become a single partition scan.
- **Fan-out on read (celebrities).** Fanning a 100M-follower post into 100M
  feeds would melt the pipeline. Instead, posts from high-follower accounts are
  pulled at read time and **merged** with the pre-built timeline.
- **Hybrid is the real answer.** Most accounts → write path; whales → read path;
  merge + sort by timestamp at request time.
- **Sharding by user ID** keeps a user's tweets, follows, and feed co-located.
- **Caching (Redis) in front of the tweets DB** absorbs viral read storms; CDN
  for media.
- **Eventual consistency (Cassandra).** Like/engagement counts propagate
  asynchronously; temporary cross-device inconsistency is accepted.
- **Everything async.** The write returns immediately; fan-out happens in the
  background.

---

## 2. Where we are today

Core paths (current):

- **Read path** — [app/routes/api/rmharks.ts](../../app/routes/api/rmharks.ts):
  every feed request runs `rMHark.findMany` ordered by `createdAt desc` over the
  *entire* table, plus a **second** `rMHarkRepost.findMany`, then merges, sorts,
  de-dupes reposts, and interleaves static announcements (3 RMHarks : 1
  announcement) in app memory.
- **"friends" feed** — fan-out-on-read via `userId: { in: followingIds }` after
  loading the full follow list into memory.
- **Engagement counts** — computed live on every read with `_count` aggregation
  (likes, comments, reposts, views) per item, plus a correlated `where:{userId}`
  include for `liked`/`reposted` state.
- **Real-time** — global in-process `EventEmitter`
  ([lib/feed-sse.ts](../../lib/feed-sse.ts)) broadcast to **every** connected
  client over SSE ([app/routes/api/feed/stream.ts](../../app/routes/api/feed/stream.ts));
  the client prepends/patches the Zustand store
  ([stores/feedStore.ts](../../stores/feedStore.ts),
  [hooks/useFeedSSE.ts](../../hooks/useFeedSSE.ts)).
- **Data model** — [prisma/schema.prisma](../../prisma/schema.prisma): `RMHark`
  indexed on `userId` and `createdAt desc`; `Follow` indexed both directions; no
  materialized timeline, no cached counters.

### Gap analysis vs. the Twitter model

| Concern | Twitter | Us today | Impact |
|---|---|---|---|
| Timeline assembly | Pre-built + merge | Full-table scan + sort per request | Read cost grows with total post count, not relevance |
| Home vs. global | Per-follow-graph | "all" = global table; "friends" = in-memory IN clause | "friends" degrades with follow-list size; no real "Following" home |
| Counts | Denormalized, async | `_count` join every read | N aggregations per page, every page |
| Fan-out | Hybrid write/read | Read-only, unbounded `IN (...)` | Breaks on large follow lists / large post tables |
| Real-time | Pushed to followers | Broadcast to **everyone** | Everyone sees every stranger's post injected live; wrong for a "Following" feed; doesn't respect active filter |
| Caching | Redis + CDN | None | Every viral read hits Postgres |
| Pagination | Stable per-partition | Timestamp cursor over a **merged** two-query slice | Tie-breaks, dropped/duplicated items across pages |
| Ranking | Scored | Strict chrono (+3:1 announcement) | No "For You" surface |
| Horizontal scale | Sharded, Redis pub/sub | Single-process EventEmitter | SSE breaks the moment we run >1 instance |

---

## 3. Target architecture

Keep Postgres + Prisma. Adopt Twitter's *shape* incrementally:

```
WRITE PATH                          READ PATH
─────────                           ─────────
POST /rmharks                       GET /rmharks?feed=following|foryou
  ├─ insert RMHark                    ├─ home: read materialized FeedEntry
  ├─ bump denormalized counters         partition for this user (Phase 4)
  ├─ enqueue fan-out job (Phase 4)    ├─ + merge "whale" authors at read time
  └─ publish targeted SSE event       ├─ + apply ranking (Phase 5)
                                       └─ hydrate from counter cache

REAL-TIME                           CACHE / SCALE
─────────                           ─────────────
Redis pub/sub fan-out (Phase 3)     Redis: hot post + counter cache (Phase 2)
SSE filtered by follow graph         Postgres stays source of truth
```

---

## 4. Phased roadmap

### Phase 0 — Correctness & seams (no new infra)

The current code has scale-independent bugs worth fixing first; they also create
the seams later phases plug into.

1. **Stable keyset pagination.** Replace the timestamp-only cursor with a
   composite `(createdAt, id)` keyset so ties don't drop/duplicate rows across
   pages. The current "two `findMany` + merge + `slice(0, limit)`" pattern in
   [rmharks.ts](../../app/routes/api/rmharks.ts) can silently drop the older
   half of whichever stream was denser in a page — encode the cursor as
   `{ createdAt, id }` and apply it to both the rmhark and repost queries.
2. **Unify the timeline read behind one function.** Extract
   `getTimeline({ userId, feed, cursor, limit })` into `lib/feed/timeline.ts`.
   Today the "friends" and "all" branches duplicate ~150 lines of mapping logic.
   One function = one place to add caching, ranking, and fan-out later.
3. **Name the feeds like Twitter does.** Introduce explicit `feed=following` and
   `feed=foryou` query params (keep `filter=` for content-type tabs). "Following"
   = follow-graph home; "For You" = the current global/ranked surface. This is
   the single biggest *user-intuition* win and it unblocks correct SSE targeting.

### Phase 1 — Denormalized counters (eventual consistency)

Mirror Twitter's async-count model.

- Add `likeCount`, `commentCount`, `repostCount`, `viewCount` **columns** to
  `RMHark` (and comments). Maintain them transactionally in the like/comment/
  repost/view routes (e.g. [.../like.ts](../../app/routes/api/rmharks/$id/like.ts)
  already counts after every toggle — switch to an atomic `increment`/`decrement`
  on the column instead of `count()` + `_count` joins on read).
- Read path drops all `_count` includes → one row read per post, no aggregation.
- Accept eventual consistency: a reconciliation job (cron) periodically
  re-derives counts from the source tables to correct drift. This is exactly
  Twitter's "counts update asynchronously, drift is tolerated" trade-off.

### Phase 2 — Read cache (Redis in front of Postgres)

- Cache **hydrated post objects** by id and **counter values** in Redis, with the
  like/comment/repost routes writing through. Viral reads hit memory, not
  Postgres — Twitter's Redis-before-DB pattern.
- Cache the **first page** of each feed surface per user (short TTL, e.g. 15–30s)
  so the common "open the app" request is a cache hit.
- Media already served via the self-hosted Apache CDN vhost (recent commits) —
  that's our CDN leg; keep post media out of the app server.

### Phase 3 — Horizontal-safe real-time (the most urgent scale bug)

Today SSE is an in-process `EventEmitter` **and** broadcasts every event to every
client. Two fixes:

1. **Redis pub/sub** behind `feedEventBus`
   ([lib/feed-sse.ts](../../lib/feed-sse.ts) already flags this: "swap the emitter
   for a Redis pub/sub adapter"). Required before we ever run >1 app instance.
2. **Target events to the follow graph, not everyone.** A new RMHark should
   stream into a viewer's **Following** feed only if they follow the author (or
   into "For You" by ranking rules) — not blindly `prependItem` onto every open
   client as it does now in [useFeedSSE.ts](../../hooks/useFeedSSE.ts). For the
   global/For-You surface, prefer a **"N new posts" pill** (Twitter's pattern)
   over auto-injection, so the scroll position is never disturbed.
   - Engagement events (like/comment counts) can still broadcast cheaply since
     they're idempotent patches keyed by post id.

### Phase 4 — Hybrid fan-out (only when reads hurt)

Trigger conditions (don't build before these are true): p95 timeline read
latency regresses, *or* median follow-list size makes the `IN (...)` query plan
bad, *or* a single author's posts dominate fan-out cost.

- **FeedEntry table** (materialized home timeline), partitioned/indexed by
  `(ownerId, createdAt desc, id)` — Twitter's per-user feed partition.
- **Fan-out on write** for normal authors: on POST, enqueue a job that inserts a
  `FeedEntry` row into each follower's partition. Use the existing async seam
  (today it's `feedEventBus.publish`; back it with a real queue — BullMQ/Redis,
  or pg-boss if we want to stay single-store).
- **Fan-out on read for whales.** Flag authors over a follower threshold as
  `isHighFanout`; *skip* their write fan-out and instead **merge** their recent
  posts at read time with the materialized entries, then sort by `(createdAt, id)`.
  This is the exact hybrid the article describes.
- The unified `getTimeline()` from Phase 0 is where the merge lives, so callers
  don't change.

### Phase 5 — Ranking ("For You")

- Compute a lightweight score (recency decay × engagement velocity, author
  affinity, viewer mutes/blocks) at read time over a candidate set, instead of
  strict chrono. Keep **Following = reverse-chron** (users expect that) and apply
  ranking only to **For You**. Replace the current hardcoded 3:1 announcement
  interleave with announcements as just another scored candidate source.

---

## 5. End-to-end & user-intuition improvements

These are mostly orthogonal to scale and pay off immediately:

- **Optimistic engagement.** Like/repost should flip instantly client-side and
  reconcile from the server, rather than waiting on the round-trip. The store
  already supports `updateItem`; add rollback on failure.
- **"N new posts" pill** instead of live auto-prepend on For You (Phase 3) — never
  yank the user's scroll.
- **Two clear tabs**: *Following* (chrono, follow-graph) and *For You* (ranked,
  global). This is the mental model every user already has from Twitter and it
  resolves today's ambiguity where "all" is global and "friends" is the only
  graph-aware view.
- **Self-action consistency.** Your own new post / like / repost should appear
  immediately and not be deduped away by the SSE path (the store already guards
  double-add by id — verify it holds for the repost `repost:${id}` synthetic ids).
- **Empty/cold states.** A brand-new user's Following feed is empty today
  (returns `[]`); show suggested follows / fall back to For You so the first
  session isn't blank.
- **Read-state for views** mirrors Twitter's impression model; we already record
  `RMHarkView` — make sure the denormalized `viewCount` (Phase 1) is what the UI
  reads.

---

## 6. Risks & non-goals

- **Don't fan-out-on-write prematurely.** Materialized timelines add write
  amplification and a whole consistency surface. At our volume, a well-indexed
  read path + counter denormalization + Redis cache is almost certainly enough.
  Phase 4 is gated behind real latency evidence.
- **Counter drift** is the cost of denormalization — the reconciliation cron in
  Phase 1 is not optional.
- **Cursor migration** (Phase 0) changes the API contract; ship the composite
  cursor behind the same param name and verify the client merges pages cleanly.
- **SSE targeting** (Phase 3) is the highest-risk-of-regression change because it
  alters what users see live — roll out behind the new `feed=` surfaces.

---

## 7. Suggested order of execution

1. Phase 0 (correctness + `getTimeline()` seam + Following/For-You tabs)
2. Phase 1 (denormalized counters + reconciliation cron)
3. Phase 3 (Redis pub/sub + targeted SSE) — needed before any multi-instance deploy
4. Phase 2 (Redis read cache)
5. Phase 5 (For-You ranking)
6. Phase 4 (hybrid fan-out) — **only if** read latency demands it

The first three phases remove the real bugs (pagination, count cost,
broadcast-to-everyone, single-process SSE) and give users the correct two-tab
mental model. Everything after is scale headroom we add on evidence.
