# Performance metrics and profiling

**Where:** `/admin/performance` (admin only). **Code:** `lib/perf/`,
`server/nitro/perf.ts`, `app/routes/api/admin/perf/`, `components/admin/perf/`.

Every Node process (each web cluster worker, the three hubs, the jobs worker)
keeps a small in-memory collector. Nothing is exported to an external system;
the admin page reads the collectors directly.

## How the data gets to the page

| Process | Transport |
| --- | --- |
| web workers, jobs | publish a snapshot to Redis every 10 s (`perf:proc:<service>:<host>:<pid>`, 30 s TTL); the endpoint scans `perf:proc:*` |
| socket, rmhbox, rmhtube | `GET /internal/metrics` on the hub's own port, fetched by the web tier over the compose network (1.5 s timeout) |
| the worker answering the request | always its live snapshot, so the page works with Redis off |

`/internal/*` is not proxied by Apache. Set `INTERNAL_METRICS_TOKEN` to also
require an `x-internal-token` header. The web tier finds the hubs through
`SOCKET_INTERNAL_URL`, `RMHBOX_INTERNAL_URL`, `RMHTUBE_INTERNAL_URL`.

Counts are since each process started; latency percentiles come from log-scale
histograms and are recomputed from summed buckets across workers (never
averaged). The timeseries is 60 one-minute buckets. Route labels are
normalised (ids and handles become `:id`, at most 4 segments, static assets are
`static:<ext>`), capped at 300 labels, then `other`.

## What each metric means, and when to worry

| Metric | Meaning | Amber / red |
| --- | --- | --- |
| Latency p95 | 95th percentile request time, last 5 minutes | > 1 s / > 2.5 s |
| 5xx rate | share of responses with status 5xx | > 1 % / > 5 % |
| Event-loop delay p99 | how late timers fire; the direct measure of a blocked loop | > 100 ms / > 500 ms |
| Event-loop utilization | fraction of time the loop was busy (0..1) | > 0.8 / > 0.95 |
| CPU throttled | share of CFS periods the container was throttled (cgroup) | > 10 % / > 30 % |
| Heap used | V8 heap vs `--max-old-space-size` | > 80 % / > 92 % |
| Container memory | cgroup memory vs limit; at the limit the kernel OOM-kills | > 85 % / > 95 % |
| Pool waiting | queries queued for a Prisma/pg connection | > 0 / >= 5 |
| Avg query | mean Prisma operation time (includes waiting for a connection) | > 50 ms / > 200 ms |
| Queries / req | per route; many per request is an N+1 | >= 15 flagged |

Slow queries (>= `PERF_SLOW_QUERY_MS`, default 250) are kept in a ring of 50.
The Database tab's Postgres diagnostics are fixed catalog queries with a 3 s
statement timeout, loaded only when the tab opens.

## Diagnosing

- **High p95, low event-loop delay**: waiting on something (database, upstream).
  Check pool waiting, slow queries, the route's queries per request.
- **High event-loop delay or ELU**: CPU-bound JavaScript. Take a profile.
- **Heap climbing, never dropping**: a leak; watch heap spaces and detached
  contexts on the Runtime tab. No heap snapshot is offered on purpose: writing
  one freezes the worker and can double its memory under the 384 MB cap.
- **Throttled > 10 %**: the container is CPU-starved; raise `cpus` or lower
  `WEB_WORKERS`.

## Profiling

Profiler tab: pick 5-30 s. "Capture CPU profile" downloads a `.cpuprofile`
(Chrome DevTools, Performance tab, Load profile). "Capture & summarise" shows
the top 30 functions by self time. It samples at 1 ms on **one** web worker (the
one that receives the request; its pid is shown), one profile at a time per
process (409 otherwise). Over 100 requests/s, repeat a few times: each capture
may land on a different worker.

API: `POST /api/admin/perf/profile` with `{ "seconds": 10 }` (add `?summary=1`
for JSON), `GET /api/admin/perf`, `GET /api/admin/perf/db`,
`GET /api/admin/perf/heap`.
