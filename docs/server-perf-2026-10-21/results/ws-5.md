# WS5 — Realtime hubs and workers — results

> Point-in-time ledger as of `c4c8d6091` (#925). Figures are from the seeded perf dataset or in-process runs, not production; SHAs and branch names refer to that program's worktrees.

Worktree baseline taken 2026-10-21, base commit e97b5192 (plus merge of 796295bd, no `server/` changes).
Environment deviations: hubs run from source under `node --import tsx` (not the esbuild bundle), NODE_ENV=production,
Redis db 5, DB `rmh_ws5` (own migrated DB; WS0 template not used, hub load needs only `user`/`session`/`user_profile`).
Commits could not be wrapped in `flock` (the agent sandbox refuses `flock … git`); the commit hook ran unlocked.
Hubs were started outside the lock, only the bench ran inside it. Container restarted mid-session; the cold-casino
numbers below were taken before it, the tube DB numbers (before) before it and (after) after it — DB counts are exact.

## Shipped
| # | Change | Route(s) | Metric | Before | After | Commit | Evidence | Correctness test |
|---|---|---|---|---:|---:|---|---|---|
| 1 | `socket-bench.mjs` + env-gated `server/shared/perf-probe.ts` (`RMH_PERF_HUB=1`). After the main merge the probe was deleted and the bench reads main's `/internal/metrics` instead | all hubs | instrument | — | — | first commit | n/a | — (the probe and its test were removed) |
| 2 | Warm Prisma at socket-server boot | socket hub, first casino action | event-loop max, cold, 3 seats | 444 / 284 ms | 13.9 / 18.9 ms | `perf(socket-server): warm Prisma…` | latency | `prisma-warm.test.ts` |
| 3 | RMHFarming broadcasts via `io.to(ids)` (presence, tiles, members, chat, FARM_STATE) | farming sim | server CPU per fan-out, 6 recipients | presence 19.5/15.4 µs; FARM_STATE 575/504 µs | 7.4/5.0 µs; 122/134 µs | `perf(farming-sim)…` | latency (microbench of real socket.io path) | recipient set unchanged (presence socket ids) |
| 4 | RMHTube chat persistence batched (1 s / 200 rows `createMany`) | rmhtube hub | DB commits/s, 20 rooms × 12, chat/2 s | 38.7 / 39.7 | 15.2 | `perf(rmhtube): batch chat…` | exact | `batch-writer.test.ts` (one call per interval, order, early flush, failure, no concurrency) |

Trade in #4: up to 1 s of chat lost on a hard crash (graceful shutdown flushes); a rejected batch retries row by row.

## Baseline hub health (scripted mix: tube 10×12, music 10×12, rmhbox 6×8, casino 3×5; 20 s)
Event-loop delay (above 10 ms sampling resolution) p99 0.9–3.8 ms; broadcast p95 0.9–2.4 ms (chat, send→receive at every
recipient); hub CPU 3–8 % of one core. Budgets (ELD p99 ≤ 20 ms, broadcast p95 ≤ 50 ms) hold with large margin; at 300
clients on the tube hub CPU was ~11 %. The bench process, not the hubs, is the bottleneck on this box.
Reconnection storm, 300 clients: warm hub, ELD max 15–35 ms; cold (empty auth cache) 40–78 ms.

## Rejected (measured, no win)
| # | Idea | Route(s) | Metric | Before | After | Why it didn't help |
|---|---|---|---|---|---|---|
| 1 | Hoist `serializeSave` in farming `persistFarm` (called "twice") | farming save | — | — | — | It returns a shallow object over `farm.tiles`; the JSON cost is inside Prisma per argument either way. Not committed. |
| 2 | Cache handshake session lookups | all hubs | — | — | — | Already done: bounded 60 s positive caches in socket-server/rmhtube/rmhbox auth. Storm second run (cached) 213 ms vs 413 ms p50 confirms. |
| 3 | Batch casino bet/settle writes | blackjack/holdem/baccarat/roulette | — | — | — | Money path: debits are guarded atomic UPDATEs and must not be deferred (rule 1.3). Settlement is already one transaction per round. |
| 4 | Single emit for casino/tube/music/rmhbox room broadcasts | those hubs | — | — | — | Already `io.to(room).emit` (one encode). Only farming used per-socket loops. |

## Deferred
| # | Lead | Why | What would unblock it |
|---|---|---|---|
| 1 | rmhbox heartbeat (10 s): build shared parts of `ClientLobbyState` (players, chat, matchHistory) once per lobby instead of per recipient | rmhbox ELD p99 ≈ 3 ms at 6 lobbies × 8; not on the budget edge | a load where rmhbox ELD p99 > 10 ms (≥ ~50 full lobbies) |
| 2 | Warm Prisma in rmhbox | rmhbox first-use stall not observed above 35 ms max | measurement showing a stall |
| 3 | Workers (`jobs`, `ladder-worker`, `homes-worker`) DB-pool pressure | not profiled this pass (time); pools default to 5 (`SERVER_DB_POOL_SIZE`) | a run of each worker against the seeded DB with `pg_stat_activity` sampling |
| 4 | Per-event socket-server Prisma elsewhere (`spaces` chat when `recordChat`, per-run leaderboard writes) | low rate / completion-time; spaces chat could reuse `createBatchWriter` | evidence of recordChat spaces with high chat rate |

## Handoffs
| To | file:line | What | Evidence |
|---|---|---|---|
| WS0 | — | `scripts/perf/socket-bench.mjs` is the WS5 instrument; no change to WS0 files | — |

## Budget status (owned hubs, scripted load, after)
| Hub | ELD p99 / max | Broadcast p95 | In budget? |
|---|---|---|---|
| tube (20×12, chat/2 s) | 2.3 / 24 ms (one run; before 1.0 / 3.5–5.9) | 1.3 ms | yes (p99); the max spike appeared once after, not reproduced as p99 — unconfirmed noise on the shared box |
| socket (music+casino) | ≤ 3.8 / 147 ms in the 300-client run (pre-fix) | 2.4 ms | yes at p99; boot-warm removes the cold max |
| rmhbox | 3.1 / 36 ms | 2.1 ms | yes |

Caveat: the second "after" tube run was still queued behind the shared lock at write time; the tube ELD max after
(24 ms) vs before (3.5–5.9 ms) is a single sample and not explained; commit #4 is justified on the exact DB metric only.

## Rule objections
None.

## Commands
```bash
export PATH=/opt/node24/bin:$PATH
node scripts/perf/socket-bench.mjs --seed 1000                      # users + sessions in rmh_ws5
# hubs started outside the lock (SOCKET_PORT=7151 RMHBOX_PORT=7152 RMHTUBE_PORT=7153 RMH_PERF_HUB=1 NODE_ENV=production,
# node --import tsx server/<hub>/index.ts, SOCKET_CORS_ORIGIN set, DATABASE_URL=…/rmh_ws5, REDIS_URL=…/5)
flock /tmp/rmh-perf-build.lock node scripts/perf/socket-bench.mjs --duration 20            # full mix
flock /tmp/rmh-perf-build.lock node scripts/perf/socket-bench.mjs --hubs storm --storm 300
flock /tmp/rmh-perf-build.lock node scripts/perf/socket-bench.mjs --hubs casino --tables 1 --seats 3 --duration 25 --warmup 0   # fresh hub each run
flock /tmp/rmh-perf-build.lock node scripts/perf/socket-bench.mjs --hubs tube --rooms 20 --members 12 --duration 20 --chat-every 2000
node scripts/perf/socket-bench.mjs --micro-emit --payload presence|farm --recipients 6   # A B A B
node scripts/perf/socket-bench.mjs --compare before.json after.json
```
