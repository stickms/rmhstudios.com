# 06 — Backlog: what is still open, ranked

Ranked by measured benefit per unit of risk. Each entry names the file it lands
in and the evidence section behind it, so it can be picked up cold.

Effort is rough: **S** ≤ half a day · **M** a day or two · **L** longer or needs
investigation.

## 1 — Apply the Cloudflare cache rules ⭐ S, ops-only, no code

**Why first:** the origin already says "cacheable" and nothing is listening.
Cloudflare does not cache `text/html` by default, so every anonymous view of `/`,
both catalogs and every article is still a full origin SSR render despite the
08-09 fix working.

```bash
CLOUDFLARE_API_TOKEN=... CLOUDFLARE_ZONE_ID=... bash deploy/apply-cloudflare-cache-rules.sh
# then save the VERIFY_ONLY=1 output, per docs/performance-slo.md
```

Then widen the rule from `/` to match `CACHEABLE_ANON_PATHS` in
`server/nitro/anon-html-cache.ts`. Tick the two unchecked boxes in
[`../performance-slo.md`](../performance-slo.md). Evidence:
[`05-server-edge-fonts.md`](05-server-edge-fonts.md) §4.

## 2 — Close the API caching gap ⭐ M per wave, 3 waves

**259 of 269 GET handlers declare neither `cache` nor `etag`**, including 73 that
are `auth: 'none'` and therefore edge-cacheable by construction. The machinery is
built, safety-checked at module load, and adopted by 3.7% of routes.

Wave 1 (the 73 public routes) is the bandwidth win and is mostly mechanical —
[`03-api-caching.md`](03-api-caching.md) §4 has the suggested spec per endpoint
shape, and §3 has four worked examples verified end to end (including a `304`).
Wave 3 (`auth: 'optional'`) is the judgement-heavy one and is the only item in
this backlog with a security consequence if done carelessly: `'public'` on a
response with any user-dependent branch leaks one caller's body to another.

**Pair it with a shrink-only test** modelled on
`lib/__tests__/api-handler-adoption.test.ts`, so 259 invisible omissions become a
countdown that cannot silently grow.

## 3 — An eslint rule for the lucide namespace import ⭐ S

The 431 KB icon chunk is gone, and nothing stops a fifth site from bringing it
back. The failure is silent — it costs bytes, not correctness — and it already
happened four times.

Ban, in `eslint-local-rules/`:

- `import * as X from 'lucide-react'`
- the named `icons` import (`import { icons } from 'lucide-react'`)

This is OPT-10 rewritten to match the real cause. **Do not do OPT-10 as
originally written** (a per-icon deep-import codemod over ~588 files) — see
[`02-critical-path.md`](02-critical-path.md) §1 for why that diagnosis was wrong.

## 4 — Get zod off the critical path, path two ⭐ M

`schemas-*` is still **71.0 KB raw / 16.6 KB brotli** on every page. The catalog
path is fixed; the remaining one is **26 page routes** doing
`import { z } from 'zod'` at top level for a `validateSearch` schema.
`validateSearch` is not a route *component*, so Start's splitter never lifts it —
it lands in the shared entry by design.

Two options:

- Move each schema into a `*-search-schema.ts` sibling behind the split boundary.
- Hand-roll the parser. Most of these are three optional strings; `zod` is a
  large dependency to carry site-wide for `?tab=&sort=`.

Either way, add a tripwire — the 08-04 audit wrote the rule ("never import zod
into a shell module") and it was re-broken twice, which means the rule needs a
test, not a sentence. Evidence: [`01-measurements.md`](01-measurements.md) §3.

## 5 — A test for the H3 `event.res` header bug ⭐ S

Found twice now, in three plugins, because the broken form
(`event.res?.headers ?? res?.headers`) is the one that reads naturally, and the
symptom is total silence. `security-headers.ts` and `anon-html-cache.ts` were
fixed on 08-09; `otel.ts` was fixed in this commit.

Assert that every `response`-hook plugin resolves headers via
`responseHeaders(res, event)` — or lint `event.res` inside a `response` hook.
Evidence: [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §2.

## 6 — Harvest the query budget ⭐ S, high information per hour

The instrumentation exists and is wired (`enterQueryBudget` in
`server/nitro/otel.ts`); nobody has read its output. Its stated purpose is to
"PRODUCE the list of offenders" and that list has never been collected.

```bash
DATABASE_QUERY_BUDGET=25 …      # then grep the container log for:
#   [db:query-budget]        — the first crossing, with top model.operation pairs
#   [db:query-budget:final]  — the total
```

Run against production or a seeded local DB for a day. In development the
unbounded-read guard (`findMany` with no `select`/`take`) logs alongside it — it
is `$extends`ed off in production by design. Evidence:
[`04-database.md`](04-database.md) §4.

## 7 — Measure `codeSplitting.minSize` against the request count ⭐ M

**380 requests to render `/`**, and 90 of the 111 critical-path chunks are under
6 KB (125.9 KB total). On localhost that is free; on a phone on 4G it is where a
page stops feeling instant regardless of payload.

The 08-04 audit called this "worth measuring, not worth guessing at". It is worth
measuring now. Raise `output.codeSplitting.minSize` in `vite.config.ts`, rebuild,
and compare request count *and* critical-path brotli — merging chunks trades
request count for cache granularity, so a win needs both numbers.

## 8 — Split `globals.css` ⭐ M

465.3 KB raw / 47.9 KB brotli, render-blocking on every page, **65–67% used**.
One sheet serves the site shell, 18 games and 12 apps. OPT-11 + OPT-13.

Measure the win in long-tasks, not bytes: 47.9 KB brotli is modest, and the real
cost is parse plus style-recalc on low-end devices. Evidence:
[`05-server-edge-fonts.md`](05-server-edge-fonts.md) §5.

## 9 — AVIF, and the outstanding image odds and ends ⭐ M

**0 AVIF files in the repo.** OPT-22, unimplemented; typically 20–30% under WebP
at equal quality. Extend `scripts/gen-image-variants.ts` to emit AVIF alongside
WebP and add the `<source>` to `OptimizedImage`.

Also: `public/images/activities/lightsout.png` is a 928 KB PNG among WebP
neighbours (single-file fix), variant coverage is 146 for 234 source images, and
`/void-breaker`'s reported 3.94 MB should be **re-measured before acting** —
`/games` improved from 2.07 MB to 296 KB, so that figure may be stale too.
Evidence: [`05-server-edge-fonts.md`](05-server-edge-fonts.md) §6.

## 10 — framer-motion on the critical path ⭐ S to diagnose

`VisualElement-*`, 26.4 KB raw / 8.5 KB brotli, reached from the shell.
`Providers` already uses `LazyMotion`, which is supposed to prevent exactly this
— so either a feature bundle is loaded eagerly or a non-lazy `motion.*` import in
a shell module defeats it. Small, but it is a defeated optimisation rather than a
cost someone chose.

## 11 — The 3D games and `/rmhmusic`: 4.8–6.0 s of long tasks ⭐ L

**The highest ceiling of anything in this document, and the only item that needs
real investigation rather than a known fix.** `/neon-driftway`, `/nightrail`,
`/isleworks`, `/cookgame` and `/rmhmusic` each spend 4.8–6.0 seconds in
main-thread long tasks *after* downloading finishes, on an unthrottled desktop —
several times worse on a mid-range phone. The tab is frozen for that whole time
and no byte-shaving touches it.

three.js is not duplicated; it is simply large, and initialisation is larger
(shader compilation, scene construction, geometry upload). Applicable levers:
OPT-26 (KTX2/Basis textures — less GPU upload and decode), OPT-37
(`OffscreenCanvas` — moves the loop off the main thread entirely), and staging
scene construction across frames so the freeze becomes a progress bar.
`/rmhmusic` is in the same class as the 3D titles and deserves its own profile.
See [`../3d-performance-audit.md`](../3d-performance-audit.md).

## 12 — Lazy-construct the remaining module-scope clients ⭐ S

~16 module-scope `new OpenAI(...)` calls remain in `lib/**`. The
availability hazard is fixed (all now have key fallbacks, so none throws at
import), but they still execute on the cold path that
`loadEntries()` walks through ~855 route modules for a 1.55–2.04 s first request.
`lib/library/collections.server.ts` and `lib/ai/provider.server.ts` already
document and implement the lazy pattern — copy it. Evidence:
[`05-server-edge-fonts.md`](05-server-edge-fonts.md) §1.

## 13 — `/slice-it`'s four-hop import waterfall ⭐ S

Reported on 08-09, not re-verified here: 756 KB across four serial round trips,
where hops 3 and 4 (216 KB) are `music-metadata` format parsers — `MP4Parser`,
`MpegParser`, `AsfParser`, `MatroskaParser`, `APEv2Parser`, `ID3v1Parser`. Each
hop is an RTT that cannot start until the previous chunk has been parsed and
executed. Preload the known-next chunk, or collapse the parser set to the formats
the game actually accepts.

## 14 — Fix the stale schema counts in the agent-facing docs ⭐ S

Root `CLAUDE.md` and `lib/CLAUDE.md` both say "252 models, 66 enums, ~6000
lines". Actual: **323 models, 71 enums, 8,864 lines**. Not a performance issue,
but those files are the map every agent navigates by.

---

## Explicitly *not* recommended

Recording these so nobody spends the budget:

| Idea                                         | Why not                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| **Revamp the database layout**               | Warm TTFB is 26–80 ms; indexes match the hot access patterns; the read path is already batched, denormalized and SWR-cached. Evidence: [`04-database.md`](04-database.md). |
| **Revamp the API handler layer**             | `lib/api/handler.server.ts` is well-built. It needs *adoption*, not replacement — §2 above.  |
| **OPT-10 as written** (588-file icon codemod) | Wrong diagnosis. Four files were the cause and are fixed; a lint rule (§3) is the follow-up. |
| **Responsive image variants (OPT-24)**       | Already implemented and working. AVIF (§9) is what is actually missing.                      |
| **Removing `Vary: Accept-Language`**         | Looks like cache fragmentation; is deliberate and correct. [`03-api-caching.md`](03-api-caching.md) §6. |
| **A poller/interval audit**                  | Six `refetchInterval` sites, mostly 2–5 min; realtime rides SSE. The 07-30 work held.        |
