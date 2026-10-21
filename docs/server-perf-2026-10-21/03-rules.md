# 03 — Rules every change obeys

These are in priority order. When two conflict, the earlier one wins. The repo's
own conventions ([`/CLAUDE.md`](../../CLAUDE.md), the commit gate) apply on top
of all of them and are not repeated here except where performance work tends to
break them.

## 1. Correctness before speed

1. **A user sees the same thing, sooner.** Same status, same body, same
   ordering, same permissions. A faster response that is occasionally wrong is
   a regression, however rare.
2. **Staleness is a product decision, written down.** Every cache states its
   TTL *and* why that much staleness is acceptable for that data, in a comment
   next to the cache. If you cannot justify a number, the data is not cacheable
   at that layer.
3. **Moderation, permissions and money are never stale.** Blocks/mutes, private
   accounts, visibility (`FOLLOWERS`, `PRIVATE`), bans, membership tier on a
   gated action, coin balances, and anything checked before a write are read
   fresh or from a cache that is **invalidated synchronously** by the write that
   changes them (`invalidateCached`, which broadcasts over Redis). A TTL alone is
   not enough for these.

## 2. Cache safety checklist

Every new or changed cache — L1, L2, HTTP — answers all of these in its commit:

- [ ] **Key:** includes every input the value depends on: viewer id (or
      "anonymous-invariant" with proof), locale, query params, pagination
      cursor, feature flags, tier.
- [ ] **Visibility:** an HTTP `cache: { visibility: 'public' }` is allowed only
      when the handler body never reads the session, cookies or
      request-specific headers. **`auth: 'none'` is not proof** — 46 of 69
      `auth: 'none'` handlers read the session themselves
      ([`03-api-caching.md` §2](../loading-audit-2026-08-11/03-api-caching.md)).
      Read the handler, and every function it calls that could.
- [ ] **Invalidation:** which writes change this value, and where they call
      `invalidateCached` / `invalidateCachedPrefix`. "TTL only" is acceptable
      only when rule 1.2's staleness note says so.
- [ ] **Coherence:** new server caches use `cached()` (`lib/cached.server.ts`),
      not `apiCache` directly — production can run two web processes during a
      blue/green swap, and `apiCache.invalidate` is local-only.
- [ ] **Stampede:** the loader is deduplicated (`cached()` does this) and the
      TTL is not aligned across many keys that expire together.
- [ ] **Memory:** the key space is bounded (per-user keys × users × value size
      fits in the process alongside everything else; state the estimate).
- [ ] **Test:** a test that fails if the cache serves one viewer's data to
      another, or serves stale data after the invalidating write.

## 3. Evidence before merge

1. No number, no merge (`01-method.md` §3). A change whose measurement shows no
   win is **reverted**, and the idea is recorded as rejected with its number —
   that row is as valuable as a win, because it stops the next pass.
2. Do not re-attempt anything in the "Measured and rejected" table of
   [`loading-audit-2026-08-11/06-backlog.md`](../loading-audit-2026-08-11/06-backlog.md)
   without new evidence that changes its premise.
3. Measure the thing users wait on. Shaving a function that runs once per
   process, or a branch no route in the route list reaches, is not a win
   unless the profile says it is on a hot path.

## 4. Database

1. **Bounded reads.** Every `findMany` on a table that grows with users or
   content has a `take`, and pagination is keyset `(sortKey, id)`, not offset.
2. **Select what you use.** `select` the fields the caller reads; never
   `include` a relation to read one field of it.
3. **No query in a loop.** Batch with `in` + a map, or `groupBy`. A Prisma
   `include` that the engine turns into N queries counts as a loop.
4. **Read-only paths use `prismaRead`** — zero behaviour change while
   `DATABASE_REPLICA_URL` is unset (it falls back to `prisma`). Never for a read
   that must observe a write made earlier in the same request.
5. **Indexes come with a query that needs them** — named in the migration
   comment — and an `EXPLAIN (ANALYZE, BUFFERS)` before/after on the seeded
   dataset in the results row. Indexes on large tables are created
   `CONCURRENTLY` in their own migration; `scripts/check-migration-safety.ts`
   must pass. Remember every index taxes every write to that table.
6. **Raw SQL** (`$queryRaw`) only when the Prisma form is measured slower, and
   always parameterised (tagged template), never string-built.
7. **Writes:** related writes in one transaction; counters stay denormalized
   and atomic (`{ increment: 1 }`), never read-modify-write.
8. Schema changes are **additive** (expand/contract). No column drops or type
   changes in this program.

## 5. Process and runtime

1. **Don't block the event loop.** CPU work > ~10 ms per request (image
   encoding, big JSON, markdown, crypto) belongs behind a cache, in a worker
   thread, or in the `jobs` queue (`lib/jobs/`).
2. **Don't hold work the response doesn't need.** Side effects the user does not
   wait on (engagement effects, notifications, analytics) go to the `jobs`
   queue, which already degrades to inline when it is unavailable.
3. **Parallelise independent awaits** (`Promise.all`) — but not into the same
   pool past its size; the web pool is `DATABASE_POOL_SIZE` (20).
4. **No new runtime dependency** without a results row showing the win and a
   note on its install/bundle cost. Prisma, Better Auth, TanStack Start, H3/Nitro
   and Socket.IO are not replaced in this program.
5. **Configuration is env-driven with production-safe defaults**, documented in
   `.env.example`. A perf knob that defaults to a behaviour change is not
   allowed.

## 6. Observability is public

`Server-Timing` is readable by any page script: phase entries carry `dur` only,
from the fixed vocabulary in `lib/otel/timing.ts`. Bench-only data (query
counts, event-loop delay) is behind an env flag that is **off by default**, with
a test asserting it is off. No ids, keys, SQL, or hostnames in any header.

## 7. Scope discipline

1. Edit only files your workstream owns (`04-workstreams.md`). A fix that needs
   another workstream's file is a **handoff row** in your results file — the
   coordinator routes it. The one exception is a mechanical, one-line
   adaptation forced by your change (a renamed import); say so in the commit.
2. One idea per commit, so a rejected idea is one revert and a bisect lands on
   one cause.
3. Commit messages say *why* and carry the before/after number.
4. Never edit generated files (`app/routeTree.gen.ts`,
   `lib/i18n/resources.<locale>.ts`), never bypass the commit gate, never push —
   the coordinator integrates and pushes.
