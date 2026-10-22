# WS8 - Search and tag feeds - results

> Point-in-time ledger as of `c4c8d6091` (#925). Figures are from the seeded perf dataset or in-process runs, not production; SHAs and branch names refer to that program's worktrees.

Branch `perf/ws-8`. Measured in-process (`tsx`, one Node process, warm Postgres) against the seeded `rmh_ws8` (20k users, 200k posts, 80k post_hashtag; heavy user follows 2,000), A and B alternating call-by-call, 25 pairs, on a shared 4-core box (absolute numbers are noisy; the ratio is the claim). No production-build HTTP run: the build was lost to container restarts and a disk-full event, and the route handlers add only session/serialization on top of these functions. Evidence type: `latency` (EXPLAIN buffers for the tag feed are `exact`).

## Shipped
| # | Change | Route | Before p50/p95 | After p50/p95 | Evidence | Commit |
|---|---|---|---|---|---|---|
| 1 | Tag feed: keyset scan of `post_hashtag (hashtagId, createdAt DESC, rmheetId DESC)` that stops at limit+1, then hydrate those ids. `linkPostHashtags` stamps the post's createdAt on the link; migration realigns old links; index swap CONCURRENTLY | `/tag/:tag`, `/api/tags/:tag` (`listTagFeed`) | anon 63 / 73 ms; heavy user 78 / 116 ms | anon 5.6 / 9.7 ms; heavy 13 / 22 ms | latency; EXPLAIN tag1 heavy: 15.5 ms, 3,993 PK probes -> 0.22 ms, 21 index rows, 99 buffers (exact) | 8db580139, dd1a0678a |
| 2 | People search: per-table index-eligible recall (rare query) / fold-once single scan (common query); a LIKE probe (token-aware) picks the plan | `/api/users/search`, people part of `/api/search` | "heavy" 606 / 639; "zzqx" 590 / 659; "user1" 432 / 466; "bench user" 550 / 571 | 4.8 / 7.1; 3.4 / 4.2; 264 / 278; 322 / 352 | latency | 4affd03db + token-probe follow-up |

## Equivalence proof
- Tag feed: old vs new `listTagFeed`, ids + nextCursor + hasMore compared on 282 pages (up to 8 deep) for viewers anon / heavy / a private-community member, tags tag1,tag2,tag3,tag7,tag300,TAG1,nonexistent, on a copy of the DB with planted FOLLOWERS (1,227), SUPPORTERS, CIRCLE and deleted posts and 3 private communities (178 private-community posts). 0 mismatches. Copy dropped afterwards. The seeded DB has no non-PUBLIC rows or private communities, hence the planting.
- People search: old vs new final result ids, ~30 queries (rare, common, one letter, accents, wildcard characters, multi-token) x limit 5/10 x exclude-user on/off: 0 mismatches. Recall predicates and rank expression are the same fragments; only the plan differs.
- Visibility filters untouched: tag feed keeps deleted, hidden authors, audience (PUBLIC / own / FOLLOWERS-followed; SUPPORTERS and CIRCLE stay empty as before) and private-community membership; post search (PUBLIC only, private communities excluded) is unchanged.

## Findings that corrected the brief
- `rmh_search_norm` is an IMMUTABLE SQL wrapper over `lower(unaccent(...))` (migration 20260801150000) with expression trigram GIN indexes on user name/username/handle, profile displayName/bio, rmheet.content and the doc corpora. They exist and are used by single-table queries. People search missed them because its OR spans `"user" JOIN user_profile`, which cannot become a bitmap-OR.
- `post_hashtag (hashtagId, createdAt DESC)` already existed; it could not drive the feed because the feed ordered by `rmheet.createdAt` while link rows carried link time. Fixed by making them equal (#1).
- main's `757b1d6df` touched mention lookups only; not these paths.

## Rejected / no change
| Lead | Why |
|---|---|
| Post search (posts part of `/api/search`, ~116 ms for "build") | Indexes (tsv GIN + norm trigram GIN) are already used; cost is inherent: 20k matching rows (10% of table) heap-fetched, rechecked and ranked. Cutting it needs a smaller candidate pool, i.e. different results. |
| Lateral fold-once on every people query | Planner inlines it on the rare-query plan; only wins on the common-query plan, where it is used. |
| `hashtag-search`, `mention-search` | Already 0.1 ms index scans / index-backed (main). |

## Notes
- Common-query people search is still 260-320 ms: 11k of 20k users match "user1" (synthetic usernames); trigram `%`/`<%` per row is the floor without changing recall.
- Migrations 20261022160000 (UPDATE of mismatched rows only), 160100 (CREATE INDEX CONCURRENTLY, single statement), 160200 (DROP INDEX CONCURRENTLY of the redundant prefix index); sort after 20261022150100. `check-migration-safety.ts`: no unsafe statements. `migrate deploy` applied them on rmh_ws8.
- `schema.prisma` PostHashtag index is now `(hashtagId, createdAt DESC, rmheetId DESC)`.
