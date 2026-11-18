# Low-bandwidth audit — 2026-11-18

**Question:** on a slow or metered connection, does the site arrive progressively —
something readable early, usable soon after, and nothing the visitor did not ask for
competing with what they did?

**Short answer:** the feed-type pages already do. They paint in about a second on a
typical phone connection and become usable in about three. The outliers were the
image-heavy catalog pages (`/games`, `/apps`), which downloaded 3–8× the pixels they
showed. The second gap was that the "data saver" mode the plan lists as shipped (B20)
had no setting and no consumer. Both are fixed here. What is left is the shared entry
chunk, which is structural, and it is ranked at the end.

## Method

- A production build (`pnpm build`) served by `node .output/server/index.mjs`, with a
  small **HTTP/2 + TLS + Brotli** proxy in front standing in for Cloudflare. HTTP/2
  matters: over HTTP/1.1 Chrome opens six connections, and ~70 module scripts queue
  behind each other, which made a first pass read "usable at 9.7 s" where HTTP/2 gives
  4.5 s. Every number below is HTTP/2.
- Chromium at **390×844, 3× DPR, touch**, cache disabled (a first visit), throttled
  through the DevTools protocol with three profiles:

  | Profile | Round trip | Down | Up |
  | --- | --- | --- | --- |
  | Slow 4G (Lighthouse mobile) | 150 ms | 1.6 Mbit/s | 750 kbit/s |
  | Fast 3G (DevTools) | 563 ms | 1.44 Mbit/s | 675 kbit/s |
  | Slow 3G (DevTools) | 2,000 ms | 400 kbit/s | 400 kbit/s |

- **Usable** = the moment React has attached its props to the page's links, i.e. when
  a tap does something. It is the number that matters on a slow link; first paint
  alone is a page you can look at but not use.
- A local Postgres with migrations applied and **no content**, so feed pages render
  their shells without posts. Static catalog art (`/games`, `/apps`) is real.

**Caveat — read the 3G numbers as upper bounds.** The proxy's HTTP/2 server does not
honour stream priority, so the render-blocking stylesheet splits the link evenly with
~70 modulepreloads. On slow 3G, `site-tier.css` (41 KB) started at 2.1 s and finished at
6.5 s. Cloudflare schedules by priority, so in production it would finish around 3 s.
For the same reason, lazy (low-priority) images compete with scripts here more than
they would behind the edge. The byte counts are exact either way.

## Baseline

First paint / largest paint / usable, in seconds; bytes transferred in total.

| Page | Slow 4G | Fast 3G | Slow 3G | Total |
| --- | --- | --- | --- | --- |
| `/` | 1.0 / 1.0 / 3.3 | 1.9 / 1.9 / 4.5 | 6.6 / 6.6 / 15.7 | 0.9 MB |
| `/explore` | 1.1 / 1.1 / 3.7 | 2.0 / 2.0 / 4.9 | 6.9 / 6.9 / 17.4 | 1.0 MB |
| `/news` | 1.0 / 1.0 / 3.1 | 1.9 / 1.9 / 4.2 | 6.5 / 6.5 / 14.7 | 1.0 MB |
| `/blog` | 1.2 / 1.2 / 3.3 | 2.6 / 2.6 / 5.0 | 8.9 / 8.9 / 17.4 | 0.9 MB |
| `/pricing` | 1.2 / 1.2 / 3.7 | 2.5 / 2.5 / 5.4 | 8.5 / 8.5 / 18.8 | 1.0 MB |
| `/login` | 1.0 / 1.0 / 2.8 | — | 6.4 / 6.4 / 13.6 | 0.7 MB |
| `/help` | 1.0 / 1.0 / 2.7 | — | 6.5 / 6.5 / 13.3 | 0.9 MB |
| **`/games`** | 1.2 / 1.2 / **12.9** | 2.1 / 2.1 / **18.1** | 7.2 / 7.2 / **69.4** | **2.9–4.5 MB** |
| **`/apps`** | 1.3 / **8.2** / 8.7 | 2.7 / **11.4** / 9.7 | 9.3 / **40.7** / 35.0 | 1.7–1.9 MB |

No layout shift on any page (CLS 0).

## What is already right (do not redo)

- **The document is lean:** 9–17 KB Brotli. Router dehydration is 1–6 KB and nothing
  large is inlined (`html-anatomy` breakdown below).
- **First paint does not wait for data.** `/` streams its feed through a deferred
  loader promise, and the root loader's session lookup has an 800 ms cap.
- **Fonts:** the Latin Geist subset is preloaded beside the stylesheet with
  `font-display: swap`. Geist Mono is `optional`, so it never blocks or reflows text.
- **Images in the feed:** responsive srcset, AVIF via `<picture>`, blur-up, lazy by
  default, `priority` reserved for the one LCP image.
- **Ads** load only when a slot nears the viewport.
- **Speculation is network-aware.** The viewport and ForesightJS prefetchers ask
  `shouldSpeculate()` (lib/network-quality). On fast 3G the post-load traffic was
  ~200 KB of the shell's own idle features. On slow 4G, rated "fast", it was 300–500 KB,
  the difference being prefetched routes. That is the policy working as written.
- **Navigation feedback:** `RoutePending` shows after 400 ms on a client navigation.

| Document (Brotli) | `/` | `/games` | `/news` | `/pricing` |
| --- | --- | --- | --- | --- |
| Total | 11.9 KB | 9.4 KB | 9.4 KB | 16.6 KB |
| Router dehydration | 3.9 KB | 1.3 KB | 1.9 KB | 6.5 KB |
| Markup | 3.2 KB | 3.5 KB | 2.1 KB | 3.8 KB |
| `modulepreload` links | 68 | 19 | 50 | 78 |

## Findings and fixes

### LB-1 [fixed] Catalog art downloaded 3–8× the pixels it showed

`/games` requested all 45 card images at t = 1.1 s (2.2 MB). `/apps` downloaded two
variants of every app (a 320 and a 960, ~100 KB each), and its largest paint waited
8.3 s on a 960.

Two causes:

1. **`sizes` was derived from the intrinsic width.** `OptimizedImage` writes
   `(max-width: Wpx) 100vw, Wpx`, which reads as "100vw" on any viewport ≤ W. A
   capsule passes `width={240}`, so a 3× phone asked for 720–1170 device pixels and
   got the 960 variant, for a tile drawn 111 px wide. A caller could not correct it:
   a `sizes` prop landed only on the `<img>`, and the browser picks from the AVIF
   `<source>`. Fixed with a `sizes` prop that reaches both elements, and
   `CAPSULE_SIZES` (`(max-width: 767px) 34vw, 240px`) for the three capsule grids.
   The store hero gets `200px` and the profile activity row `48px`.
2. **The smallest variant was 320.** The 34 list icons (22 px) each fetched ~17 KB.
   Added a 160 rung to `scripts/gen-image-variants.ts` and to `OptimizedImage`'s
   on-demand ladder (the server ladder in `lib/images/variant-params.ts` already had
   160). Manifest 15,337 → 16,112 B, inside the entry-cost test's 16,400 B line, with
   no new rows.

Chrome starts lazy images 1,250 px (4G) to 2,500 px (3G) ahead of the viewport, and
`/games` is 3,700 px tall. Lazy loading therefore barely helps there, and smaller files
are what matters.

### LB-2 [fixed] Data saver had no setting and no consumer

`hooks/useDataSaver.ts` and `lib/network-quality.ts` existed. The plan's B20 lists it
as shipped. Nothing rendered a control for it and nothing called `useDataSaver()`; only
the prefetchers read its key.

- **Settings → Appearance → Data → Data saver: Auto / On / Off.** Stored per device,
  because a phone on a metered plan and a desktop on broadband are the same account.
- **`OptimizedImage` and `BlurImage` cap their srcset at the slot's CSS width**
  (about 1× instead of 3×) when saving.
- **Only for images mounted on the client.** An image in the server HTML is already
  downloading, so re-rendering it with fewer candidates would make the browser fetch a
  second, smaller file. `useDataSaverAtMount()` gets this from `useSyncExternalStore`:
  React renders a hydrating component with the server snapshot (`false`, no mismatch)
  and a client-mounted one with the live value, and `useState` latches it.
- **Never for a `priority` `BlurImage`,** whose preload is built from the uncapped
  srcset.

Verified in Chromium with the setting on:

- **Hard load of `/games`:** server-rendered candidates unchanged, one file fetched
  per picture.
- **Client navigation to `/games`:** freshly mounted art has `srcset="…-160.avif 160w"`.
- **Hydration:** no errors.

What data saver does **not** do yet is change the first page's images. That would mean
the server reading `Save-Data`, which the anonymous HTML cache would then need to vary
on (see LB-5).

### LB-3 [fixed] Every site page downloaded the announcement reader

`SitewideAnnouncementModal` sits in the shell overlays chunk that every `_site` page
loads after `load`. It imported `react-markdown`, the discussion thread and the
markdown components statically: ~40 KB compressed, announcement or not. The post and
discussion are now one lazy chunk (`SitewideAnnouncementBody`), loaded when the open
dialog has content. The post-load download on `/` at fast 3G went 207 → 168 KB.

### LB-4 [fixed] The service worker never cached AVIF

Its image pattern listed `png|jpe?g|webp|gif|svg|ico|woff2?`. `<picture>` serves AVIF
to nearly every browser, so the build-time variants were never kept for repeat or
offline visits.

## After

| Page | Metric | Slow 4G | Fast 3G | Slow 3G |
| --- | --- | --- | --- | --- |
| `/games` | usable | 12.9 → **7.9 s** | 18.1 → **13.6 s** | 69.4 → **52.5 s** |
| `/games` | total | 2.9 → **1.8 MB** | 4.2 → **2.4 MB** | 4.5 → **2.5 MB** |
| `/apps` | largest paint | 8.2 → **5.3 s** | 11.4 → **7.6 s** | 40.7 → **26.9 s** |
| `/apps` | usable | 8.7 → **6.0 s** | 9.7 → **7.9 s** | 35.0 → **28.0 s** |
| `/` | post-load download | 396 → 359 KB | 207 → **168 KB** | — |

## Follow-up the same day

Items 1, 2 and 5 of the first ranking, and the service-worker storage leak, were taken
further after the report. The entry, measured at maximum Brotli quality on a source-map
build (the repository's own `bundle-budget` metric in brackets):

| Step | Entry, Brotli | `platform_shell_eager_js` |
| --- | --- | --- |
| Start of the day | 182.1 KB | 239.5 KB |
| Short server-function ids, card index | 177.1 KB | 234.9 KB |
| Own lazy-motion provider | **169.0 KB** | **226.8 KB** |

### LB-5 [fixed] Server-function ids were 64-character hashes

Start's default id is the SHA-256 hex of `<absolute path>--<name>`. The entry carried 113
of them (7.3 KB raw, ~3.6 KB Brotli), and every lazy chunk that calls a server function
carries its own. `serverFns.generateFunctionId` in `vite.config.ts` now uses the same
input, made path-relative, cut to 12 base64url characters (72 bits; the compiler
de-duplicates a collision). Only the `/_serverFn/` prefix is matched anywhere. Verified
in Chromium: client navigations call `/_serverFn/<12 chars>` and get 200. Renaming the
scheme renames every function once, so tabs open across that deploy need one reload.

### LB-6 [fixed] The social-card copy shipped to every browser

`buildMeta` needs path → card file, and the route heads it runs in execute in the browser.
`lib/og/static-card-index.ts` is that mapping alone (2.4 KB, down from 13.2 KB). `seo.ts`
and `lib/rmh-research/og.ts` read it, and `og-cards.test.ts` holds it identical to
`STATIC_CARDS` and fails a client import of `static-cards`.

### LB-7 [fixed] framer-motion's engine sat in the entry for a lazy provider

`<LazyMotion>` imports `loadFeatures`, and that imports motion-dom's
`setFeatureDefinitions` from the same module as the whole `VisualElement` class (25.8 KB
raw, 8.1 KB Brotli), although the features load later.
`components/motion/LazyMotionProvider.tsx` supplies framer-motion's own `LazyContext`
(aliased to the exact file the `m` component imports, `framer-motion-internals.mjs`). The lazy bundle (`lib/motion-features.ts`) registers its own features.
`framer-motion-internals.test.ts` fails if an upgrade moves either file, and the
`check-entry-composition` caps dropped from 26,400 B and 1,480 B to 90 B and 550 B.
Verified in Chromium: on `/rideshare` and `/slice-it`, `m` elements move from their
`initial` styles to their `animate` values once the feature chunk loads.

### LB-8 [fixed] Speculation on links that are fast by round trip but thin

`shouldSpeculate()` now also holds back when Chromium's `downlink` estimate is under
5 Mbit/s. Slow 4G (150 ms, 1.6 Mbit/s) rated "fast" and the prefetchers pulled
300–500 KB there. Hover and tap preloading are unaffected.

### LB-9 [fixed] The offline cache never dropped old build files

The first cache miss in a worker's lifetime (a new deploy's hashes) prunes build files
cached more than 30 days ago, then the oldest past 1,500 entries (`assetsToPrune` in
`public/sw.js`, unit-tested).

### LB-10 [fixed] Data saver did not reach the first page

Data saver shaped only images mounted after hydration, because the server could
not see the setting. Now it can:

- **The setting is mirrored into a cookie,** `rmh-data-saver`, by
  `setDataSaverPreference`. `auto` removes it.
- **`lib/data-saver-request.ts` decides per request.** An explicit `on` or `off`
  wins; otherwise the browser's `Save-Data: on` header decides.
- **The decision travels to the client.** `getInitialI18n` in `__root.tsx` carries
  it in the root loader data, so a client refetch costs no extra round trip.
  `Providers` puts it in `DataSaverRequestContext`.
- **Hydration reads the same value.** `useDataSaverAtMount()` returns it as its
  server snapshot, so server and hydrating renders agree and nothing downloads twice.
- **A data-saver page is never shared.** It is marked
  `private, no-cache, max-age=0, must-revalidate` on every path
  (`decideCacheControl`), and the Cloudflare HTML rule bypasses the cache for the
  cookie and the header. The origin gate holds even before the updated rule is
  applied, because that rule is applied by running
  `deploy/apply-cloudflare-cache-rules.sh`.

Verified on a production build (`/games`, 390 px at 3×):

| Request | Server srcset | Cache-Control | Files fetched | Hydration errors |
| --- | --- | --- | --- | --- |
| No signal | up to 1280w | `public, s-maxage=30` | 160 and 640 | 0 |
| Setting on | 160w | `private, no-cache` | 160 only | 0 |
| `Save-Data: on` | 160w | `private, no-cache` | 160 only | 0 |
| Setting off + header | up to 1280w | `public, s-maxage=30` | 160 and 640 | 0 |

At slow 4G, `/games` with data saver on was usable at 3.8 s instead of 7.8 s, with
203 KB of images instead of 1,038 KB (753 KB in total instead of 1,590 KB). The
Settings control writes the cookie on "On" and removes it on "Auto".

### Still open

1. **Route setup (22 KB Brotli).** This is mostly `head()` across 365 routes. The router
   awaits every `head()` during hydration, so lazy-loading their strings would delay
   the first interactive render by a round trip. Meta descriptions are only ~3 KB.
   It stays until the router can split `head`.
2. **The catalog (9 KB Brotli)** reaches the entry through seven modules (route heads,
   the pre-paint theme routes, route matching, two shell mounts). A slim generated
   index would save about a third.
3. **`/games`' first screen:** fewer capsules before a "Show all". This is a layout
   decision.
4. **`tailwind-merge` (7 KB Brotli) and `i18next` (13 KB):** shell infrastructure.
   Replacing either changes behaviour site-wide.

## Reproducing

The scripts are not committed (they need a local build, Postgres and Chromium). The
shape, for a re-run:

- an HTTP/2 + Brotli proxy (`node:http2` `createSecureServer`, a self-signed
  certificate, per-chunk `flush()` so streamed SSR is not held back);
- a Playwright harness that disables cache, applies `Network.emulateNetworkConditions`,
  records paint/LCP/CLS through `PerformanceObserver`, polls for `__reactProps` on the
  first link, and dumps `performance.getEntriesByType('resource')`;
- source-map attribution of a chunk from `pnpm build:frontend:sourcemap`.
