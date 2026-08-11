# 06 — Backlog: what is still open

Everything in the first draft of this backlog has now been either **done**,
**measured and rejected**, or **left with a stated reason**. This is the current
state, ranked by measured benefit per unit of risk.

Effort: **S** ≤ half a day · **M** a day or two · **L** longer or needs
investigation.

## Done in this branch

| Was | Outcome |
| --- | ------- |
| Split the lucide icon chunk | Root-caused to 4 files; chunk **deleted from the build**; `local/no-lucide-namespace-import` at error prevents recurrence |
| Get zod off the critical path | 9 route modules fixed. **Did not move the number** — see §1 |
| Close the API caching gap | All 13 endpoints that could safely take a policy now have one, +4 sibling leaderboards; 16 tests added — see [`03`](03-api-caching.md) |
| A test for the H3 `event.res` bug | `lib/__tests__/nitro-response-headers.test.ts`, proven to fail on the reintroduced bug |
| AVIF in the image pipeline | 33% smaller than WebP; `<picture>` in `OptimizedImage`; 13 tests |
| framer-motion's layout projection off the critical path | 9 modules switched to `LazyMotion`'s `m`; removed `layout-*` (**68.2 KB raw**). `VisualElement` (26.4 KB) remains via `Reorder`/`LayoutGroup`/`useScroll` — see §12 |
| Fix the stale schema counts in agent docs | `CLAUDE.md`, `lib/CLAUDE.md`: 252→323 models, 66→71 enums, ~6k→~8.9k lines |

## Measured and rejected — do not re-attempt without new evidence

| Idea | Measurement that killed it |
| ---- | -------------------------- |
| **`output.codeSplitting.minSize`** (three audits called it "worth measuring") | At `minSize: 20_000`: entry chunk **276 KB → 450 KB (+63%)**, critical path 111 → 116 chunks, sub-6 KB chunks 90 → 95, total files 1018 → 1023. It merges small chunks into the **entry** — the one fully-blocking chunk — and barely moves the count, because most of a page's ~380 requests are per-route chunks and their modulepreloads, not shared-graph members. Recorded in `vite.config.ts` beside `manualChunks`. |
| **Lazy-construct the ~16 module-scope AI clients** | `16 × new OpenAI({…})` = **4 ms**. The cost is `require('openai')` at 103 ms, which only a dynamic import inside an async getter defers — a large refactor of untestable-here code against a cost `warmup.ts` already hides. |
| **`etag: true` on the 100 authenticated GETs** | A browser only sends `If-None-Match` for a response it stored, and will not store one with no `Cache-Control`. Inert for browser clients; would hash 100 bodies for no transfer saving. [`03`](03-api-caching.md) §4 |
| **OPT-10 as written** (588-file per-icon codemod) | Wrong diagnosis. Four files were the cause. [`02`](02-critical-path.md) §1 |
| **Responsive image variants (OPT-24)** | Already implemented and working since `f8df30ee`. |
| **Revamp the database layout** | Warm TTFB 26–80 ms; indexes match the hot keyset patterns; the read path is already batched, denormalized and SWR-cached. [`04`](04-database.md) |
| **Revamp the API handler layer** | Well-built. It needed adoption, which is done. |
| **Removing `Vary: Accept-Language`** | Deliberate and correct. [`03`](03-api-caching.md) §6 |
| **A poller/interval audit** | Six `refetchInterval` sites, mostly 2–5 min; realtime rides SSE. |

---

## Still open

### 1 — zod on the critical path: 71 KB, 246 module paths ⭐ M–L

`schemas-*` is **71.0 KB raw / 16.6 KB brotli** on every page, and the route-level
fix did not touch it. Walking the source graph from every route/shell top level
finds **246 client-reachable modules importing zod** — the homepage reaches it in
three hops (`_site/index.tsx` → `lib/feed/timeline.ts` → `lib/feed/signals.ts`),
and 67 non-`.server` modules under `lib/` import it directly.

zod is this codebase's shared schema layer, not a route-level accident. Two honest
options, both real work:

- **`zod/mini` (OPT-06)** — addresses all 246 paths at once, but each schema needs
  rewriting to the functional API (`z.string().max(200)` →
  `z.string().check(z.maxLength(200))`), and these guard server inputs, so a
  mechanical sweep needs care and review.
- **Accept it** — 16.6 KB brotli for the validation layer the whole app shares.

Do **not** spend another pass on route-level edits; that work is done and measured.
Full evidence: [`02`](02-critical-path.md) §2.

### 2 — Apply the Cloudflare cache rules ⭐ S, ops-only, no code

**The cheapest large win left, and the only item that cannot be done from the
repository.** The origin already says `public, max-age=0, s-maxage=30,
stale-while-revalidate=120` on anonymous `/`, and Cloudflare does not cache
`text/html` by default — so every anonymous view of `/`, both catalogs and every
article is still a full origin SSR render.

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... bash deploy/apply-cloudflare-cache-rules.sh
# then save the VERIFY_ONLY=1 output, per docs/performance-slo.md
```

Then tick the two unchecked boxes in
[`../performance-slo.md`](../performance-slo.md). It also gates most of §3's value.
Evidence: [`05`](05-server-edge-fonts.md) §4.

> **No widening needed** — an earlier draft of this backlog said to widen the HTML
> rule "from `/`" to match `CACHEABLE_ANON_PATHS`. That was inherited from the
> 08-09 audit and is **stale**: the committed rule's expression already lists all
> 11 paths in `CACHEABLE_ANON_PATHS` plus the `/blog/` and `/news/` prefixes, and
> `lib/__tests__/anon-html-cache.test.ts` parses that expression out of the shell
> script and fails if it drifts from the plugin. The rule is complete; it has just
> never been applied.

### 3 — Per-route API cache policies, route by route ⭐ M, ongoing

The safe blanket work is done. What remains is judgement per endpoint:

- **46 `auth: 'none'` handlers read a session internally** and must never be
  `public`. Run the triage in [`03`](03-api-caching.md) §5(b) before touching any
  of them.
- The 100 `auth: 'required'` handlers can take a short `private` window — but
  route by route, driven by traffic. A stale wallet balance or unread count is a
  bug, not a cache hit.
- Consider a shrink-only adoption test (the
  `lib/__tests__/api-handler-adoption.test.ts` shape) so the gap stays visible
  without pressuring anyone into an unsafe `public`.

### 4 — The ~380 requests per page ⭐ M–L, needs a new idea

Still the headline user-facing cost, and `minSize` is now known not to be the
lever. 89 of the 108 critical-path chunks are under 6 KB (126 KB total), and the
rest of the count is per-route chunks plus their modulepreloads.

Directions not yet tried: shaping route chunk boundaries directly (rather than by
a size floor), reducing the modulepreload fan-out per route in the Start manifest,
or HTTP/3-era measurement to establish whether 380 requests still costs what it
did — the assumption that it does is inherited from earlier audits, not measured
here.

### 5 — Split `globals.css` ⭐ M, needs eyes not automation

465.3 KB raw / 47.9 KB brotli, render-blocking on every page, **65–67% used** —
one sheet serves the site shell, 18 games and 12 apps. OPT-11 + OPT-13.

**Deliberately not attempted.** The win is parse and style-recalc time on low-end
devices (47.9 KB brotli is modest), and verifying no visual regression means
looking at three themes × two widths across ~30 full-screen apps. Doing it blind
risks a site-wide visual regression to save little. Measure the win in long-tasks,
not bytes, and budget the review time.

### 6 — `BlurImage` still emits WebP only ⭐ S

`OptimizedImage` now offers AVIF; `BlurImage` does not, because it also writes a
`<link rel="preload" imageSrcSet>` and getting `type` negotiation wrong there
causes a **double** download — the opposite of the intent. Worth doing carefully,
separately. [`05`](05-server-edge-fonts.md) §6.

### 7 — The 3D games and `/rmhmusic`: 4.8–6.0 s of long tasks ⭐ L

**The highest ceiling in the product, and the only item that is genuine
investigation rather than a known fix.** `/neon-driftway`, `/nightrail`,
`/isleworks`, `/cookgame` and `/rmhmusic` each spend 4.8–6.0 s in main-thread long
tasks *after* downloading finishes, on an unthrottled desktop — several times
worse on a mid-range phone. The tab is frozen for that whole time and no
byte-shaving touches it.

three.js is not duplicated; it is simply large, and initialisation is larger
(shader compilation, scene construction, geometry upload). Levers: OPT-26
(KTX2/Basis textures), OPT-37 (`OffscreenCanvas`), and staging scene construction
across frames so the freeze becomes a progress bar. `/rmhmusic` is in the same
class and deserves its own profile. See
[`../3d-performance-audit.md`](../3d-performance-audit.md).

### 8 — Harvest the query budget ⭐ S, high information per hour

The instrumentation exists and is wired (`enterQueryBudget` in
`server/nitro/otel.ts`); nobody has read its output, and its stated purpose is to
"PRODUCE the list of offenders".

```bash
DATABASE_QUERY_BUDGET=25 …      # then grep the container log for:
#   [db:query-budget]        — first crossing, with top model.operation pairs
#   [db:query-budget:final]  — the total
```

Needs real traffic over a day, so it cannot be done in a sandbox. In development
the unbounded-read guard logs alongside it. [`04`](04-database.md) §4.

### 9 — Adopt `prismaRead` at read-only call sites ⭐ S, ongoing

`prismaRead` falls back to `prisma` when `DATABASE_REPLICA_URL` is unset, so call
sites can adopt it now with zero behaviour change — which turns "stand up a read
replica" from an audit of every read into an env var. [`04`](04-database.md) §6.

### 10 — `/slice-it`'s four-hop import waterfall ⭐ S

Reported 08-09, **not re-verified here** — and given that two other image/bundle
claims from that audit turned out to be stale, verify before acting. Reported
shape: 756 KB across four serial round trips, hops 3 and 4 (216 KB) being
`music-metadata` format parsers. Preload the known-next chunk, or collapse the
parser set to the formats the game accepts.

### 11 — Unreferenced variant art ⭐ S, housekeeping

The variant pipeline generates 292 files for 69 source images, and `grep` finds
almost none of those source paths referenced from application code — the
`merch-*`, `screenshots/*` and `deeplink/*` entries appear only in the generated
manifest. Either they are dead assets that can leave `public/images/**`, or they
are art the UI *should* be using and isn't. Both answers are useful; neither costs
much to establish. [`05`](05-server-edge-fonts.md) §6.
### 12 — The last 26.4 KB of framer-motion ⭐ S–M

`VisualElement-*` (26.4 KB raw / 8.5 KB brotli) is still on the critical path after
the nine full-`motion` imports were fixed. The cause is now different and
legitimate: `Reorder` + `useDragControls` (`components/ui/sortable-list.tsx`),
`LayoutGroup` (`components/user-builds/BuildGrid.tsx`), and
`useScroll`/`useTransform`/`useInView` in three more components. None has an
`m`-style lightweight variant.

So this is a lazy-boundary change, not an import swap: `lazy()` the components that
use those APIs from whatever renders them, so the element core loads with the
feature instead of with the shell. Check the scan still returns 0 full-`motion`
importers afterwards. [`02`](02-critical-path.md) §4.

