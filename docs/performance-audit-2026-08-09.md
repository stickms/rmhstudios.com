# Loading-Time Audit — 2026-08-09

> **Superseded in part by
> [`loading-audit-2026-08-11/`](loading-audit-2026-08-11/index.md).** Two findings
> below are wrong and were corrected there by measurement — read that folder's
> "Corrections to earlier audits" section before acting on §4 or §6:
>
> 1. **§4's diagnosis of the icon chunk is wrong.** The cause was not "552 files
>    each importing a handful of icons, whose union rolldown hoists". It was
>    **four files** doing a computed lookup on a namespace import
>    (`import * as Icons` → `Icons[name]`), which is unshakeable. Fixing those
>    four removed the chunk entirely. **The ~588-file per-icon codemod
>    recommended below (OPT-10) is unnecessary — do not do it.**
> 2. **§6's "`/games` downloads 2.07 MB of card art" no longer holds.** It
>    downloads 296 KB; the responsive-variant pipeline is implemented and
>    working (commit `f8df30ee`, after this audit). AVIF is the remaining image
>    win, not responsive variants.
>
> Also: the `event.res` header bug this audit fixed in `security-headers.ts` and
> `anon-html-cache.ts` was **still present in `server/nitro/otel.ts`**, so
> `Server-Timing` never reached a client. Fixed 08-11.
>
> Everything else here still holds, and §1, §2, §3a, §3b and §8 have since been
> fixed — see the newer folder for which.

Triggered by: **"everything loads slowly — including the games and apps."**

Unlike the previous passes, this one is measured against a **running
production build**, not just the bundle. The site was built with `pnpm build`,
booted from `.output/server/index.mjs` against a local Postgres, and driven with
Chromium (Playwright) — so the numbers below are FCP/LCP/long-task/request
counts from a real browser, for every game and every app, signed out **and**
signed in.

Read the earlier passes first; their findings still hold and are not revisited:

- [`performance-audit-2026-07-17.md`](performance-audit-2026-07-17.md) — DB
  indexes, FTS, first bundle split, SSR i18n.
- [`performance-audit-2026-07-30.md`](performance-audit-2026-07-30.md) —
  pollers, write amplification.
- [`performance-audit-2026-08-01.md`](performance-audit-2026-08-01.md) — the
  custom-property restyle; interaction latency.
- [`performance-audit-2026-08-04.md`](performance-audit-2026-08-04.md) — the
  entry-chunk composition work this audit finds has partly regressed.

---

## Headline

There is no single cause. There are **four independent ones**, and they stack:

| #   | Cause                                                            | Who pays                       | Cost                                          |
| --- | ---------------------------------------------------------------- | ------------------------------ | --------------------------------------------- |
| 1   | Anonymous HTML was never marked cacheable (a silent plugin bug)  | every anonymous visit          | full origin SSR on every page view            |
| 2   | 8 routes cannot paint until `fonts.googleapis.com` answers       | those routes                   | FCP 0.39 s → **12.8 s** when it doesn't       |
| 3   | The shared critical path regressed and carries things no page needs | every page                   | 1219 KB raw / 314 KB brotli, 116 chunks       |
| 4   | ~1074 lucide icons ship as one chunk                             | every page                     | **116 KB gzip**, the largest single request   |

Plus a games-specific one: the 3D titles spend **5–6.5 seconds** of main-thread
long tasks after they've finished downloading, which no byte budget will fix.

**One of these is fixed in this commit** (#1 — it was a bug, and the fix is
verified end to end). The rest are diagnosed with reproductions and left as
recommendations, because each is a design decision rather than a defect.

---

## Measured baseline

Cold anonymous load, unthrottled, localhost (so network time ≈ 0 — every number
below is **pure client cost**, and a real connection only adds to it):

| Route      | requests | JS (gzip) | requests < 5 KB | CSS (gzip) | FCP    | LCP     | long tasks |
| ---------- | -------: | --------: | --------------: | ---------: | -----: | ------: | ---------: |
| `/`        |      248 |    678 KB |             209 |      94 KB | 532 ms |  824 ms |     337 ms |
| `/games`   |      233 |    638 KB |             181 |      94 KB | 604 ms |  856 ms |     533 ms |
| `/library` |      475 |   1027 KB |             419 |      99 KB | 504 ms |  504 ms |     526 ms |
| `/news`    |      483 |   1042 KB |             421 |      99 KB | 584 ms | 2320 ms |     410 ms |

At 4× CPU throttle (a mid-range phone; a budget phone is worse still):

| Route      | requests | FCP     | LCP     | long tasks |
| ---------- | -------: | ------: | ------: | ---------: |
| `/`        |      305 | 1012 ms | 3320 ms |    1624 ms |
| `/games`   |      302 | 1124 ms | 1288 ms |    1931 ms |
| `/library` |      300 | 1012 ms | 3168 ms |    1330 ms |

The request counts are the thing to notice. **170–500 requests per page, of
which 120–430 are JS chunks under 5 KB.** On localhost that is free. On a phone
on 4G, 400 requests is where the page stops feeling instant no matter how small
the bytes are.

---

## 1 — Anonymous HTML was never edge-cacheable (FIXED)

**The whole anonymous-HTML caching layer was dead.** So were the
defense-in-depth security headers. Both for the same reason.

`server/nitro/anon-html-cache.ts` and `server/nitro/security-headers.ts` both
register a Nitro `response` hook and both resolve the headers like this:

```ts
const headers = event?.res?.headers ?? res?.headers;
```

In H3 v2 that is always the wrong object. `prepareResponse()` clears the event's
prepared-response slot (`event[kEventRes] = undefined`) while it builds the
final `Response`, and `event.res` is a **lazy getter**:

```js
get res() { return this[kEventRes] ||= new H3EventResponse(); }
```

So reading `event.res` inside a `response` hook does not return the response —
it **constructs a brand-new, empty, detached one**. Its `.headers` is a
perfectly valid `Headers` object, so `??` never fell through to `res.headers`,
and every header both plugins set went into a throwaway bag that was discarded a
microtask later.

Confirmed on the running build before the fix — no `cache-control`, no
`x-content-type-options`, no CSP, on **any** response:

```
$ curl -sD- -o /dev/null http://localhost:3200/
HTTP/1.1 200
content-type: text/html; charset=utf-8
Date: ...
Transfer-Encoding: chunked
```

### Why this is the biggest server-side cost

`CACHEABLE_ANON_PATHS` covers `/`, `/games`, `/apps`, `/news`, `/library`, the
legal pages, and the whole `/blog/` and `/news/` article subtrees. None of it was
ever marked cacheable, so **the Cloudflare cache rule had nothing to cache** and
every anonymous view of the homepage, the catalogs, and every article was a full
origin SSR render — session resolution, feed query, React render, the lot.

It also never set `private, no-cache` on authenticated HTML. That string is
deliberately chosen over `no-store` (see the comment in the file) precisely so
signed-in pages keep back/forward-cache eligibility; with no header at all, the
browser decides.

### The fix

`responseHeaders(res, event)` in `security-headers.ts`, shared by both plugins:
prefer the `res` argument (the response actually being sent), fall back to
`event.res` only if it isn't usable. Verified on a rebuilt server:

```
anonymous  /       → cache-control: public, max-age=0, s-maxage=30, stale-while-revalidate=120
anonymous  /games  → cache-control: public, max-age=0, s-maxage=30, stale-while-revalidate=120
signed-in  /       → cache-control: private, no-cache, max-age=0, must-revalidate
/messages          → (no cache-control — correctly not allowlisted)
+ x-content-type-options, referrer-policy, CSP, CSP-report-only now present
```

### Why the test suite didn't catch it

`lib/__tests__/anon-html-cache.test.ts` did exercise the real hook — but its
harness passed **one `Headers` instance as both** `res.headers` and
`event.res.headers`, so it could not distinguish the two branches. The fake was
the bug's hiding place.

Added two regression tests that model H3's actual semantics (`event.res` returns
a fresh detached object each read; only `res.headers` is live). They fail on the
old code and pass on the new.

> **Still required to realise the win:** the Cloudflare cache rule must exist for
> these headers to do anything —
> `deploy/apply-cloudflare-cache-rules.sh`, still unchecked in
> [`performance-slo.md`](performance-slo.md)'s rollout checklist. The origin is
> now saying "cacheable"; nothing is listening yet.

---

## 2 — Eight routes cannot paint until Google Fonts answers

The root document is careful about this: `deferredFontsScript` loads the
decorative families in `requestIdleCallback` specifically to keep them off the
critical path, and Inter is self-hosted and preloaded.

Eight routes bypass all of that and take a **hard render-blocking dependency on
`fonts.googleapis.com`**:

| Route                     | How                                     |
| ------------------------- | --------------------------------------- |
| `/slice-it`               | `<link rel="stylesheet">` in the component body |
| `/versecraft`             | `<link rel="stylesheet">` in the component body |
| `/kowloon-knockout`       | `<link rel="stylesheet">` in the component body |
| `/rmh-farming-sim`        | `<link rel="stylesheet">` in the component body |
| `/rmh-capital`            | `head().links`                          |
| `/rmh-pmc`                | `head().links`                          |
| `/covid`                  | `head().links`                          |
| `/adaptive-intelligence`  | `head().links`                          |
| `/altair`                 | **`@import url(...)` inside `altair.css`** |

The component-body ones are the worst shape: React 19 hoists
`<link rel="stylesheet">` and **suspends rendering until it loads**. The
`altair.css` `@import` is the other worst shape — a third-party sheet that isn't
even discoverable until the parent sheet has downloaded, so it is a serial hop
*and* render-blocking.

### The A/B

Same build, same machine; the only variable is whether the font origin responds.
Requests to `fonts.googleapis.com` were fulfilled instantly by the harness in the
right-hand column:

| Route                   | font origin not answering | font origin instant |
| ----------------------- | ------------------------: | ------------------: |
| `/slice-it`             |               **12832 ms** |              364 ms |
| `/versecraft`           |               **12880 ms** |              388 ms |
| `/altair`               |               **12848 ms** |              384 ms |
| `/rmh-capital`          |               **12872 ms** |              488 ms |
| `/covid`                |               **12788 ms** |              432 ms |
| `/temple-of-joy` (control — no font link) | 328 ms |              332 ms |

The control route is unmoved; every route with the dependency is entirely gated
on a third party. **The 12.8 s figure is a sandbox artifact** — Chromium had no
route to that origin here — and production will be a few hundred milliseconds
instead. The finding is not the 12.8 s, it is that **first paint on those routes
is gated on an origin we don't control**, with no fallback. Any visitor behind a
blocked, throttled, or slow Google Fonts (corporate proxies, some ad blockers,
mainland China) gets a blank page for as long as that takes.

**Recommendation:** self-host these families the way Inter already is
(`@fontsource-*`), or move them into the existing idle-deferred script. Either
way `font-display: swap` renders text immediately instead of blocking on it. The
`altair.css` `@import` should go regardless — a CSS `@import` of a remote sheet
is never the right call.

---

## 3 — The shared critical path regressed

Every page loads this before it can hydrate, measured the same way as
2026-08-04 (transitive **static**-import closure of the client entry):

| Metric                | 2026-08-04 | now         | change     |
| --------------------- | ---------: | ----------- | ---------- |
| Entry chunk           |   253.6 KB | **273.9 KB** | +8.0%     |
| Critical path, raw    |  1028.5 KB | **1219.2 KB** | **+18.5%** |
| Critical path, brotli |   297.6 KB | **313.8 KB** | +5.4%     |
| Chunks                |         94 | **116**      | +22       |

Largest members:

| Chunk                | Raw      | What it is                              | Needed on every page? |
| -------------------- | -------: | --------------------------------------- | --------------------- |
| `index-*`            | 273.9 KB | the entry (all route-module top level)  | inherent              |
| `vendor-react-*`     | 187.3 KB | React                                   | yes                   |
| `c-ui-*`             | 127.5 KB | English i18n core namespaces            | yes (was 103 KB)      |
| `schemas-*`          |  71.0 KB | **zod**                                 | **no**                |
| `localeStore-*`      |  46.3 KB | locale store                            | yes                   |
| `Providers-*`        |  45.6 KB | the shell                               | yes                   |
| `auth-client-*`      |  43.0 KB | Better Auth client                      | yes                   |
| `esm-*`              |  40.3 KB | **socket.io-client**                    | **no**                |
| `apps-*`             |  29.4 KB | **the game/app catalog + its schemas**  | **no**                |

### 3a — zod is back on the critical path, by two separate routes

The 2026-08-04 audit removed zod and left a written rule: *"Never import zod into
a shell module. Module-scope `z.object(...)` calls are not tree-shakeable."*
Both halves have since been re-broken.

**Path one — the catalog refactor.** `components/Providers.tsx` (every page)
imports `@/lib/games` and `@/lib/apps`, which are re-exports of
`lib/catalog/index.ts`, which imports `lib/catalog/types.ts` — **zod** — and then
runs `buildCatalog()` at module scope: 34 strict `.parse()` calls, in the
browser, on every cold page load. The file documents this deliberately ("Why zod
at module load … a typo'd key fails immediately"). That reasoning is right for
dev, CI and the build; it is being paid by every visitor instead. Confirmed in
the built output — `apps-DD0gyD62.js` opens with
`import{...}from"./schemas-BsBeGYEe.js"` and rebuilds the schemas inline.

**Path two — `validateSearch`.** 26 page routes do `import { z } from 'zod'` at
top level for their search-param schema (`_site/rmhladder/*` and others).
`validateSearch` is not a route *component*, so Start's splitter never lifts it —
it lands in the shared entry by design.

**Recommendation:** validate the catalog at build time (a test or a
`scripts/` check) and ship plain typed data at runtime; that alone removes zod
and shrinks `apps-*`. For `validateSearch`, either move the schemas into
`*-schema.ts` siblings behind the split boundary or use a hand-rolled parser
for what is usually three optional strings.

### 3b — socket.io-client on every page, for voice calls

`Providers.tsx` → `CallMount` → `lib/call/store` → `socket.io-client`
(40.3 KB raw). `CallMount` is careful *not to open* the socket for a
signed-out viewer — but the import is static, so the library is downloaded,
parsed and executed on every page for everyone, including anonymous visitors who
have nobody to call. Same fix as the 2026-08-04 registry finding: `lazy()` the
overlay and dynamic-`import()` `initCalls` inside the effect that already guards
on `userId`.

### 3c — fragmentation

96 of the 116 critical-path chunks are under 6 KB, 113 KB in total. That is
before the route's own chunks, which is how a page ends up making 250–500
requests. `output.codeSplitting.minSize` is the lever; the 2026-08-04 audit
flagged it as "worth measuring, not worth guessing at" and it is now worth
measuring — at 400+ requests the per-request cost has stopped being theoretical.

---

## 4 — 1,074 lucide icons in one chunk

`icons-BYHvUPCJ.js` is **433 KB raw / 116 KB gzip** and contains **1,074
distinct icons (1,407 exports)**. It was the single largest request on the real
homepage load — bigger than the entry chunk, bigger than React, bigger than
`globals.css`.

552 source files import from `lucide-react`. Each imports a handful of icons, but
because they are spread across hundreds of route chunks, rolldown hoists the
**union** into one shared chunk. Any page that needs three icons downloads all
1,074.

It is reached by a dynamic import, so it is not on the static critical path — but
it is fetched immediately after hydration on essentially every page, which for a
user is the same thing.

**Recommendation:** this is OPT-10 in
[`optimization-ideas-2026-08-05.md`](optimization-ideas-2026-08-05.md), and it
should be promoted. Per-icon deep imports (`lucide-react/icons/<name>`) let each
icon be its own tiny module that rolldown can co-locate with the route that uses
it. The measured prize — ~116 KB gzip off nearly every page — is the largest
single win in this document.

---

## 5 — CSS: one 457 KB sheet for three tiers

`globals-*.css` is **457 KB raw / 61 KB gzip**, render-blocking on every page:
5,658 rule blocks, 1,905 custom-property declarations, 716 `@supports` blocks,
81 `@media`, 37 `@keyframes`.

Chromium coverage on real page loads: **65–67% used**. Roughly a third of the
sheet — ~150 KB raw — is parsed on every page and never matches anything, because
one stylesheet serves the site shell, all 18 games and all 12 apps.

This is OPT-11 (split site-shell vs app-shell) and OPT-13 (dead-CSS sweep) in the
ideas doc. The coverage number above is the measurement OPT-13 asks for; it says
the split is worth doing.

---

## 6 — Games: the problem is the main thread, not the bytes

All 18 games, cold, fonts stubbed, unthrottled:

| Route                  | requests | JS (gzip) | images  | FCP    | LCP     | **long tasks** |
| ---------------------- | -------: | --------: | ------: | -----: | ------: | -------------: |
| `/neon-driftway`       |      237 |    865 KB |       0 | 436 ms |  436 ms |     **6026 ms** |
| `/nightrail`           |      231 |    857 KB |       0 | 364 ms |  364 ms |     **5687 ms** |
| `/isleworks`           |      254 |    927 KB |       0 | 376 ms | 1028 ms |     **5444 ms** |
| `/cookgame`            |      183 |   1654 KB |       0 | 400 ms |  400 ms |     **4808 ms** |
| `/void-breaker`        |      249 |    895 KB | 3938 KB | 332 ms |  332 ms |         221 ms |
| `/slice-it`            |      279 |    762 KB |   54 KB | 396 ms | 1340 ms |         239 ms |
| `/rochester-offensive` |      226 |    883 KB |       0 | 288 ms | 1300 ms |          57 ms |
| `/rmh-farming-sim`     |      233 |    888 KB |       0 | 348 ms |  976 ms |         132 ms |
| `/laundry-sort`        |      189 |    833 KB |       0 | 404 ms | 1336 ms |         428 ms |
| `/kowloon-knockout`    |      229 |    657 KB |       0 | 368 ms | 1052 ms |         143 ms |
| `/forest-explorer`     |      226 |    646 KB |       0 | 408 ms |  408 ms |         115 ms |
| `/temple-of-joy`       |      182 |    639 KB |       0 | 300 ms |  300 ms |         126 ms |
| `/versecraft`          |      166 |    639 KB |       0 | 388 ms | 1820 ms |         117 ms |
| `/dream-rift`          |      179 |    620 KB |  287 KB | 412 ms |  600 ms |          73 ms |
| `/synapse-storm`       |      184 |    609 KB |       0 | 336 ms |  916 ms |          57 ms |
| `/house-always-wins`   |      173 |    598 KB |       0 | 340 ms |  972 ms |         148 ms |
| `/gabriels-horn`       |      191 |    597 KB |       0 | 380 ms |  380 ms |          65 ms |
| `/massive-march`       |      174 |    592 KB |       0 | 336 ms |  912 ms |         138 ms |
| `/velum2099`           |      168 |    587 KB |       0 | 528 ms |  664 ms |         122 ms |
| `/lights-out`          |      176 |    575 KB |       0 | 292 ms |  948 ms |          64 ms |

The four 3D titles spend **4.8–6.0 seconds of main-thread long tasks** on an
unthrottled desktop. That is three.js compiling shaders, building scenes and
uploading geometry — the tab is frozen for that whole time, and no amount of
byte-shaving touches it. On a mid-range phone it is several times worse.

three.js itself is not duplicated (`three.core` 365 KB + `three.module` 348 KB is
upstream's own split, and `three.module` imports `three.core`) — it is simply
large, and the initialisation work is larger. The levers that actually apply are
OPT-26 (KTX2/Basis textures — less GPU upload and decode), OPT-37
(`OffscreenCanvas`, which moves the loop off the main thread entirely), and
staging scene construction across frames so the freeze becomes a progress bar.

Two other game-specific findings:

- **`/void-breaker` downloads 3.94 MB of images**; `/games` downloads 2.07 MB of
  card art. OPT-22 (AVIF) and OPT-24 (responsive variants) are aimed exactly
  here and are unimplemented.
- **`/slice-it` has a 4-hop serial dynamic-import waterfall**: 756 KB across
  four round trips, where hops 3 and 4 (216 KB) are `music-metadata` format
  parsers — `MP4Parser`, `MpegParser`, `AsfParser`, `MatroskaParser`,
  `APEv2Parser`, `ID3v1Parser`. Each hop is a serial RTT that cannot start until
  the previous chunk has been parsed and executed. Preloading the known-next
  chunk, or collapsing the parser set to the formats the game actually accepts,
  removes most of it.

## 7 — Apps

Measured **signed in** (all 12 redirect to `/login` when signed out, so an
anonymous measurement only measures the login page):

| Route             | requests | JS (gzip) | FCP    | LCP     | long tasks |
| ----------------- | -------: | --------: | -----: | ------: | ---------: |
| `/rmhmusic`       |      156 |    782 KB | 316 ms | 1212 ms | **5443 ms** |
| `/rmhcode`        |      223 |    632 KB | 408 ms |  796 ms |     374 ms |
| `/rmhcalculator`  |      213 |    627 KB | 360 ms |  360 ms |     158 ms |
| `/studio`         |      173 |    602 KB | 316 ms |  316 ms |     183 ms |
| `/rmhbox`         |      169 |    564 KB | 312 ms |  312 ms |     192 ms |
| `/rmhtube`        |      164 |    560 KB | 352 ms |  352 ms |     105 ms |
| `/rmhstudy`       |      161 |    556 KB | 336 ms |  336 ms |     144 ms |
| `/rmhtype`        |      160 |    555 KB | 364 ms |  364 ms |      59 ms |

`/rmhmusic` is the outlier: **5.4 seconds of long tasks**, in the same class as
the 3D games, and worth a dedicated profile.

One structural note: `app/routes/rmhtube.tsx` imports `RmhTubeShell` at top
level. That is the exact pattern the 2026-08-04 audit fixed for
`app/routes/rmhbox.tsx` by moving it behind `lazy()`. Start's splitter does lift
it here (it is only referenced from `component`), so it is not currently landing
in the entry — but it is one non-component reference away from doing so, and the
`lazy()` form is the one that cannot regress.

---

## 8 — Server: cold start loads the entire route graph

First request after boot: **1.84 s TTFB.** Warm requests: **15–22 ms.**

The cold cost is `loadEntries()` inside `startRequestResolver` — TanStack Start
loads every route entry module on the request path, and there are 855 of them
(570 under `app/routes/api/**`). The SSR router bundle is **2.68 MB**.

Two things made this visible rather than merely slow: module-scope construction
of third-party clients inside that graph. Booting without keys produced

```
Error: Neither apiKey nor config.authenticator provided   (Stripe)
Error: Missing credentials … set the OPENAI_API_KEY …     (OpenAI/xAI)
    at loadEntries (.output/server/_ssr/ssr.mjs:6375)
    at startRequestResolver (.output/server/_ssr/ssr.mjs:6547)
```

— i.e. a missing env var for one AI feature takes down **the first request to
any page on the site**, because every route entry is loaded before any of them
runs. There are ~9 module-scope `new OpenAI(...)` calls across `lib/**`;
`lib/library/collections.server.ts:54` already documents why it constructs its
client lazily instead. The same treatment applied to the rest would remove the
failure mode and shave the cold path.

`server/nitro/warmup.ts` masks the first-request cost after a deploy for the
homepage, which is why this is a cold-start concern rather than a live one — but
every blue/green swap pays it, and any route the warmup doesn't prime pays it
first.

---

## What to do, in order

Ranked by measured benefit per unit of risk:

1. ~~Fix the `response`-hook header bug~~ — **done in this commit.** Then apply
   the Cloudflare cache rules so the headers do something
   (`deploy/apply-cloudflare-cache-rules.sh`).
2. **Self-host or idle-defer the 9 Google Fonts references.** Removes a
   third-party single point of failure from first paint on 8 routes. Small,
   mechanical, no design change — the families stay identical.
3. **Split the lucide icon chunk** (OPT-10). ~116 KB gzip off nearly every page.
4. **Get zod off the critical path again** — validate the catalog at build time;
   move `validateSearch` schemas behind the split boundary. ~71 KB raw.
5. **`lazy()` the call overlay** so socket.io-client leaves the entry. ~40 KB.
6. **Split `globals.css`** (OPT-11) — coverage says a third of it is dead on any
   given page.
7. **Profile the four 3D games and `/rmhmusic`** for the 5–6 s of long tasks.
   Highest ceiling of anything here, and the only item that needs real
   investigation rather than a known fix.
8. **Measure `codeSplitting.minSize`** against the 400+ request counts.
9. **AVIF + responsive variants** for `/games` (2.07 MB) and `/void-breaker`
   (3.94 MB).

## Reproducing all of this

```bash
pnpm build
# boot the built server against a local DB, then:
node measure.mjs / /games /slice-it /isleworks     # Playwright: FCP/LCP/long tasks/requests
```

The critical path is the transitive **static**-import closure of the client
entry chunk (`index-*.js` — the one containing the `rmh-user-theme` theme
script), walking `from "./x.js"` and skipping `import("./x.js")`. Per-route cost
is the closure of that route's manifest preloads
(`.output/server/_tanstack-start-manifest_v-*.mjs`) minus the shared closure.
Dynamic-import waterfall depth is a BFS over `import()` edges from the route
chunk — each level is one serial round trip.

## Verification of the change in this commit

`pnpm test` — 249 files / **6,064 tests** green · production `pnpm build` green ·
headers verified against the running build (anonymous, signed-in, and
non-allowlisted paths) · the two new regression tests fail on the old code and
pass on the new.
