# 04 — The database: no revamp needed

The brief authorised revamping the database layout. **It does not need one**, and
this file is the evidence for that conclusion rather than an argument for doing
nothing. If a future agent is told "revamp the schema for performance", start
here and require new evidence before spending that budget.

The reason the answer is "no" is that the database is not on the critical path
of a slow page. Warm TTFB is **26–80 ms**. The homepage's JavaScript is
~380 requests and ~1 MB encoded. Halving the DB time would move a page load by
tens of milliseconds; the JS work in [`02-critical-path.md`](02-critical-path.md)
moved it by hundreds.

## 1 — Scale

| Thing                          | Count |
| ------------------------------ | ----: |
| Models                         |   323 |
| Enums                          |    71 |
| Schema lines                   | 8,864 |
| `@@index` declarations         |   429 |
| `@@unique` declarations        |   114 |
| Migrations                     |   173 |
| Tables created from an empty DB |  323 (0 errors) |
| `findMany` call sites          |   603 |

> **Doc drift worth fixing:** root `CLAUDE.md` and `lib/CLAUDE.md` both say
> "252 models, 66 enums, ~6000 lines". Actual: 323 / 71 / 8,864. Not a
> performance issue, but those files are the map agents navigate by.

## 2 — Index coverage on the hot path

The feed is the hottest read in the product. `lib/feed/timeline.ts` paginates
with a `(createdAt desc, id desc)` keyset, filtered by author set on the
"following" surface and by audience on "for you". The indexes match the access
patterns exactly:

| Model            | Index                                            | Serves                                     |
| ---------------- | ------------------------------------------------ | ------------------------------------------ |
| `RMHark`         | `(createdAt desc, id desc)`                      | "for you" keyset page                      |
| `RMHark`         | `(userId, createdAt desc, id desc)`              | "following" (`userId IN (…)` + keyset)     |
| `RMHark`         | `(communityId, createdAt desc, id desc)`         | community timelines                        |
| `RMHark`         | `(threadRootId)`, `(originalId)`, `(userId, pinnedAt)` | thread pages, quotes, pinned         |
| `RMHarkRepost`   | `(createdAt desc, id desc)`, `(userId, createdAt desc, id desc)` | the repost half of both surfaces |
| `RMHarkRepost`   | `unique(rmheetId, userId)`                       | dedupe + "did I repost this"                |
| `RMHarkReaction` | `(rmheetId)`                                     | the per-post emoji `groupBy`               |
| `RMHarkReaction` | `unique(rmheetId, userId, emoji)`                | "did I react" (`rmheetId IN (…) AND userId`) |

Content search is index-backed too: `resolveSearchPostIds` uses a
`content_tsv @@ websearch_to_tsquery` FTS index (a raw-SQL migration column, not
in `schema.prisma`) rather than an unindexed `content ILIKE '%…%'` scan, capped
at 1,000 ids and folded in as `id: { in: [...] }` so every audience/deleted/
following filter still applies on top.

## 3 — The read path is already the shape an optimisation pass would produce

`lib/feed/timeline.ts` has had the work done. Listing it so nobody redoes it:

- **Counts are denormalized columns** (`likeCount`, `commentCount`,
  `repostCount`, `viewCount`, per-option `voteCount`) — no `_count` aggregation
  per item.
- **Author display is not joined per row.** `getUserDisplayMap` batch-resolves
  post authors, quoted-original authors and reposters in one cached call, keyed
  by the scalar `userId`. The comment records that this removed ~40
  profile+inventory relation fan-outs per 20-item page.
- **Reactions are two bounded queries**, not an unbounded per-post relation
  fetch: a `groupBy` over `(post, emoji)` for counts plus the viewer's own rows.
  A viral post with thousands of reactions costs the same as a quiet one.
- **Everything independent is batched.** The four WHERE-shaping reads (hidden
  authors, follow graph, circles, muted tags) go out in one `Promise.all`; the
  interest profile and announcements run *alongside* the main query because
  neither gates it.
- **Two caching tiers.** The signed-out first page is one shared
  stale-while-revalidate entry with single-flight collapse, so a TTL-expiry burst
  runs one assemble rather than one per request. The signed-in first page is
  cached per `(surface, filter, viewer, limit)` for 15 s with a 45 s SWR window,
  so "open the app" returns in ~1 ms warm instead of running the ~32-query
  assemble.
- **Announcements are cached per filter** and skipped entirely when paginating,
  with the reason written down (static 2025 dates would re-interleave on every
  page).

## 4 — Instrumentation already exists and is wired

Two Prisma client extensions in `lib/prisma.server.ts`, both reached through
`withExtensions()`:

- **Query budget (E3).** Counts queries per request, warns once at the crossing
  with the top offending `model.operation` pairs, and can be made to throw with
  `DATABASE_QUERY_BUDGET_ENFORCE=1`. Default ceiling 40.
- **Unbounded-read guard (OPT-50).** Warns on `findMany` with no `select` or no
  `take`, once per model+call-site. **Development only** — it is deliberately
  `$extends`ed off in production.

Both are live for web requests: `server/nitro/otel.ts` calls `enterQueryBudget`
in the `request` hook and `reportQueryBudget` in the `response` hook, and that
plugin is registered in `vite.config.ts`.

> An earlier draft of this audit recorded the budget as dead code, because
> `withQueryBudget` appears only in tests. That was wrong — the request path uses
> `enterQueryBudget` (the `enterWith` variant, for hook-shaped hosts with no
> continuation to wrap). Grep for both names.

**What is missing is not the mechanism but the harvest.** The budget's stated
purpose is to "PRODUCE the list of offenders", and nobody has collected the
output. That is a cheap, high-information task: run production (or a seeded local
DB) with `DATABASE_QUERY_BUDGET=25` for a day and read the `[db:query-budget]`
lines. See [`06-backlog.md`](06-backlog.md) §6.

## 5 — N+1 and over-fetch: scanned, largely clean

27 sites `await` a Prisma call inside a `for…of` loop. Reviewed: they are
concentrated in seeds and workers — `lib/rmhladder/seed/run-seed.ts`,
`lib/homes/scrape/seed.ts`, `lib/rmhladder/alerts/dispatch.server.ts`,
`lib/slice-it/rating.server.ts`, `lib/predictions/predictions-ai.server.ts` —
i.e. off the request path, where sequential is often deliberate (rate limits,
ordering, idempotency). **None is on a page-render path.**

This is not a claim that all 603 `findMany` call sites are optimal. It is a claim
that the pathological shape (a per-item query inside a request handler) is not
present in bulk, and that the tool for finding the remainder already exists
(§4) and should be used rather than replaced by a manual audit.

## 6 — Scaling headroom already built, unused

Available behind env vars, needing no code change to adopt:

| Capability     | How                          | Status                                             |
| -------------- | ---------------------------- | -------------------------------------------------- |
| Read replica   | `DATABASE_REPLICA_URL`       | `prismaRead` falls back to `prisma` when unset, so call sites can adopt it now with zero behaviour change |
| Pool sizing    | `DATABASE_POOL_SIZE` (20)    | tune per host                                      |
| Redis tier     | `REDIS_URL`                  | `cachedSWR`, rate limits and SSE fan-out all degrade to in-process without it |
| Pooler safety  | `DATABASE_DIRECT_URL`        | warns at boot if `DATABASE_URL` looks pooled and this is unset (migrate's advisory lock is session-scoped) |

**Adopt `prismaRead` at read-only call sites now**, well before a replica
exists — that is the whole point of the fallback, and doing it incrementally
turns "stand up a replica" from an audit of every read into an env var.

## 7 — The one schema-shaped recommendation

Not a revamp; a policy that already exists and should keep being followed.
`lib/CLAUDE.md` records the rewrite's R0-T7 rule: existing tables keep their
`cuid()` primary keys, but **any new append-only / high-volume table should take
a time-sortable key** (UUIDv7/ULID or `BigInt` identity) for insert locality, so
a second `(fk, createdAt)` index is not needed just to scan it. With 323 models
and 173 migrations, the cost of *not* holding that line compounds quietly.
