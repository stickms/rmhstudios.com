# 04 — Workstreams

The program is split so that parallel agents never edit the same file. Each
workstream lists what it **owns** (may edit), its **leads** (where to look
first — hypotheses, not conclusions; the baseline decides), and its **exit
criteria**. Paths are globs from the repo root. When ownership is ambiguous,
the more specific glob wins; when still ambiguous, ask the coordinator via a
handoff row and do not edit.

Every workstream starts by re-baselining its own routes in its own worktree
(`01-method.md` §4) and reading `results/ws-0.md`.

---

## WS0 — Instrumentation, harness, dataset, baseline (P0, runs alone)

**Owns:** `scripts/perf/**`, `lib/otel/**`, `server/nitro/otel.ts`, and the
`mark()`/`measure()` call sites in `lib/auth-session.server.ts`,
`lib/api/handler.server.ts` (the session step only), `lib/cached.server.ts`,
`lib/prisma.server.ts` (the `$allOperations` hook only), plus `.gitignore`
entries for its outputs and a new `docs/testing.md` subsection.

**Deliver:**

1. `Server-Timing` phases `sess`, `cache`, `db` wired at the call sites listed
   in `lib/otel/timing.ts`; `loader`/`render` if a single choke point exists
   (if not, say so — do not invent one). Tests in
   `lib/__tests__/otel-server-timing.test.ts`.
2. The env-gated `x-rmh-queries` header (`01-method.md` §1.3), default off, with
   a test.
3. `scripts/perf/seed-perf-db.ts` and the `rmh_perf_template` database
   (`01-method.md` §1.5), including signed session cookies for the bench and
   heavy users.
4. `scripts/perf/server-bench.mjs` + `scripts/perf/server-routes.json`
   (`01-method.md` §1.1–1.2), including `--compare`.
5. `results/baseline.json` and `results/ws-0.md` per `01-method.md` §4, plus
   the `[db:query-budget]` / unbounded-read log lines captured during the
   baseline run (`results/baseline-querylog.txt`).

**Exit:** a second agent can follow `05-agent-protocol.md` from a clean worktree
and reproduce the baseline for `/` (both auth modes) within the noise band.

---

## WS1 — SSR shell and page loaders

The cost every page pays before its own content: the root loader, the `_site`
layout, the session lookup on the SSR path, i18n serialization, the sidebar, the
dehydrated payload, cold start.

**Owns:** `app/routes/__root.tsx`, `app/routes/_site.tsx`,
`app/routes/_site/**` (route files' `loader`/`beforeLoad`/server functions and
their `head()` — not their components' markup), `app/router.tsx`,
`lib/sidebar-data.ts`, `lib/auth-session.server.ts` (beyond WS0's mark),
`lib/entitlements*.ts`, `lib/i18n/**` (server-side loading/serialization only;
never `resources.<locale>.ts`), `server/nitro/anon-html-cache.ts`,
`server/nitro/warmup.ts`, `server/nitro/security-headers.ts`,
`server/nitro/drain.ts`.

**Leads:**

- Signed-in root-loader work: `getInitialUser`, tier resolution
  (`customSession` → `getUserTier`), appearance seed — how many queries before
  the page's own loader starts, and are they sequential?
- Page loaders that `await` independent fetches in sequence; loaders that block
  on data the page could stream (the home page already streams its first feed
  page unawaited — is that pattern applied where it fits?).
- Dehydrated/serialized payload size per page (`02-budgets.md` §2) — loaders
  returning whole rows where the page reads three fields.
- `anon-html-cache.ts` allowlist: anonymous-invariant `_site` pages not on it
  (each addition goes through the cache-safety checklist).
- Cold start: what `warmup.ts` primes vs what the first signed-in request
  still pays.

**Exit:** every `core`/`content` page inside its signed and anon TTFB budget, or
a row naming the owning workstream of the remaining cost.

---

## WS2 — Feed, social graph, notifications, messages

The highest-traffic signed-in data paths.

**Owns:** `lib/feed/**`, `lib/social/**`, `lib/notifications.server.ts`,
`lib/notifications/**`, `lib/messages.server.ts`, `lib/messages/**`,
`lib/conversation.server.ts`, `lib/group-chats.server.ts`,
`lib/profile.server.ts`, `lib/user-display.server.ts`,
`lib/moderation.server.ts`, `lib/feed-sse.ts`, `lib/realtime-bus.server.ts`,
`lib/hot-counters.server.ts`, and route files under
`app/routes/api/{rmharks,rmharks.ts,feed,notifications,messages,messages.ts,chats,group-chats,profile,profile.ts,comments,explore.ts}`.

**Leads:**

- Signed-in timeline for the heavy user (2,000 follows): the follow-id `IN`
  list, the audience `OR`, hydration (author display, reactions, polls, quotes)
  — query count and `EXPLAIN` on the seeded dataset.
- First-page cache for signed-in users (scalability audit §2.2 phase 2) — only
  with an invalidation story that passes `03-rules.md` §2, including blocks.
- Notification unread counts and the DM stream's unread recompute per event.
- Profile page counts and follower lists.
- Comment thread loads on the 2,000-comment thread.
- SSE: per-event work done for every connection.

**Exit:** the feed, post, profile and notification routes inside budget for the
heavy user; no unbounded read left in owned files.

---

## WS3 — API layer: cache-policy adoption and handler overhead

**Owns:** `lib/api/**` (beyond WS0's mark), `lib/cache.ts`,
`lib/cached.server.ts` (beyond WS0's mark), `lib/rate-limit*.ts`, and — in every
`app/routes/api/**` file **not owned by WS2, WS5 or WS6** — the **options
object** passed to `defineHandler` (`cache`, `etag`, `rateLimit`), plus moving
a hand-rolled `Cache-Control` onto the `cache` option. Handler bodies in those
files belong to WS4.

**Leads:**

- Triage every `GET` handler into: public-cacheable (anonymous-invariant,
  proven by reading the body and its callees), private-cacheable
  (per-user, `visibility: 'private'`, short `maxAge`), or no-store. Commit the
  triage script and its output table in `results/ws-3.md`; then declare
  policies. Rank by call frequency from the WS0 route list.
- `defineHandler` fixed overhead per request (session resolve, rate-limit store
  round-trip to Redis, zod parse): measure on a trivial route; is anything
  done twice?
- `apiCache` consumers that are coherence-sensitive (scalability audit §3.1) and
  not yet on `cached()`.

**Exit:** every `GET` in the triage table has a declared policy or a stated
reason for none; wrapper overhead on a trivial route measured and inside the
`api` budget.

---

## WS4 — Database: queries, indexes, read replica adoption, search

**Owns:** `prisma/schema.prisma` and new `prisma/migrations/**`; every
`lib/**/*.server.ts` and `lib/**` query module **not owned by another
workstream**; `lib/search/**`, `lib/tags*.ts`, `lib/leaderboard.server.ts`; and
**handler bodies** of `app/routes/api/**` files not owned by WS2/WS5/WS6 (WS3
owns their options object — keep hunks apart).

**Leads:**

- `results/baseline-querylog.txt`: every route over its query budget and every
  unbounded-read log line, worked top-down by (count × call frequency).
- `findMany` without `take` on growing tables; `include` used to read one field;
  per-item lookups in loops.
- Slow queries on the seeded dataset: enable `log_min_duration_statement=20`
  on the local Postgres during the bench and `EXPLAIN (ANALYZE, BUFFERS)` the
  offenders. Search (`lib/search/**`, hashtag/mention search) on 200k posts.
- `prismaRead` adoption at read-only call sites (backlog §9).
- Leaderboards: per-request sorts that a cached top-N or an index removes.

**Exit:** no route over its query budget for a cause in owned files; every new
index carries its `EXPLAIN` before/after; `check-migration-safety` green.

---

## WS5 — Realtime hubs and workers

**Owns:** `server/**` except `server/nitro/**`; `scripts/perf/socket-bench.mjs`.

**Leads:**

- Build `socket-bench.mjs` (`01-method.md` §1.6) and an env-gated event-loop
  delay probe in `server/shared/`.
- Per-tick/per-event allocation and `JSON` work in hot handlers (casino tick,
  rmhbox state sync, rmhtube heartbeat, rmhmusic sync); broadcasts that
  serialise per recipient when one `io.to(room).emit` would do.
- Prisma calls on the per-event path (should be at completion, batched).
- Auth handshake cost per connection (session lookup cached?).
- Workers (`jobs`, `ladder-worker`, `homes-worker`): memory and DB pool
  pressure they put on the shared Postgres while the web tier serves.

**Exit:** hubs inside the event-loop and broadcast budgets at the scripted load;
no per-event DB write on a hot path without batching.

---

## WS6 — CPU-bound endpoints

**Owns:** `lib/og/**`, `app/routes/api/og/**`, `app/routes/api/feed/image/**`,
`app/routes/api/image-proxy.ts`, `lib/image-optimize.ts`, `lib/images/**`,
`app/routes/sitemap[.]xml.ts`, `app/routes/sitemaps.$name.ts`,
`app/routes/*rss[.]xml.ts`, `lib/feed/rss.server.ts` (by agreement with WS2 —
WS2 does not touch it), `app/routes/api/oembed.ts`, `app/routes/api/embed/**`,
`app/routes/api/unfurl.ts`.

**Leads:**

- OG card render time (satori/resvg) cold vs cached; whether the cache survives
  a restart; event-loop block per render.
- Image variant route: sharp per request on a miss; width allowlist; whether
  encoding blocks the loop (sharp is off-thread — verify concurrency setting).
- Sitemaps/RSS on 200k posts: query shape, streaming vs building one string,
  cache headers.

**Exit:** each endpoint's cold cost measured; no event-loop block > 50 ms per
request on the web process; repeat requests served from cache.

---

## Merge order (P2)

`WS0` (already merged before P1) → `WS4` (schema/migrations first) → `WS2` →
`WS1` → `WS3` → `WS6` → `WS5`. The coordinator re-runs `pnpm check:consistency`
after each merge and the full harness after the last one.

## Handoffs

A results file's **Handoffs** table is the only channel between workstreams:
`| to | file:line | what | evidence |`. The coordinator routes each one into the
owning workstream or into the report's follow-up list.
