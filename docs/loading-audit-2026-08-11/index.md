# Loading & Runtime Audit — 2026-08-11

Triggered by: **"full website loading runtime audit — everything loads quickly,
fast, using low amounts of data bandwidth; revamp the database layout or how API
calls are handled if needed."** Then: **"ensure everything is fixed."**

This folder is the report. It is written to be read by an agent picking up the
work, so every claim carries the command that produced it and every
recommendation carries the file it lands in.

## How to use this folder (read this first if you are an LLM)

1. **Read this page, then [`06-backlog.md`](06-backlog.md).** Those two are
   enough to pick the next task. The numbered files are evidence, not
   prerequisites.
2. **Numbers here came from a real build and a real browser**, not from reading
   source. Where a claim is inferred, it says so.
3. **Prefer build-level numbers over browser-level numbers** when they disagree.
   A chunk graph is deterministic; an FCP in a shared container is not.
   [`01-measurements.md`](01-measurements.md) marks which is which.
4. **Read "Corrections" below before acting on any earlier audit — or on the
   first draft of this one.** Five separate claims turned out to be wrong under
   measurement, including two of mine. Every one of them would have sent you to
   the wrong file.
5. **"Fixed" means in this branch and verified.** Don't re-diagnose those.

## Where the time and bytes actually go

For `/` on a cold anonymous load:

| Layer         | Cost                                | Verdict                                                     |
| ------------- | ----------------------------------- | ----------------------------------------------------------- |
| Origin HTML   | 26–80 ms warm TTFB                  | **Not the problem.** Fast, and now cacheable.               |
| Database      | Well-indexed, batched, SWR-cached   | **Not the problem.** [`04-database.md`](04-database.md)      |
| JavaScript    | ~380 requests, ~1.1 MB encoded      | **This is the problem.**                                    |
| CSS           | 465 KB raw / 48 KB brotli, one sheet | Secondary, real, untouched.                                |
| Images        | ~0 raster bytes on `/` and `/games`  | **Not the problem** — and not what earlier audits thought.  |
| API responses | 269 GET handlers; caching now on the ones that can take it | Improved; the rest is per-route judgement. |

**The request count is the headline, not the byte total.** 380 requests to
render a homepage is a number no byte budget rescues: on a phone on 4G,
per-request overhead dominates long before the payload does. And the one lever
three audits assumed would fix it (`codeSplitting.minSize`) was measured this
pass and **makes it worse** — see [`06-backlog.md`](06-backlog.md) §5.

**Neither the database nor the API handler layer needed the revamp the brief
authorised.** Both are well-built. What the API layer needed was *adoption* of
the caching it already implements, and that is now done for every endpoint that
can safely take it.

## Fixed in this branch

Client-side bytes and requests:

| Fix                                                                                      | Measured effect                                                                  | Detail |
| ---------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------ |
| **The 431 KB lucide icon chunk, at its root cause** — 4 files did `Icons[name]` on a namespace import | `icons-*` (431.3 KB raw / 116.1 KB gzip) **and** the 157 KB barrel **no longer exist in the build**. Requests on `/` 533 → 382. | [`02`](02-critical-path.md) §1 |
| **framer-motion's layout projection off the critical path** — 9 modules imported the full `motion` instead of `LazyMotion`'s `m` | `layout-*` (**68.2 KB raw**) left the entry graph. `VisualElement-*` (26.4 KB) remains, via legitimate `Reorder`/`LayoutGroup`/`useScroll` uses | [`02`](02-critical-path.md) §4 |
| **socket.io-client off every page** — `CallMount` guarded the call but not the import      | `esm-*` (40.3 KB) left the critical path                                         | [`02`](02-critical-path.md) §3 |
| **zod out of 9 route modules** (catalog + 7 rmhladder + 2 hand-rolled parsers)             | Removed from those route chunks. **Still on the critical path** via 246 other paths — see Corrections. | [`02`](02-critical-path.md) §2 |
| **An eslint rule so the icon chunk cannot come back**                                     | `local/no-lucide-namespace-import`, at **error**, zero violations                 | [`02`](02-critical-path.md) §1 |

Bandwidth and caching:

| Fix                                                                            | Measured effect                                                          | Detail |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ | ------ |
| **Cache policies on all 13 GET endpoints that could safely take one**           | `cache-control` + `ETag` + a verified **304**; 10 → 23 declaring a policy | [`03`](03-api-caching.md) §3 |
| **AVIF in the image pipeline** + `<picture>` in `OptimizedImage`                | 2.93 MB AVIF vs 4.38 MB WebP for the same art — **33% smaller**          | [`05`](05-server-edge-fonts.md) §6 |
| **A 928 KB PNG served at full size into a Discord PIP tile**                    | Now goes through the variant pipeline that already had 320/640/960 for it | [`05`](05-server-edge-fonts.md) §6 |

Server and correctness:

| Fix                                                                          | Measured effect                                            | Detail |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------- | ------ |
| **9 routes no longer block first paint on `fonts.googleapis.com`**            | Render-blocking third-party font references: 9 → **0**     | [`05`](05-server-edge-fonts.md) §3 |
| **`Server-Timing` actually reaches the client** — the H3 `event.res` bug fixed on 08-09 was still in `otel.ts` | Header absent → `trace;desc="…", total;dur=22.4` | [`05`](05-server-edge-fonts.md) §2 |
| **A missing `STRIPE_SECRET_KEY` no longer 500s the first request to every page** | Reproduced, then fixed; 2 sibling AI clients had it too   | [`05`](05-server-edge-fonts.md) §1 |

Tests, because four of the above were untested machinery:

| New test file                                        | What it pins                                                  | Tests |
| ---------------------------------------------------- | ------------------------------------------------------------- | ----: |
| `lib/__tests__/api-handler.test.ts` (extended)        | `cache`/`etag`: the module-load public+auth refusal, headers, 304s, weak comparison, stream/encoded refusal | 16 |
| `lib/__tests__/nitro-response-headers.test.ts`        | Every `response`-hook plugin resolves headers via `responseHeaders` — the gate that would have caught `otel.ts` | 10 |
| `lib/__tests__/optimized-image-picture.test.tsx`      | `<picture>`/AVIF source order, matching widths, bare-`<img>` fallback | 6 |
| `lib/__tests__/image-variants.test.ts`                | Manifest integrity; every width exists in both formats        | 7 |

Suite: **274 files / 6,778 tests green** (was 271 / 6,739).

Aggregate, build-level and deterministic:

| Metric                          | 2026-08-04 | 2026-08-09 | before | **after** | change |
| ------------------------------- | ---------: | ---------: | -----: | --------: | ------ |
| Entry chunk                     |   253.6 KB |   273.9 KB | 277.2 KB | **276.0 KB** | −0.4% |
| Critical path, raw              |  1028.5 KB |  1219.2 KB | 1323.3 KB | **1182.1 KB** | **−10.7%** |
| Critical path, brotli           |   297.6 KB |   313.8 KB | 380.2 KB | **338.1 KB** | **−11.1%** |
| Critical-path chunks            |         94 |        116 |    131 | **108**   | **−23** |
| Monolithic icon chunk           |     433 KB |     433 KB | 431.3 KB | **gone**  | — |
| Requests to render `/`          |          — |        248 |    533 | **382**   | **−28%** |
| Long tasks on `/`               |          — |     337 ms | 813 ms | **~570 ms** | **−30%** |

Compare the 08-04/08-09 columns for *direction* only (different harnesses, different
hardware); the last two columns are the same harness on the same machine.

## Corrections

Five claims that were wrong under measurement. **Two are from the first draft of
this very audit** — recorded so the next agent trusts the measurement, not the prose.

**From [`../performance-audit-2026-08-09.md`](../performance-audit-2026-08-09.md):**

1. **The icon chunk was not "552 files each importing a few icons".** It was
   **four** files doing a computed lookup on a namespace import, which is
   unshakeable. That audit recommended a per-icon codemod across ~588 files
   (OPT-10); it was unnecessary. **Do not do it.** A 4-file fix plus a lint rule
   deleted the chunk from the build.
2. **`/games` does not download 2.07 MB of card art.** It downloads **no raster
   art at all** — the cards are a CSS gradient plus a lucide icon, and the SSR
   HTML for `/games` contains zero `<img>` tags.

**From the first pass of this audit (now fixed in this folder):**

3. **"`/games` downloads 296 KB of images" was my own harness miscounting.**
   Those were inline `data:image/png;base64,…` URIs, which match an image
   extension regex but are not network transfers. Real answer is #2 above.
4. **"26 page routes import zod for `validateSearch`" was wrong twice over.**
   Nine route modules imported zod, and all but one used it for
   *`createServerFn` validators*, not `validateSearch`. Fixing all nine did
   **not** remove zod from the critical path, because **246** client-reachable
   modules import it — it is woven through the shared schema layer
   (`lib/feed/signals.ts`, `lib/rmhark-schema.ts`, `lib/emoji/packs.ts`, …), not
   concentrated in routes. See [`06-backlog.md`](06-backlog.md) §1.
5. **"Wave 2: add `etag: true` to the 100 authenticated GETs" would have bought
   almost nothing.** A browser only sends `If-None-Match` for a response it
   stored, and it will not store a response with no `Cache-Control`. An ETag
   without a freshness policy is inert for browser clients; it pays off for API
   clients that persist etags themselves. Corrected guidance in
   [`03-api-caching.md`](03-api-caching.md) §4.

One thing 08-09 got right and this pass confirms: the anon-HTML cache fix works.
`cache-control: public, max-age=0, s-maxage=30, stale-while-revalidate=120` is
present on anonymous `/`. It remains **inert at the edge** until the Cloudflare
rule is applied — the one item in this report that cannot be fixed from the
repository. See [`05`](05-server-edge-fonts.md) §4.

## Not done, and why

Three items are deliberately left. Each is a real cost, not an oversight:

| Item | Why not |
| ---- | ------- |
| **Apply the Cloudflare cache rules** | Requires `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ZONE_ID` and writes to production DNS/CDN config. Not available to this session and not a code change. **This is the single cheapest large win left** — see [`06`](06-backlog.md) §2. |
| **Split `globals.css`** (465 KB, 65–67% used) | The win is parse/style-recalc time on low-end devices, and verifying it needs three themes × two widths × ~30 full-screen apps looked at by eye. Doing it blind risks a visual regression across the whole product to save 48 KB brotli. [`06`](06-backlog.md) §6 |
| **The 3D games' 4.8–6.0 s of long tasks** | The highest ceiling in the product and the only item that is genuine investigation rather than a known fix — three.js shader compilation, scene construction, geometry upload, profiled per title. [`06`](06-backlog.md) §7 |

## Contents

| File                                                 | What is in it                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- |
| [`01-measurements.md`](01-measurements.md)           | The harness, raw numbers, per-route tables, and the measurement traps             |
| [`02-critical-path.md`](02-critical-path.md)         | JavaScript: the icon chunk, framer-motion, socket.io, zod, fragmentation           |
| [`03-api-caching.md`](03-api-caching.md)             | The API layer: the safety triage, what was cached, and what must stay uncached     |
| [`04-database.md`](04-database.md)                   | Why the schema does **not** need a revamp, with the evidence                       |
| [`05-server-edge-fonts.md`](05-server-edge-fonts.md) | Cold start, the `event.res` bug, fonts, the edge, CSS and images                   |
| [`06-backlog.md`](06-backlog.md)                     | What is still open, ranked, with the measurements that killed three former entries |
