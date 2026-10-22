# WS7 — Go services — results

> Point-in-time ledger as of `c4c8d6091` (#925). Figures are from the seeded perf dataset or in-process runs, not production; SHAs and branch names refer to that program's worktrees.

Worktree baseline taken 2026-10-21, commit `796295bd` (integration branch with the
status rewrite and the bot-worker settings merged); `rmh_ws7` is a clone of
`rmh_perf_template` (20k users, 200k posts, 500k notifications, 150k comments).
After the final merge of `origin/main` (integration `789fb650e`, which added the on-call
heartbeat/alarm senders in `internal/status/oncall.go` and `pkg/oncall`), `go vet ./...` and
`go test ./...` are green in `go-services/`; the on-call code was read and needs no change
(one heartbeat goroutine per minute, bounded queue). Environment deviations: **Bazel could not run** (module fetch is blocked by the
sandbox proxy: `bcr.bazel.build` 403 on one attempt, and with `--batch` the build got as far
as the toolchain download `github.com/bats-core/...tar.gz` -> 403), so `make gazelle` / `make test` were replaced by hand-edited
`BUILD.bazel` files (every new `.go` file is listed, deps copied from sibling
packages) plus `go vet` and `go test ./...` under the shared lock. `pg_stat_statements`
is not preloaded on this Postgres and cannot be enabled without a restart of the shared
instance, so statement counts come from counting tests, `EXPLAIN (ANALYZE, BUFFERS)`
and the database's own `pg_stat_database` / `pg_stat_user_tables` counters. Latency
figures are `go test -bench` on a shared 4-core box (noisy; allocations and counts are
exact). The supervisor ran with no Discord/DeepSeek tokens, so the bot-worker and
discord-bot idle there; their per-tick counts come from tests and static analysis.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Evidence | Commit | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | status: cache rendered GET responses (post-gzip) for 2 s; valid only within one probe cycle and one store version; admin and `/health` never cached; 64-key cap; single-flight | `status` `GET /` (gzip) | allocs/op, bytes/op | 34,936 allocs, 8.6 MB | 14 allocs, 91 KB | exact (allocs) + latency (9.25 ms -> 0.038 ms) | `2e63693d3` | `internal/status/cache_test.go` (identical hit, probe-cycle and store-write invalidation, gzip/identity keys, bounded keys, expiry, admin/health skipped) |
| 2 | same cache | `status` `GET /api/dashboard` | allocs/op | 951 (7.76 ms, 928 KB body) | 12 (0.30 ms) | exact + latency | `2e63693d3` | same |
| 3 | same cache | `status` `GET /metrics` | allocs/op | 6,202 (2.89 ms) | 10 (0.006 ms) | exact + latency | `2e63693d3` | same |
| 4 | bot-worker: compile the three persona regexes once instead of per bot per tick | postTick, `shouldPost` over a 1000-bot pool | allocs/tick, bytes/tick | 57,918 allocs, 8.9 MB (9.5 ms) | 1,000 allocs, 97 KB (3.2 ms) | exact + latency | `ca98cd021` | existing `worker_test` habit/shouldPost tests; `bench_test.go` |
| 5 | bot-worker: the DM conversation's last sender comes back on the conversations query (`LEFT JOIN LATERAL`, same `ORDER BY createdAt DESC LIMIT 1`) instead of one `LastMessageSender` per conversation | bot-worker DM tick (every minute) | statements per tick with 60 candidate conversations | 61 | 1 | exact (counting test); `EXPLAIN` warm: 0.56 ms + 59 x ~0.15 ms -> 0.8-1.1 ms | `b66ab3049` | `dm_queries_test.go` |
| 6 | doctrine: cache the distinct-timezone list for 10 min (staleness written in the commit and the code comment) | doctrine Sahur loop (every minute) | scans of `"user"` per hour; supervisor run, 200 s | 60/h; 3 scans, 60,000 tuples read per 200 s | 6/h; 1 scan per 200 s | exact (counting test + `pg_stat_user_tables`) | `767990f41` | `timezones_test.go` |
| 7 | status prober: drain response bodies (<= 1 MiB, <= 250 ms) so keep-alive connections are reused, except the public-origin targets (Website, readiness, feed, sitemap: `FreshConn`), which use a `DisableKeepAlives` transport so DNS, TCP and TLS (and the certificate seen) are exercised every cycle | status prober, every 15 s x 8 targets | TCP connections for 6 consecutive probes of one target | 6 | 1 | exact (counting dialer test) | `257f06c8e` | `reuse_test.go` (4 body shapes; `TestProbeOnceFreshConnTargetsDoNotReuse`: 4 cycles = 4 connections for a `FreshConn` target, 1 for a normal one) |
| 8 | streak-saver: one `INSERT ... SELECT FROM unnest` for the sweep, per-user fallback if the batch is rejected | hourly sweep | statements per sweep with 500 candidates | 500 | 1 | exact (counting test); SQL verified against the real enum/table | `a0983c946` | `internal/streaksaver/run_test.go` |
| 9 | doctrine decay in two statements inside one transaction (update + ledger via `unnest`; delta computed in SQL). The UPDATE is conditional on the total still equalling the value read (`RETURNING` the rows changed; ledger rows only for those), so a concurrent XP award is not overwritten | hourly on Mondays | statements per pass, N inactive players | 2N, no transaction | 2, atomic | exact; SQL verified against the real tables (rolled back) | `1d3919049` | `decay_test.go` (includes a concurrent award between read and write: the row is skipped, keeps its XP, gets no ledger row) |
| 10 | assets: relay `If-None-Match` / `If-Modified-Since` to S3 and answer 304 carrying the bucket's own `ETag` / `Last-Modified` (never the request's `If-None-Match`; omitted if the bucket sent none); set `Content-Length` | `assets` revalidation, HEAD | body bytes on a revalidation of an unchanged object | full object (7 B in the test, MBs in practice), chunked | 0 B, 304 | exact (headers/bytes, fake S3 endpoint) | `5071b617d` | `internal/assets/handler_test.go` (incl. `If-None-Match: *` and a list), `pkg/objectstore/conditional_test.go` |

Whole-supervisor idle run (no tokens, 200 s, `rmh_ws7`): 21 -> 18 autocommit statements
per minute. The dominant steady-state cost here is the vibe-worker poll (see Handoffs).

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---:|---:|---|
| 1 | Cache `pkg/auth.ValidateSession` | none | queries per call | 1 | n/a | No binary in the fleet calls it (`grep` finds only the definition); a cache would be dead code and a new staleness surface for sessions. Reconsider if a Go service ever terminates user traffic. |
| 2 | Share the minute-poll settings read with the post/reply ticks in the bot-worker | bot-worker | statements/min | ~1.4 | ~1.0 | 0.4 statements per minute of a primary-key read; not worth a second staleness rule. |
| 3 | Pre-render the status page on a timer instead of caching on demand | `status` | n/a | n/a | n/a | The page depends on the wall clock (uptime, windows); on-demand with a 2 s TTL and probe-cycle invalidation gets the same cost with no timer and no staleness beyond 2 s. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | Probe interval for the heavy public targets (`/`, `/sitemap.xml`, `/blog/rss.xml` = 3 SSR renders every 15 s, ~17k a day on the web tier) | Lengthening it changes what the dashboard shows and the uptime weighting; a perf knob must default to today's behaviour | A product decision; a per-target interval env would be cheap to add |
| 2 | `saveHistoryLocked` writes ~100 KB of JSON every 15 s under the prober write lock (0.58 ms, ~590 MB/day of disk writes) | Changing the cadence changes crash-recovery granularity | Decision on acceptable loss window |
| 3 | RESOLVED in `99980abec`: the supervisor's pool is `GO_DB_POOL_SIZE` (default 3, max 6), no longer `MaxConns = 1`. `scripts/db-connection-budget.mjs` now counts that pool explicitly (3 + status probe 2 + 2 slack; it also reads `GO_DB_POOL_SIZE`), so the fleet peak at defaults is 165 (was 163 with the supervisor at 1) | Raising it adds connections on the live server | Not measured here; check headroom against `max_connections` at deploy |
| 4 | Doctrine decay runs every hour of every Monday (24 times), each pass decaying 5 % again for players still inactive (about 71 % cumulative loss in a day: 1 - 0.95^24) | Faithful to the Node worker; fixing it changes game balance | Product decision (probably "once per Monday") |
| 5 | discord-bot watch flush (every minute: ~12 selects + upserts per tracked user) and pet care tick | Needs a live Discord session to exercise; statements are bounded per user | A staging run with a token |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS4 | `prisma/schema.prisma` model `VibePage` | `CREATE INDEX CONCURRENTLY vibe_page_stale_updated_idx ON vibe_page ("updatedAt") WHERE "thumbnailStale" = true` for the vibe-worker poll (`SELECT ... WHERE "thumbnailStale" = true ORDER BY "updatedAt" LIMIT n` every 10 s = 8,640 a day) | 20,000-page synthetic table: Seq Scan, 1,819 buffers, 3.32 ms -> Index Scan, 1 buffer, 0.021 ms |
| WS4 | `RMHarkComment` | `CREATE INDEX CONCURRENTLY rmheet_comment_created_live_idx ON rmheet_comment ("createdAt" DESC) WHERE "deletedAt" IS NULL` for bot-worker `recentCommentsQuery` (every 5 min) | seeded 150k comments: Parallel Seq Scan, 2,582 buffers, 27.8 ms (or 975-buffer index scan via the wrong index) -> bitmap scan, 3 buffers, 0.07 ms |
| WS4 | `Conversation` | `CREATE INDEX CONCURRENTLY conversation_lastMessageAt_idx ON conversation ("lastMessageAt" DESC)` for bot-worker `recentBotConversationsQuery` (every minute) | seeded 5k conversations: Seq Scan, 49 buffers, 2.3 ms -> 4 buffers, 0.08 ms |
| coordinator | `go-services/pkg/db/db.go`, `pkg/worker/standalone.go` | Done: the pool honours `DBPoolSize` (Deferred 3) | `99980abec` |
| coordinator | `docker-compose.yml` (status service) | `STATUS_RESPONSE_CACHE_TTL` (default `2s`, `0s` disables) is new and needs no change; the web tier absorbs 3 public SSR probes per 15 s (Deferred 1) | `go-services/cmd/status/main.go` target list |

## Budget status (owned routes, after)
| Route | Auth | TTFB p50/p95 | Queries | Bytes | In budget? |
|---|---|---|---|---|---|
| status `GET /` | none | cache hit 0.04 ms (bench, handler only); miss 9-20 ms | 0 | 87 KB gzip / 503 KB raw | yes (not a user path, `02-budgets.md` §2 api) |
| status `GET /api/status` | none | 0.03 ms handler | 0 | 2.2 KB | yes |
| assets `GET /library/...` | none | not measurable here (needs the bucket) | 0 | object | n/a |

## Rule objections
None.

## Commands
```
export GOTOOLCHAIN=go1.26.8
flock /tmp/rmh-perf-build.lock go test ./... ; go vet ./...        # in go-services/
flock /tmp/rmh-perf-build.lock go test ./internal/status -run '^$' -bench 'Endpoint|Cached|Save' -benchmem
flock /tmp/rmh-perf-build.lock go test ./internal/botworker -run '^$' -bench . -benchmem
RMH_PERF_DSN=postgresql://postgres:password@localhost:5432/rmh_ws7 go test ./internal/streaksaver ./internal/doctrine
psql rmh_ws7 -f explain1.sql / explain2.sql / explain3.sql / vibe.sql   # EXPLAIN (ANALYZE, BUFFERS)
measure.sh <supervisor binary> <label> 200                              # pg_stat_database / pg_stat_user_tables
```
Bazel (`/opt/bazel/bazel --batch build //go-services/internal/botworker:botworker` under the lock) failed on external
fetches: `Error downloading [https://github.com/bats-core/bats-core/archive/v1.10.0.tar.gz] ... 403 Forbidden`.
