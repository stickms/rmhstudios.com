# Page-Switch Lag, First-Load Redirects & Debossed Surfaces — 2026-10-09

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
> surfaces, `CON-x` material consistency. Code comments cite them.

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
