# components/radial — the RMH Radial UI

The from-scratch radial front end and home of the **Radial Avant-Garde Glass**
design language (see [`docs/design-language.md`](../../docs/design-language.md)):
an Apple-Liquid-Glass-inspired, strict black-&-white, mobile-first system built
around a central **RMH** mark that elements animate radially out of. This module
is the shell + homepage + motion system; it propagates to the rest of the site
through the shared `--site-*` design tokens (retuned to high-contrast monochrome
in `app/globals.css`).

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | The feed as a gently-curved column on the **document's own scroll** (no inner scroll region — so mobile Safari collapses its toolbars). Cards flow at natural heights (variable, never overlapping) and a rAF window-scroll pass rakes each onto a shallow cylinder from cached offsets (no layout thrash). Optional non-raked `lead` slot (the compose box). Reduced-motion → plain list. Fires `onEndReached` for lazy loading.                                                                                                                                                                                                                                                                                                |
| `RadialHub.tsx`      | The persistent navigator, a **phase state machine** (closed → centering → open → closing). Tapping the fixed RMH orb **glides it to the centre of the screen**, then opens the menu as an **expanding circular blur** with translucent clip-path sectors blooming around it. The dial is **double-decked** — two concentric rings of annulus sectors around a hole the orb sits in — because sixteen destinations on one ring gave slivers too narrow to label or hit. The two decks **spin into alignment from opposite directions** as it opens, and a hairline is drawn at every band boundary so the levels are separated by a border rather than by a gap. CSS-only; consumes `lib/sidebar-nav`, honours auth/admin gating. |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, the **three-track frame** (nav rail · `<main>` · live rail) and the hub. The backdrop layer paints **only** the rings — the aurora canvas comes from the document's own fixed layers (`body::before/::after`), so it drifts and parallaxes and is the one scene every `backdrop-filter` on the page samples.                                                                                                                                                                                                                                                                                                       |
| `RadialNavRail.tsx`  | Desktop-only left rail: the same `SIDEBAR_NAV` source of truth as the hub, shown persistently ≥1120px with live inbox/notification/admin badges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `RadialLiveRail.tsx` | Desktop-only right rail (≥1440px): who's online, the daily loop, friends online, trending tags, who to follow — plus the slot a page's `PageLayout` `rightSidebar` portals into (`rail-slot.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `RadialSideFeed.tsx` | The home deck's second feed (≥1280px): Following · News · Games, with its own local cache so it never fights the singleton `feedStore` driving the wheel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `QuickPanel.tsx`     | Shell for the top bar's preview popovers — anchoring, viewport clamping (`useMenuViewportFit`), Escape / outside-press dismissal, focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `TopBarPanels.tsx`   | The four quick panels: search (live results), notifications, messages, and the account menu. Each previews, then links through to its full page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination). Leads with an inline `ComposeBoxLazy` (the first rmhark follows it); a floating compose button opens the full `ComposeModal`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `RmharkCard.tsx`     | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `Parallax.tsx`       | Reusable scroll-linked parallax layer (framer-motion motion values → GPU transforms).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text comes from `--site-accent-fg`, which each theme/preset authors and `ensureReadableAccent()` contrast-checks. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card and **unpins sticky** headers/tabs/search so every `_site` route flows like the feed. It does **not** touch the material — the Liquid Glass classes render at full strength inside the shell.                                                                                                                                                                                                    |

## The desktop frame

Mobile is, and stays, one column. Wide screens get a three-track CSS grid —
**nav rail · content · live rail** — declared in `radial.css` as
`.radial-frame`, with the tracks appearing at the width that actually affords
them:

| Width    | Frame                                   | Content column           |
| -------- | --------------------------------------- | ------------------------ |
| < 1120px | one track                               | page's own `targetWidth` |
| ≥ 1120px | nav rail + content                      | grows to ≥ 44rem         |
| ≥ 1440px | nav rail + content + live rail          | grows to ≥ 50rem         |
| ≥ 1800px | the same, wider rails, frame cap 116rem | grows to ≥ 58rem         |

Three rules keep it honest:

1. **Tracks, not floats.** A rail is a grid item, so it is laid out _inside_ its
   track by construction — it cannot ride over the content. Every track is
   `minmax(0, …)`, so an overlong child shrinks its own column instead of
   pushing a neighbour out of the frame.
2. **Hidden means removed.** A rail below its breakpoint is `display: none`, so
   it leaves the grid entirely, and the matching `grid-template-columns` is
   declared in the same media query that reveals it. Track count and visible
   rails can never disagree.
3. **The frame is capped** (`--rad-frame-max`). Filling the window means filling
   it with _content_ — a nav rail, a reading column, a live rail, and on home a
   second feed — not stretching one column across a 34-inch display.

Both rails are `position: sticky` and own their own scroll. That is deliberate:
the "de-stick content pages" rules at the bottom of `radial.css` unpin
everything a _page_ renders so it flows like the feed, but the rails are shell
chrome, and a rail that scrolls away is just a header.

## How it wires in

- `components/feed/SiteShell.tsx` (stable `children`/`overlays` API, still
  rendered by `app/routes/_site.tsx`) now delegates to `RadialShell`, so **all**
  `_site` pages inherit the radial chrome and the monochrome tokens.
- `app/routes/_site/index.tsx` (`/`) renders `RadialFeed`.
- The old shell nav (`SiteNavigation`/`MobileDock`) and `FeedLayout` were
  removed — the radial hub and feed replace them.

## The metaball layer (removed — do not bring it back)

This module used to carry a **metaball** layer: SVG goo filters (blur → steep
alpha ramp, so nearby opaque shapes fuse with a smooth neck) that made the
chrome behave like a body of liquid. It is gone, and the whole of it is gone:

| Where               | What it did                                                                   | Now                                        |
| ------------------- | ----------------------------------------------------------------------------- | ------------------------------------------ |
| Pointer             | A gooey drop rode under the mouse **as** the cursor (`MetaballCursor.tsx`).   | The OS cursor, untouched                   |
| Hub dial            | The clip-path sectors melted into one liquid disc (`#rmh-liquid`).            | Crisp sectors                              |
| Orb aura            | Orbiting blobs stretched and necked in and out of the orb's disc.             | Removed; the orb's own glass material      |
| Loading mark        | Orbiting blobs melted into a pulsing core (`#rmh-liquid-sm`).                 | Plain discs, same motion                   |
| Backdrop blob field | Huge faint blobs drift, swell together and pull apart behind everything.      | **Unchanged** — soft gradients, no filter  |

**Why.** An SVG filter is continuous GPU work: a filtered subtree whose children
animate cannot take the compositor fast path, so the whole filter graph re-runs
every frame over the whole filter region. The pointer drop was the worst case by
construction — it was the cursor, so it moved above **every** overlay on the
site, and Chromium invalidates a `backdrop-filter` as a *whole element*, not per
damaged rect. Measured headless at 1920×1080 over the open hub
(`.radial-hub__blur`, `inset: 0`, `blur(20px) saturate(118%)`), vsync on:

| above the open menu                     | fps  | p50 frame |
| --------------------------------------- | ---- | --------- |
| nothing moving                          | 60.2 | 16.7ms    |
| a plain 24px dot wiggling in a 50px arc | 10.7 | 99.9ms    |
| the pointer metaball                    | 10.6 | 100.0ms   |
| the same, no `backdrop-filter`          | 60.1 | 16.7ms    |

Damage size and position are irrelevant; only the blurred layer's **area** is,
and radius barely matters (`blur(6px)` still measured 11.9fps) — so it was never
tunable, and `will-change` / `isolation` / promotion hints did nothing. The drop
was mitigated by standing it down under every full-screen scrim, which is a lot
of machinery to make a decoration not be a bug. Removing it deletes the problem.

The rules that survive it, all still live:

1. **Never put `filter: url(…)` on a full-viewport layer**, least of all one with
   animating children. The backdrop blob field carried a wide goo
   (`#rmh-liquid-lg`) and pinned every desktop `_site` page at **~15fps**:
   16.7ms/frame without it vs 66.7ms with (83.4ms p95). It is fused by the blobs'
   own soft-edged radial gradients instead — free, and closer to the intended
   look than hard-edged discs were.
2. **Never chain a CSS filter function after a `url()` reference.** `filter:
   url(#goo) drop-shadow(…)` reads like a cheap shadow over a cheap filter and is
   anything but: measured with vsync off, the `url()` alone runs at ~0.4ms/frame,
   while with the chain a 1-second `setInterval` did not fire once in **10
   seconds** — the main thread was blocked outright. Extra passes go inside the
   `<filter>` as primitives.
3. **A goo ramp only fuses OPAQUE shapes.** The ramp maps alpha
   `a → ramp·a − (ramp−1)/2`, so anything under ~50% alpha is clamped to nothing
   and the filter silently becomes a no-op — which is why the backdrop field's
   cost went unnoticed for so long: at 7% ink it produced pixel-identical output
   to no filter at all. If you want soft, use a gradient.
4. **Never filter an ancestor of fixed chrome.** `filter` creates a containing
   block for `position: fixed` descendants and a new stacking context. Nothing
   filters `.radial-shell`.
5. **The cursor is the platform's.** Do not paint a pointer on the page, and do
   not set `cursor: none` document-wide. Per-element cursors (`pointer` on a
   control, `text` in an editor, `grab` on a drag handle) are unaffected — it is
   blanking the real one, so a page has to redraw it, that is banned.

Rules 1, 2 and 5 are CI-gated by `lib/__tests__/filter-cost-budget.test.ts`.

One live consequence to keep in mind: a viewport-covering `backdrop-filter`
(`.glass-scrim`, `.radial-hub__blur`) is still re-blurred in full whenever
anything above it moves. Nothing moves above them today. Don't be the one who
puts a continuously-animating element there.

## The dial (RadialHub)

Two rules that are easy to break when touching its geometry or motion:

- **One source of truth for the radii.** `RINGS` in `RadialHub.tsx` defines the
  bands; the drawn boundary hairlines and the mask that carves the centre hole
  are both derived from the radii the component actually used, and handed to CSS
  inline. Do not re-type those numbers in `radial.css` — a hairline sitting where
  the bands are not is invisible until someone opens the menu.
- **The decks spin, so the bed shows.** Opening counter-rotates the two rings
  into alignment (inner anticlockwise, outer clockwise), which uncovers large
  wedges of the dial's own background mid-animation. That background must stay a
  light plate: it used to be `--site-border-bright`, pure black in the default
  theme, which the sectors covered at every frame while they only scaled — once
  they rotate, the whole dial flashes black on open. The spin is deliberately
  un-staggered (every wedge in a ring shares one delay) so a ring turns as a
  body; the per-wedge stagger stays on opacity alone.

## Design rules (same as the rest of the app)

- Colour/radius/shadow only via `--site-*` tokens — never hardcode. The default
  theme is strict B&W (ink accent, no hue) rendered in the Liquid Glass material:
  surfaces are translucent tints over the aurora canvas, not flat paper.
- Motion is `transform`/`opacity` only, GPU-composited, and always has a
  `prefers-reduced-motion` fallback.
- Mobile-first: base CSS targets phones; `@media (min-width: …)` layers on
  space. Nothing may leave the viewport — verify the hub bloom and wheel on a
  320px-wide screen when changing geometry.

## Overlap safety bounds

Nothing here is left to "it looks fine at the widths I tried". Where overlap can
be made structurally impossible it is (grid tracks for the frame and the home
deck, `minmax(0, …)` on every track, `min-width: 0` on every flex child,
line-clamps and `overflow-wrap: anywhere` on every text slot that takes user
content). What is left is the **fixed** chrome, which by definition sits outside
the flow, so `radial.css` ends with a section of explicit arithmetic guarantees:

- The bottom-right corner holds two floating controls on a feed page (compose +
  back-to-top). The mobile floating-bottom stack (`globals.css` §5.5x A.1) stops
  at 768px, so above it back-to-top is lifted by `--rad-compose-lift`.
- Any full-height desktop panel — the live rail's scroll area, the home deck —
  stops `--rad-corner-reserve` short of the viewport bottom, so a floating
  control can never land on one.
- Page content clears the hub orb via `--site-floating-reserve`, which is
  derived from the orb's own size/inset tokens rather than a guessed clamp.
- Quick panels are clamped twice: a CSS cap that holds before measurement, then
  `useMenuViewportFit` for safe areas and the mobile URL bar.
- `.radial-shell` is `overflow-x: clip` (not `hidden` — `hidden` would make the
  shell a scroll container and break `position: sticky` for the top bar and both
  rails) as a last-resort guarantee that nothing inside it can scroll the
  document sideways.

## Mobile contracts (easy to break — check these when changing the chrome)

- **Safe area.** Every bottom-anchored fixed element here (the orb, the hub's
  foot pill, the feed's compose FAB) adds `env(safe-area-inset-bottom)` itself.
  The site sets `viewport-fit=cover`, and the body's safe-area padding does
  **not** apply to `position: fixed` — so anything that skips the inset lands in
  the iOS home-indicator gesture strip and gets hard to tap.
- **The floating-bottom stack.** The orb carries `data-floating="hub"` and is the
  BOTTOM member of the mobile stack defined in `app/globals.css` §5.5x A.1; the
  cookie bar, mini-player and back-to-top all lift above it. Its footprint comes
  from `--site-hub-orb-size` / `--site-hub-orb-inset` (declared in `globals.css`
  precisely so the stack's reserve and the orb geometry can't drift apart) —
  change the orb's size or inset **there**, not here. Any new fixed
  bottom-anchored control must join the stack rather than pick its own `bottom`.
- **No document scroll-lock.** The hub blocks background scroll with
  `touch-action: none` on its overlay plus a `wheel` guard — never
  `body { overflow: hidden }` or the `position: fixed` body technique. Both clip
  the document to the visual viewport, which on iOS clips away the content that
  normally scrolls under Safari's floating bottom bar and leaves a stray band of
  bare page background there. This was an on-device finding from the mobile
  push-drawer the hub replaced, which blocked background scroll from its scrim
  for the same reason; the drawer is gone, so the note lives here now.
- **Translucency needs a blur behind it.** The top bar drops `backdrop-filter` on
  phones for paint cost, so it is fully opaque there — a partly-transparent bar
  with no blur just ghosts the feed scrolling underneath it. Frosted glass
  returns with the blur at ≥768px.
