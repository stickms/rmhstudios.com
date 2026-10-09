# Page-Switch Lag, Slow Networks, First-Load Redirects & Debossed Surfaces — 2026-10-09

> The owner reported three things together: surfaces that look **debossed** —
> sunk into the page — when that is not the site's material; pages that feel
> **slow on first load**; and **lag on every page switch**. This pass measured
> all three on a production build, fixed what the measurements pointed at, and
> audited the site tier against the liquid-globe material.
>
> Companions: [`ui-audit-2026-10-09.md`](./ui-audit-2026-10-09.md) (the same
> day's minimalism/consistency pass), [`design.md`](../design.md) §3 (now states
> "Nothing is debossed"), [`design-language.md`](./design-language.md).
>
> Finding IDs: `NAV-x` page switches, `LOAD-x` first load, `DEB-x` debossed
> surfaces, `CON-x` material consistency, `SLOW-x` slow networks and device
> range (Part 2). Code comments cite them.

---

## How it was measured

- **Production build** (`vite build` + the Nitro server) against a local
  Postgres. Dev mode injects CSS through JS and is not representative.
- **Page switches:** Playwright drives a real `<a>` click in the shell (the nav
  rail) from one page to the next across ten destinations (`/explore`, `/games`,
  `/library`, `/store`, `/communities`, `/predictions`, `/create`, `/developer`,
  `/services`, `/`). The metric is **click → the new page's heading painted**
  (the URL has changed, no pending skeleton, and one `requestAnimationFrame`
  after the content is in the DOM), plus every long task in the window. Two
  modes: **hover** (pointer rests 150ms first, so the router's intent preload
  fires) and **tap** (click with no hover, like a touch).
- **Two device classes:** 1× CPU with no added latency (a desktop), and **4× CPU
  throttle + 100ms RTT** (a mid-range phone on a decent connection). 3
  repetitions, medians reported; the box is shared, so single runs vary ±30%.
- **Attribution:** CPU profiles of a single switch on an **unminified** build (so
  frames have names), Chrome traces with `devtools.timeline` for style/layout
  costs, `invalidationTracking` for what dirtied style, and Blink's selector
  stats for per-rule matching cost.

---

## What was actually slow

The first hypothesis — not enough prefetching — was wrong. Hover and tap
measured the **same**: the router already preloads a route's loader and its JS
chunk on hover/touch-start (`defaultPreload: 'intent'`), and a viewport
prefetcher warms on-screen links for touch devices. The network was not on the
critical path of a switch.

What was: **main-thread work on arrival.** At 4× CPU, `/games` blocked for one
~880ms task; `/explore` ~400ms; `/store` ~320–450ms; `/library` ~420ms. Inside
those tasks, three things:

1. **The same page was styled and laid out several times in one switch.**
   Components read layout (`scrollWidth`, `scrollY`, framer-motion measurement)
   in the middle of the commit, then the next effect wrote to the DOM and
   invalidated it again. A full restyle of `/games` costs ~15ms at 1×; one
   switch was paying for it 3–4 times over.
2. **A route's stylesheet landing mid-arrival.** Speculative preloads insert the
   target route's CSS into `<head>`; a new stylesheet restyles every element.
3. **The whole page in one synchronous commit.** TanStack Router publishes new
   matches through `useSyncExternalStore`, and an external-store update is never
   time-sliced — so a hub page with a catalog, a storefront and a panel under
   the fold was built, styled and laid out in full before any of it painted.

Per-element style cost itself is normal (selector matching was ~6% of style
time; no pathological rule).

---

## Fixes — page switches

### NAV-1 [fixed] `LiquidTabs` forced a full-page layout on mount

Its overflow-edge effect read `scrollWidth` synchronously in a mount effect. A
strip mounts as part of nearly every page switch, so this read laid out the
**entire incoming page** mid-commit — 120–330ms of every tabbed switch at 4×.
Edges are now measured in a `ResizeObserver` callback (which runs after the
frame's own layout, so the read is free); a selection change re-measures on the
next frame. Same behaviour, no forced layout.

### NAV-2 [fixed] Scroll restoration read `scrollY` mid-commit

`useScrollRestoration`'s cleanup ran in React's mutation phase — after the new
page's DOM was inserted — and read `window.scrollY` to remember the leave
position, forcing another layout. The offset is already known from the scroll
listener (every way it can change fires `scroll`), so the cleanup uses that. The
fresh-navigation reset also skips `scrollTo(0)` when the page is already at the
top.

### NAV-3 [fixed] Viewport prefetch re-armed inside the arriving page's first frames

After each navigation it re-scanned links 100ms (+200ms dwell) later; each
speculative `preloadRoute` inserts that route's stylesheet, restyling the page
that was still settling. It re-arms after **1.2s** now — after the page has
painted and its entrance finished.

### NAV-4 [fixed] The globe — phones' navigation — never preloaded anything

On a phone the liquid globe *is* the navigation, and none of the router's
intent preloading reached it: there is no hover, and the press lands on the
stage, not on a `<Link>`. A destination's code and data were only requested
after the 260–620ms dwell completed. Now a pin that **locks into the reticle**
(held for 90ms, so a flick through several pins doesn't warm each) preloads its
route. Verified at 390px: the destination's chunk and loader were fetched ~1.1s
before the dwell completed and the navigation used them. Skipped in the idle
rehearsal, for external links, and under Save-Data / `prefers-reduced-data`.

### NAV-5 [fixed] Below-the-fold content built inside the click

New primitive: **`components/ui/defer-on-navigate.tsx`**. On a client page
switch it renders a reserved block first, lets the top of the page paint, then
builds the wrapped subtree inside `startTransition` — which React *does*
time-slice. Never on SSR/hydration (no mismatch, first load already paints from
HTML) and never on back/forward (scroll restoration needs the content to exist).
Applied where the measurements pointed:

| Where | Deferred part | Why it's below the fold |
|---|---|---|
| Storefront (`/games`, `/apps`, `/create` galleries) | the mosaic grid | only when a hero card fills the first screen (`enabled={Boolean(hero)}`) |
| `/games` | the Arcade Pass panel | after the whole catalog; not deferred on a `?sub=` deep link |
| `/store` → Membership | everything after the pinned hero | the hero is 72–100svh; not deferred on a `?feature=` deep link |

`/library` was left alone: its sections reorder with the active filter, so no
single block is reliably below the fold.

### Results

Click → painted, medians of 3, same protocol back to back:

| 4× CPU + 100ms RTT | before (hover / tap) | after (hover / tap) |
|---|---:|---:|
| `/games` | 748 / 615 ms | **391 / 520 ms** |
| `/store` | 448 / 457 ms | **378 / 355 ms** |
| `/explore` | 637 / 502 ms | **382 / 534 ms** |
| worst switch | 748 / 615 ms | **425 / 534 ms** |
| median switch | 285 / 326 ms | 284 / 303 ms |

| 1× CPU (desktop) | before | after |
|---|---:|---:|
| `/games` | 100 ms | **70 ms** |
| `/store` | 94 ms | **24 ms** |
| median / worst | 55 / 100 ms | **41 / 70 ms** |

On a desktop every switch now paints within ~70ms. On a throttled phone the
heavy hubs roughly halved; light pages were already ~150–250ms and are within
noise. That is **not** "no lag at all" on a mid-range phone, and the remainder
is structural (below).

### What is left (not done here)

- **Leaving a big page costs too.** `/games` → anywhere tears down ~900
  elements: React unmount plus a restyle from sibling-sensitive selectors
  (`:not(:last-child)` spacers). It shows as ~100–300ms at 4× on the switch
  *away* from a hub.
- **The synchronous commit.** As long as the router's store update is
  `useSyncExternalStore`-driven, a page's above-the-fold render can't be
  time-sliced. `DeferOnNavigate` is the per-page lever; the remaining candidates
  are the home feed (`/`, ~300ms at 4×) and `/explore`'s discovery modules.
- **framer-motion `layoutId`** on the tab thumb measures layout on mount
  (~20ms at 1×). After NAV-1 it is the *first* layout read of the commit, so it
  is no longer duplicated work — but a CSS-only thumb would remove it.

---

## Fixes — first load

### LOAD-1 [fixed] `/explore` 307-redirected on every direct visit

The nav's own link is `/explore`, but its canonical form after `validateSearch`
was `/explore?q=&tab=top`, so the server answered every direct visit, reload and
shared link with a **307** and a second round trip before the page's first
byte. The defaults are stripped from the URL now (`stripSearchParams`), so
`/explore` is its own canonical address (200). The legacy `/search` redirect
went `/search` → `/search?q=&tab=top` → `/explore`; it is one hop now.

### LOAD-2 [fixed] In-app links to moved pages

Live UI still linked to pages that now redirect, so each click was two
navigations: the top-bar panel (`/wallet` → `/predictions`), the notifications
popover and its "See all" (`/notifications` → `/messages?tab=notifications`),
the `g n` / `g w` shortcuts, and the sidebar's "Show more" (`/blog` →
`/library`). Each now points at the real address.

### Not changed

Cold loads were otherwise consistent: TTFB 15–55ms locally, FCP ~0.4–0.6s at 1×
and ~0.9–1.1s at 4× + 100ms RTT. The ~70 `modulepreload` hints and the
render-blocking `globals.css` were already analysed in
[`performance-audit-2026-10-08.md`](./performance-audit-2026-10-08.md); nothing
here contradicts its conclusions.

---

## Debossed surfaces & the liquid-globe material

The globe is the reference object for the site's material: glass that sits *on*
the page, lit from above — a specular bloom, a bright rim, depth that rises.

### DEB-1 [fixed] Every field was a "recessed well"

`.glass-inset` — the tier for inputs, search fields **and every segmented-control
track** — was defined as "a hole in the glass": a dark inner shadow under the
top edge (`inset 0 1px 2px rgb(0 0 0 / .35)`) on the theme's darkest ink. On
Daylight that drew a grey crease along the top of every field and tab strip; on
Midnight every field was a black hole punched into the page. That is a deboss,
and it is the opposite of the globe's material.

It is a **flush fill** now: `color-mix(in srgb, var(--site-text) 5%,
var(--site-glass-tint-strong))` — it greys slightly off a light page and lifts
slightly off a dark one (Liquid Glass's field), with the half-strength hairline
and **no shadow**. One expression for every theme; the segmented track takes 7%
so the opaque thumb still separates. High contrast, reduced transparency and
print keep their own opaque treatments (unchanged, verified).

### DEB-2 [fixed] Slider track and the remaining "well" fills

The Slider's track carried its own dark inner shadow; removed. The vibe-page
form controls (`.vibe-app` inputs/selects) and the security report form used the
old well ink and now use the field fill.

### DEB-3 [enforced] It cannot come back by className

`design-consistency.test.ts` fails a site-tier `shadow-inner` or a dark
`shadow-[inset_…]` (black-based colour). A light inset *highlight* — the glass
glint — is allowed. Full-screen apps own their material (Slice It!'s neumorphism
is deliberate) and are out of scope.

### CON-1 [fixed] 61 hand-rolled boxes painted the box but not the material

Across the feed columns, profile/progress/streak/ranked/recap/wrapped panels,
explore recommendations, admin and settings panels, 61 surfaces were
`rounded-site border border-site-border bg-site-surface` — the same *box* as
`.glass-fill`, with none of its material (no rim glint, no noise, and nothing for
the degradation tiers to switch off). They are `.glass-fill` now. Ten hand-rolled
text fields (composer, group chat, persona chat, music guess, deck search,
schedule control, the predictions form) are `.glass-inset`. Buttons and toggles
that matched the same classes were left alone — they belong on `Button`, which
is a separate change.

### Checked

Daylight, Midnight and High contrast at 1280px (2× DPR close-ups of every field
and track on `/explore`, `/library`, `/liquid-glass`; full pages for `/settings`,
`/communities`, `/games`, `/predictions`), and a 390px pass for the switch
smoke test. No new console errors (a signed-out 401 from an API probe is
pre-existing).

---

## Part 2 — Slow networks, every device

The follow-up brief: try slow connections too; paint the page with what is
known and fill it in progressively; give every wait a loading state and every
arrival a smooth reveal; no layout shift; and make the networking hold up for
any visitor, browser, connection, device and screen.

### How it was measured

Same production build, now behind a small gzip proxy so the HTML crosses the
emulated link at production size (the local Nitro server sends it raw; Apache
deflates it in production: 115 KB → 20 KB). A filmstrip (Chrome screencast),
every layout shift with its source elements, first paint, and when pending
skeletons/spinners clear, for cold loads and page switches, across:

| Profile | CPU | RTT | Downlink | Width |
|---|---|---|---|---|
| High-res desktop | 1× | 40 ms | 50 Mbit/s | 2560 |
| Tablet on 4G | 2× | 100 ms | 9 Mbit/s | 768 |
| Phone on 3G | 4× | 300 ms | 1.6 Mbit/s | 390 |
| Low-end phone on 2G-class | 6× | 1200 ms | 250 kbit/s | 390 |

Content was seeded (12 users, 60 posts, communities, blog posts) so the
data-driven pages had something to load.

### What a slow connection showed

- **No layout shift on loads.** Server rendering paints pages complete, and
  the earlier CLS pass held: cold loads were 0 on every profile.
- **One shift on every switch away from Home** (SLOW-3, below).
- **Pop-in.** Text and layout paint long before images do (the default avatar
  landed ~5 s after first paint on 3G), and content that replaces a skeleton
  or spinner appeared in a single frame.
- **First paint is bandwidth-bound.** On 3G, 87 requests / ~580 KB start before
  first paint: ~83 KB of render-blocking CSS (70 KB of it `globals.css`, 77% of
  which is Tailwind utilities generated from every game and app) competing with
  ~80 `modulepreload` hints. Locally that is HTTP/1.1 with no prioritisation;
  in production Cloudflare serves HTTP/2+ and sends the CSS first, so local
  numbers are pessimistic here (see "Not done").

### SLOW-1 [fixed] Images fade in instead of popping in — site-wide

`lib/media-reveal.ts`: a pre-paint script installs one capture-phase
`load`/`error` listener and marks each `<img>` as its bytes land; `globals.css`
fades it from 0 to 1. Opacity only (cannot shift layout); no JavaScript means
nothing is hidden; reduced motion, the LCP image (`fetchpriority=high`), images
without a `src`, full-screen apps and `data-no-reveal` are exempt; print forces
full opacity. Verified: across 10 pages at 390 and 1440px, every loaded image
ends visible (none stuck at 0) and no page errors.

### SLOW-2 [fixed] Content that replaces a placeholder fades in — site-wide

`lib/swap-reveal.ts`, installed once from `Providers`: a `MutationObserver`
that, when a batch removes a `Skeleton`, `Spinner`/`RadialLoader`,
`[data-skeleton]` or `[aria-busy="true"]`, fades in (WAAPI, opacity only, 260ms)
the elements added to the same parent. That covers the ~200 `loading ?
<Skeleton/> : …` and Suspense-fallback sites without editing them. Bounded (24
elements per batch), skips route pending UI (the page entrance already
animates it), honours reduced motion and `data-no-reveal`. Verified firing on
the home feed and profile tab swaps under 3G.

### SLOW-3 [fixed] The shell jolted 14px on every switch away from Home

`RadialShell` keyed its home spacing on the URL, which changes the moment a
navigation starts, while the outgoing feed stays on screen until the next page
commits — so the still-visible feed shifted 14px for a frame (CLS 0.0146 on
every switch from `/`). It now keys on the router's `resolvedLocation`, which
moves with the commit. Page-switch CLS: **0.0146 → 0** on every route tested.

### SLOW-4 [fixed] One network policy, honouring the Data Saver setting

`lib/network-quality.ts` replaces five private readers of
`navigator.connection` for new code and the prefetchers: a connection class
(`offline` / `slow` / `moderate` / `fast` / `unknown`) from `effectiveType`,
the live `rtt`, and — for Safari and Firefox, which have no Network
Information API — the round trip this page load actually measured (its TCP
handshake). Before, those browsers always read as "fast".
**The site's own Data Saver setting was ignored** by both speculative
prefetchers (only the browser's Save-Data flag was read); `on` now stops them,
and `useDataSaver`'s `auto` uses the same classification. Speculation now also
stops on 3G (it already stopped on 2G). Unit-tested.

### SLOW-5 [fixed] Retries that only retry what can succeed

`lib/http.ts`: `HttpError` (status + Retry-After), `TimeoutError`, and
`fetchJson` with a connection-aware timeout (15/25/45 s), caller abort
composition and idempotent-only retries. The QueryClient's global policy now
retries transport failures, timeouts, 408/425/429 and 5xx — never another 4xx
— up to 2 times (3 on a 2G-class link) with exponential backoff, equal jitter
and the server's Retry-After honoured; offline, React Query pauses and resumes
on reconnect. The unused duplicate `HttpError`/`fetchJson` in
`hooks/useResource.ts` now re-exports these. Unit-tested.

### SLOW-6 [fixed] The default avatar was 27 KB

A 400×400 PNG preloaded on most pages and never shown above ~120 CSS px. Now
256×256, 32 colours: **9 KB**, visually identical, same URL (stored user
records keep working).

### Results

| Profile | Cold load CLS | Page-switch CLS | Page-switch feedback |
|---|---:|---:|---|
| 2560 desktop | 0 | 0 | content in ≤250 ms |
| 768 tablet, 4G | 0 | 0 | content in ~500 ms |
| 390 phone, 3G | 0 | 0.0146 → **0** | pending skeleton in ≤250 ms, content ~1–2 s |
| 390 low-end, 2G-class | 0 | 0 | pending skeleton immediately, content 7–11 s |

### Not done (and why)

- **First paint on 2G-class links is ~10 s.** It is bandwidth: render-blocking
  CSS (~83 KB) plus ~300 KB of JS module preloads on a 31 KB/s link. Two
  levers, both bigger than this pass:
  1. *Lower the module preloads' priority* (`fetchpriority="low"` keeps them
     parallel but behind the CSS). They are emitted by TanStack Start's
     `HeadContent` with no hook for attributes; patching the framework or
     rewriting the HTML outside React (hydration) is the cost.
  2. *Split `globals.css`.* 77% of it is Tailwind utilities generated from
     every game and app. Scoping `@source` per tier needs a second CSS entry
     for the full-screen tier.
- **Adaptive font preload via Client Hints** (`Save-Data` / `ECT`: skip the
  47 KB Inter preload on slow links; its fallback is metric-matched, so nothing
  reflows). Signed-out HTML is cached by `server/nitro/anon-html-cache.ts`, so
  varying the document by those headers needs the cache key to vary too.
- **Bare `fetch` in components.** Most data in the app is fetched in effects,
  not through React Query; those call sites don't get the retry policy until
  they move to `fetchJson`/`useResource`. New code should use them.
