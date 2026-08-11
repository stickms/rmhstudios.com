# Loading & Runtime Audit — 2026-08-11

Triggered by: **"full website loading runtime audit — everything loads quickly,
fast, using low amounts of data bandwidth; revamp the database layout or how API
calls are handled if needed."**

This folder is the report. It is written to be read by an agent picking up the
work, so every claim carries the command that produced it and every
recommendation carries the file it lands in.

## How to use this folder (read this first if you are an LLM)

1. **Read this page, then [`06-backlog.md`](06-backlog.md).** Those two are
   enough to pick the next task. The numbered files are evidence for the backlog
   entries, not prerequisites for acting on them.
2. **Numbers in this folder came from a real build and a real browser**, not
   from reading source. Where a claim is inferred rather than measured, it says
   so. Where a previous audit's claim turned out to be wrong, it says that too —
   see "Corrections to earlier audits" below, because two of them would have
   sent you down the wrong path.
3. **Prefer build-level numbers over browser-level numbers** when they
   disagree. A chunk graph is deterministic; an FCP measured in a shared
   container is not. Section [`01-measurements.md`](01-measurements.md) marks
   which is which and records the observed variance.
4. **The commit that carries this folder also carries fixes.** "Fixed here"
   means the change is in this commit and verified; "Open" means diagnosed and
   left. Do not re-diagnose the fixed ones.
5. This is a dated audit, so it ages. Trust order for conflicts is the repo's:
   code > `docker-compose.yml`/`deploy.sh` > `CLAUDE.md` > reference docs > this
   file.

## Where the time and bytes actually go

The short version, for `/` on a cold anonymous load:

| Layer                | Cost                                | Verdict                                      |
| -------------------- | ----------------------------------- | -------------------------------------------- |
| Origin HTML          | 26–80 ms warm TTFB                  | **Not the problem.** Fast, and now cacheable. |
| Database             | Well-indexed, batched, SWR-cached   | **Not the problem.** See [`04-database.md`](04-database.md). |
| JavaScript           | ~380 requests, ~0.9–1.1 MB encoded  | **This is the problem.**                     |
| CSS                  | 465 KB raw / 48 KB brotli, one sheet | Secondary, real.                            |
| Images               | 6 KB on `/`, 296 KB on `/games`     | Largely already fixed; AVIF is what's left.  |
| API responses        | 269 GET handlers, 10 cacheable      | **The repeat-visit bandwidth problem.**      |

The request *count* is the headline, not the byte total. 380 requests to render
a homepage is a number that no byte budget rescues: on a phone on 4G, per-request
overhead dominates long before the payload does.

**The database does not need a revamp, and neither does the API handler
layer.** Both are well-built. What the API layer needs is *adoption* of the
caching it already implements: the machinery exists, is safety-checked at module
load, and is used by 3.7% of GET routes. That is the single highest-leverage
change left in this report, and it is [`03-api-caching.md`](03-api-caching.md).

## Fixed in this commit

Each is verified — see the linked section for the before/after.

| #  | Fix                                                                                 | Measured effect                                                                 | Detail |
| -- | ----------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | ------ |
| 1  | **Killed the 431 KB lucide icon chunk at its root cause** — 4 files did `Icons[name]` on a namespace import | `icons-*` (431.3 KB raw / 116.1 KB gzip) and the 157 KB barrel chunk **no longer exist in the build**. `/` requests 533 → 382. | [`02-critical-path.md`](02-critical-path.md) §1 |
| 2  | **zod off the shared critical path** — catalog validation moved to the test that already did it | Removes 34 browser-side `.parse()` calls per cold load; `Providers` 41.7 → 32.8 KB | [`02-critical-path.md`](02-critical-path.md) §2 |
| 3  | **socket.io-client no longer on every page** — `CallMount` now dynamic-imports its store | `esm-*` (40.3 KB raw) left the critical path                                    | [`02-critical-path.md`](02-critical-path.md) §3 |
| 4  | **9 routes no longer block first paint on `fonts.googleapis.com`**                   | Render-blocking third-party font references: 9 → 0                              | [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §3 |
| 5  | **`Server-Timing` actually reaches the client** — `otel.ts` still had the H3 `event.res` bug fixed elsewhere on 08-09 | Header absent → `trace;desc="…", total;dur=22.4`                                 | [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §2 |
| 6  | **A missing `STRIPE_SECRET_KEY` no longer 500s the first request to every page**     | Reproduced, then fixed; 2 sibling AI clients had the same defect                 | [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §1 |
| 7  | **4 game leaderboards now carry the cache policy their siblings already had**        | Consistency fix; the pattern for the remaining 249                              | [`03-api-caching.md`](03-api-caching.md) §3 |

Aggregate, build-level and deterministic:

| Metric                          | 2026-08-04 | 2026-08-09 | before (this audit) | **after** |
| ------------------------------- | ---------: | ---------: | ------------------: | --------: |
| Entry chunk                     |   253.6 KB |   273.9 KB |            277.2 KB | **276.0 KB** |
| Critical path, raw              |  1028.5 KB |  1219.2 KB |           1323.3 KB | **1260.0 KB** |
| Critical path, brotli           |   297.6 KB |   313.8 KB |            380.2 KB | **361.0 KB** |
| Critical-path chunks            |         94 |        116 |                 131 | **111**   |
| Monolithic icon chunk           |     433 KB |     433 KB |            431.3 KB | **gone**  |
| Requests to render `/`          |          — |        248 |                 533 | **382**   |
| Main-thread long tasks on `/`   |          — |     337 ms |              813 ms | **~570 ms** |

The 08-04/08-09 columns are from those audits' own harnesses on different
hardware; compare them for *direction*, and compare the last two columns for
*effect*, since those two are the same harness on the same machine minutes apart.

## Corrections to earlier audits

Two claims in [`../performance-audit-2026-08-09.md`](../performance-audit-2026-08-09.md)
would have sent this work the wrong way. Recording them so the next agent does
not re-derive them:

1. **The icon chunk's cause was not "552 files each importing a few icons".**
   That audit recommended a per-icon-deep-import codemod across ~588 files
   (OPT-10). The actual cause was **four files** doing a computed lookup on a
   namespace import (`import * as Icons` → `Icons[name]`, and
   `import { icons }` → `icons[name]`), which is unshakeable: the bundler cannot
   prove which members are reachable, so it retains all ~1,400 exports. Fixing
   those four files removed the chunk entirely. The 588-file codemod was not
   needed and should not be done.
2. **`/games` does not download 2.07 MB of card art any more.** It downloads
   296 KB. The responsive-variant pipeline (`scripts/gen-image-variants.ts` +
   `components/ui/OptimizedImage.tsx`) is implemented and working; commit
   `f8df30ee` ("image loading games/apps") landed after that audit. AVIF is the
   remaining image win, not responsive variants.

One thing that audit was right about and that this one confirms: the anon-HTML
cache fix works. `cache-control: public, max-age=0, s-maxage=30,
stale-while-revalidate=120` is present on anonymous `/`. It is still inert at the
edge until the Cloudflare rule is applied — see
[`05-server-edge-fonts.md`](05-server-edge-fonts.md) §4.

## Contents

| File                                             | What is in it                                                                       |
| ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| [`01-measurements.md`](01-measurements.md)       | The harness, the raw numbers, per-route tables, and the measurement caveats          |
| [`02-critical-path.md`](02-critical-path.md)     | JavaScript: the icon chunk root cause, zod, socket.io, fragmentation, what's left    |
| [`03-api-caching.md`](03-api-caching.md)         | The API layer: 269 GET handlers, 10 cacheable — the adoption gap and how to close it |
| [`04-database.md`](04-database.md)               | Why the schema does **not** need a revamp, with the index/N+1/over-fetch evidence    |
| [`05-server-edge-fonts.md`](05-server-edge-fonts.md) | Cold start, the `event.res` header bug, fonts, and the edge                      |
| [`06-backlog.md`](06-backlog.md)                 | Everything still open, ranked by measured benefit per unit of risk                   |
