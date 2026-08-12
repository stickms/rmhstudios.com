# components/radial — the RMH Radial UI

The from-scratch radial front end and home of the **Radial Avant-Garde Glass**
design language (see [`docs/design-language.md`](../../docs/design-language.md)):
an Apple-Liquid-Glass-inspired, strict black-&-white, mobile-first system built
around a central **RMH** mark that elements animate radially out of — and, since
the wedge dial gave way to the **liquid globe** (see below), around a sphere you
turn. This module is the shell + homepage + motion system; it propagates to the
rest of the site
through the shared `--site-*` design tokens (retuned to high-contrast monochrome
in `app/globals.css`).

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | The feed as a gently-curved column on the **document's own scroll** (no inner scroll region — so mobile Safari collapses its toolbars). Cards flow at natural heights (variable, never overlapping) and are raked onto a shallow cylinder by a **scroll-driven CSS animation** (`animation-timeline: view()`, in `radial.css`), evaluated on the thread that owns the scroll so the curve cannot lag it. Two fallbacks, picked once on mount: a rAF window-scroll pass from cached offsets (no layout thrash) where the browser has no view timeline, and **no rake at all** on iOS WebKit, where a scroll event arrives after the compositor has already scrolled and a hand-driven pass can only draw a frame behind the column. Optional non-raked `lead` slot (the compose box). Reduced-motion / `perf-lite` → plain list. The haptic focus tick rides an IntersectionObserver line across the viewport's middle, not the rake. Fires `onEndReached` for lazy loading. |
| `RadialHub.tsx`      | The persistent navigator's **phase state machine** (closed → open → closing) and chrome. Tapping the fixed RMH orb sends it to the centre of the screen, where it **swells and dissolves into the liquid globe**; an expanding circular **veil** sinks the page behind it, and the foot capsule (identity · settings · sign out · close) rises. Consumes `lib/sidebar-nav`, honours auth/admin gating, owns Escape / outside-tap / focus restoration. The globe is mounted **only** while the menu is up.                                                                                                                                                 |
| `LiquidGlobe.tsx`    | **The navigator itself** — the destinations as pins on a glass sphere you turn to find where you want to go. Drag (pointer or finger) to spin, release to coast; magnetism eases the nearest destination into the **reticle** once the spin settles; **hold** with the pointer down and the reticle's ring fills; **let go once it is full** and you land there. Let go early, or drag away, and the ring drains — nothing navigates without a deliberate hold-and-release. **Poke it and it ripples** — a wave spreads from the point you touched and travels with the surface. Wireframe = one canvas, pins = JS-projected real links (click, Enter and screen readers all work without the gesture) — both from the same projection. See "The globe" below. |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed ring backdrop, slim utility top bar, the **three-track frame** (nav rail · `<main>` · live rail) and the hub. The backdrop layer paints **only** the rings and the blob field — the aurora canvas is the document's own `.site-aurora` element (rendered in `app/routes/__root.tsx`), so it drifts on its own compositor keyframes and is the one scene every `backdrop-filter` on the page samples. The rings used to drift against the pointer, driven by a `pointermove` listener and a rAF lerp mounted on **every** route; that went with the rest of the site's cursor reactivity (`docs/design-language.md` §5.1.1) and must not come back. |
| `RadialNavRail.tsx`  | Desktop-only left rail: the same `SIDEBAR_NAV` source of truth as the hub, shown persistently ≥1120px with live inbox/notification/admin badges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RadialLiveRail.tsx` | Desktop-only right rail (≥1440px): who's online, the daily loop, friends online, trending tags, who to follow — plus the slot a page's `PageLayout` `rightSidebar` portals into (`rail-slot.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `RadialSideFeed.tsx` | The home deck's second feed (≥1280px): Following · News · Games, with its own local cache so it never fights the singleton `feedStore` driving the wheel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `QuickPanel.tsx`     | Shell for the top bar's preview popovers — anchoring, viewport clamping (`useMenuViewportFit`), Escape / outside-press dismissal, focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `TopBarPanels.tsx`   | The four quick panels: search (live results), notifications, messages, and the account menu. Each previews, then links through to its full page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination). Leads with an inline `ComposeBoxLazy` (the first rmhark follows it); a floating compose button opens the full `ComposeModal`.                                                                                                                                                                                                                                                                                                                                                                                                           |
| `WheelCard.tsx`      | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `RmharkMedia.tsx`    | A post's pictures inside the card: up to four tiles, the rest summarised as "+N". Two rules are load-bearing — a lone image's aspect is **clamped** to 4:5…16:9 (the wheel is a glance; a 1:4 panorama would own three screens of it, and the full frame is one tap away on the post page), and every tile reserves a **numeric** aspect box before decode, because the wheel caches each card's document centre and a late image with no reserved box costs a re-measure of every mounted slot on top of the layout shift it causes. |
| `RmhLogo.tsx`        | The RMH mark — a 6-fold radial spirograph, path baked, drawn as line-art in `currentColor` (so it inherits the orb's accent-contrast ink) with `pathLength={1}` so the stroke-draw bloom is resolution-independent. |
| `rail-slot.tsx`      | The context carrying the live rail's DOM node, so a page's `PageLayout` `rightSidebar` can **portal** into it. A portal rather than lifting the node into shell state on purpose: a `setState(node)` in an effect re-runs on every render (the element is a fresh object each time) and loops forever. `null` during SSR and below the rail's breakpoint — callers must tolerate its absence. |
| `Parallax.tsx`       | Reusable **scroll**-linked parallax layer (framer-motion `useScroll` → GPU transforms; static under reduced motion). Scroll-linked, not pointer-linked — nothing on the site parallaxes to the cursor any more.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text comes from `--site-accent-fg`, which each theme/preset authors and `ensureReadableAccent()` contrast-checks. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card and **unpins sticky** headers/tabs/search so every `_site` route flows like the feed. It does **not** touch the material — the Liquid Glass classes render at full strength inside the shell.                                                                                                                             |

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

| Where               | What it did                                                                 | Now                                       |
| ------------------- | --------------------------------------------------------------------------- | ----------------------------------------- |
| Pointer             | A gooey drop rode under the mouse **as** the cursor (`MetaballCursor.tsx`). | The OS cursor, untouched                  |
| Hub dial            | The clip-path sectors melted into one liquid disc (`#rmh-liquid`).          | The dial itself is gone — see the globe   |
| Orb aura            | Orbiting blobs stretched and necked in and out of the orb's disc.           | Removed; the orb's own glass material     |
| Loading mark        | Orbiting blobs melted into a pulsing core (`#rmh-liquid-sm`).               | Plain discs, same motion                  |
| Backdrop blob field | Huge faint blobs drift, swell together and pull apart behind everything.    | **Unchanged** — soft gradients, no filter |

**Why.** An SVG filter is continuous GPU work: a filtered subtree whose children
animate cannot take the compositor fast path, so the whole filter graph re-runs
every frame over the whole filter region. The pointer drop was the worst case by
construction — it was the cursor, so it moved above **every** overlay on the
site, and Chromium invalidates a `backdrop-filter` as a _whole element_, not per
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

### The hub's frost is gone too, and for the same reason

The measurements above were taken over `.radial-hub__blur` — the hub's
viewport-covering `backdrop-filter`, which was affordable only for as long as
nothing moved above it. **The liquid globe moves above it, continuously**, which
is exactly the 10.6fps row of that table. So the layer is now
`.radial-hub__veil`: the same expanding circular reveal, painted as a radial
gradient of `--site-bg` instead of blurring the page. The frosted-glass material
still ships on the hub's **foot capsule**, which is small and sits still.

Do not "restore the frost" on `.radial-hub__veil`, and do not add a
`backdrop-filter` to any layer the globe paints over. Radius does not help — the
cost tracks the blurred layer's **area**, and `blur(6px)` measured 11.9fps.

The same rule stands for every other viewport-covering `backdrop-filter` on the
site (`.glass-scrim`): it is re-blurred in full whenever anything above it moves.
Nothing moves above those today. Don't be the one who puts a
continuously-animating element there.

## The globe (LiquidGlobe)

The wedge dial this replaced carved the disc into annulus sectors — it worked,
but it was a _list bent into a circle_: every destination visible at once, chosen
by pointing. The globe is the opposite bet. It is a place you **look around**,
and choosing is a deliberate physical act rather than a click you can misfire.

**The gesture, end to end.** Press anywhere on the **screen** — not just on the
sphere — and drag to spin it (yaw from horizontal travel, pitch from vertical,
tilt clamped so the poles never reach the front). Release and it coasts on
friction. When the coast is over, any
destination inside the **snap cone** is eased to dead centre — the magnetism is
what makes the gesture land on a phone. A pin inside the **reticle** is _locked
on_: it fills with the accent, the readout under the sphere names it, and while
the pointer stays **down** the reticle's ring fills over `DWELL_MS`. **Let go
with the ring full and you navigate.** Let go early, or drag the pin back out,
and the ring drains and nothing happens. There is no path from a stray touch to a
page load.

Rules that are easy to break when touching the geometry or the loop:

- **The control surface is the whole overlay, not the sphere.** The sphere is one
  disc in the middle of a screen the menu owns entirely, and the band around it —
  the title card, the empty space beside the globe, the foot capsule a thumb
  naturally rests on — is most of the reachable half of a phone. `LiquidGlobe`
  takes `surfaceRef` (the hub's overlay) and starts a drag from anywhere on it
  **except a control**: any `a`/`button`/field keeps its own press, so the foot's
  identity link, settings, sign-out and close still behave, and so will anything
  added there later. The one opt-back-in is `data-globe-surface` on the overlay's
  click-catcher, which is a `<button>` only so an outside tap dismisses. A drag
  that started on it is swallowed on the way up (`swallowClick`), so turning the
  globe never also closes the menu, while a plain tap still does.
- **One source of truth for the projection.** `PERSP` and `RETICLE` in
  `LiquidGlobe.tsx` are handed to CSS inline (`--globe-persp`, `--reticle-d`).
  The cage and the pins are now projected by the same code, so they cannot
  disagree about the sphere they are both describing; `--reticle-d` still has to
  be handed to CSS, because the drawn target must be the same circle the hit
  test locks in. Do not re-type either number in `radial.css`.
- **Project, then move, then paint — in that order.** The magnetism needs to know
  which pin is nearest the reticle _and_ it moves the globe in response, so the
  projection runs before it and the single paint after it. Painting inside the
  projection pass (with the paint gated on the dirty flag) is what made the pins
  freeze mid-snap while the wireframe kept turning under them.
- **The dwell ring is the custom property, not the counter.** The progress the
  visitor sees is `--fill` on the reticle; `fill.current` is only the number
  behind it, and the two can disagree, so `setFill` is the one thing allowed to
  move either. Writing the counter directly is what stranded the ring: the reset
  on a lock change assigned `fill.current = 0` on its own, the write below it was
  guarded on "did the value change" — which the reset had just made false — and a
  globe you had stopped holding, or turned away from, went on showing the arc it
  had reached. Losing the lock is deliberately **not** a reset: the ring is left
  to _drain_, which is the whole reason the drain rate is faster than the fill.
  Only a destination _arriving_ in the reticle starts from empty, so time spent
  on one place is never credited to the next.
- **A hold also ends when the window does.** `pointerup` and `pointercancel` are
  not guaranteed to arrive — a mouse released over another window, an alt-tab
  mid-press — and a hold that never ends fills the ring and arms it while nobody
  is touching anything. `blur` ends it, so the ring drains exactly as an early
  release makes it; it does not throw the globe, because there was no release to
  take a velocity from.
- **Pins are links, and the far hemisphere is not clickable.** Every pin carries
  its own `href` so click / Enter / a screen reader work without the gesture, and
  a release that has already been spent — on a drag past the slop threshold, or
  on a completed dwell — is swallowed on the way down so it cannot _also_ fire
  the anchor it happened to start on. Depth drives `pointer-events`, so a pin on
  the back of the sphere can never take a click meant for the one in front of it.
- **Keyboard focus turns the globe.** Focusing a pin glides the sphere until that
  pin faces you, which is why the hub moves focus to the globe's **root** on open
  rather than to the first pin — that would throw away the "you are here"
  orientation the moment the menu appeared.
- **Nothing may sit above a full-viewport `backdrop-filter`.** This is the thing
  that moves, continuously, and that is precisely the shape of the bug measured
  below. See the next section.
- **The physics is shared, not local.** The release throw, the magnetism and the
  keyboard glide all run through one interruptible spring from
  [`lib/fluid.ts`](../../lib/fluid.ts); the release velocity comes from a windowed
  `VelocityTracker` (a last-frame delta reads zero whenever a finger pauses before
  lifting, which is most deliberate re-aims); the destination a throw lands on is
  chosen from its PROJECTED resting orientation, not from where it stopped; and
  tilt past `PITCH_LIMIT` is rubber-banded rather than clamped. Retune the feel
  through those primitives — a second copy of the maths here is how the globe and
  the rest of the site would start to disagree. See `docs/design-language.md` §0.5.
- **The title card is fixed.** "RMH Presents / The Liquid Globe" does not change
  as you turn the sphere. The locked destination names itself AT the pin (the
  small-screen rules keep the locked pin's label even where the others are
  hidden), so the eye never has to leave the reticle, and a screen-reader-only
  live region carries the same information for non-sighted visitors.

### The ripple

Press the sphere and a wave spreads out across it from the exact point you
touched, swelling the wireframe as it passes, carrying a bright crest, and dying
as it converges on the far side (~1.15s end to end). It is the globe's answer to
being touched — the one thing on this screen that behaves like a body of liquid
rather than a picture of one.

Four things make it read as a wave in a ball rather than a circle drawn on a
screen, and each is easy to undo by accident:

- **The impact is stored in BODY space, not screen space.** The press is
  unprojected onto the near face (`lib/fluid` §unprojectSphere, a fixed-point
  inversion of the same perspective the renderer uses) and then un-rotated
  through the globe's current yaw/pitch (§unrotateSphere). Everything the frame
  loop samples — a cage ring's points, a pin's direction — lives in that space,
  so the wave is a mark on the ball: keep dragging and it travels with the
  surface it is crossing, and two pokes leave their waves where they were made.
  Store the impact in screen space and it hangs in front of the sphere instead.
- **The wave displaces the CAGE.** Each ring sample is pushed out along its own
  normal before it is projected, which on a unit sphere is just scaling the
  direction. The wireframe is the structure suspended in the glass, so a wave
  that swells the structure swells the ball. The crest stroke is the light on it,
  not the wave itself — it is deliberately only half ink (`--cage-ripple`); at
  full strength it stopped being a specular and became a hard black ring three
  times the weight of the equator, pulling the eye off the reticle.
- **It does not touch the hit test.** `project()` — what the lock, the snap cone
  and the dwell are all measured from — runs undisplaced; the swell is applied in
  the *paint*. A decoration must never be able to shake a destination into or out
  of the reticle under a finger that is holding on it.
- **It rides the existing frame loop.** No second rAF, no React state, no
  per-frame allocation: live ripples are a ref the loop reads, capped at three
  (newest wins), pruned in place, and `waveAt()` returns on an array-length check
  when nothing is rippling — so a visitor who only ever turns the globe pays one
  comparison per sample.

The wave's *shape* is `lib/fluid` §rippleWave, shared rather than local for the
same reason the spring and the rubber band are. It is a Ricker wavelet on a
quadratic decay: a crest flanked by shallow troughs, so the surface it crosses
rises, falls back below rest, and settles — a ripple, not a shockwave. Retune the
feel there, and it stays testable (`lib/__tests__/fluid.test.ts`) and available to
anything else that ever needs to answer a touch this way.

**Reduced motion stands it down completely** (OS preference or the account
toggle). An unrequested full-surface animation is exactly what that preference is
asking not to see; the press still turns the globe as it always did.

## What makes it smooth (measured — don't undo these)

Both signature interactions on this shell — turning the globe and scrolling the
feed — were reworked against a profiler rather than by intuition. Headless
Chromium, 390x844, 6x CPU throttling, production build, five repetitions,
median of the per-frame intervals:

|                               | before | after      |
| ----------------------------- | ------ | ---------- |
| globe drag, median frame      | 33.3ms | **16.7ms** |
| globe drag, frames over 33ms  | 76     | **46**     |
| feed scroll, median frame     | 33.3ms | **16.7ms** |
| feed scroll, 95th percentile  | 100ms  | **33.3ms** |
| feed scroll, frames over 33ms | 41     | **8**      |

Four things were paying for that, and each is worth recognising the shape of,
because none of them looked like a performance bug in the source:

1. **The wireframe was thirteen 3D-transformed elements.** A rotated 3D
   transform is the slow path for an antialiased elliptical border — nothing
   rasterised can be reused between frames. Interleaved A/B: hiding the cage
   exactly doubled the frame rate, and hiding anything else changed nothing. It
   is one canvas now (see the note above `MERIDIANS`).
2. **Reading the scroll offset in a `requestAnimationFrame`.** `window.scrollY`
   forces style and layout up to date, and rAF callbacks run in registration
   order — so a read scheduled after the feed's rake pass had written to every
   card bought a synchronous re-layout of the page, every frame. Three separate
   components were doing it (`BackToTop`, `useScrollRestoration`,
   `useSpatialParallax`), and together they were **over 80% of all JavaScript
   time during a feed scroll**. Read scroll offsets in the scroll EVENT, where
   the layout the browser just scrolled is still clean — or, better, don't read
   them: `BackToTop` is an `IntersectionObserver` on a sentinel now.
3. **Writing an inherited custom property to `<html>` on every frame.** It
   invalidates the computed style of the entire document. `useSpatialParallax`
   did it on every page, for an effect only the marketing pages render, so it
   is gated on a consumer being present.
4. **Writing styles that were not changing.** An inline assignment invalidates
   whether or not the value differs, and `will-change` additionally creates and
   destroys a compositor layer. The wheel wrote `transform`, `opacity` and
   `will-change` to every card in the feed on every frame; the globe rewrote
   `z-index`, `pointer-events` and an inherited `--near` on every pin. Both now
   compare before they write, and both narrowed what they iterate.

If you touch either loop, re-measure. The harness is nothing exotic: drive the
interaction with Playwright under `Emulation.setCPUThrottlingRate`, collect
`requestAnimationFrame` deltas in the page, and interleave the variants so the
container's own drift cannot be mistaken for a result.

**A second pass found a bigger one, and it was not in this directory**
([`docs/performance-audit-2026-08-01.md`](../../docs/performance-audit-2026-08-01.md)).
The globe still dragged at 4.4fps with 624ms of input latency while its own frame
loop measured **2.8ms** — ~66% of the profile was Chromium's own C++ style work.
The cause was a `pointermove` handler elsewhere on the page writing custom
properties to `<html>`: root custom properties are inherited by the whole
document and have no invalidation set, so each write rebuilt the computed style
of every element (~70ms of forced style+layout on `/store` at 4× throttle,
against ~0ms for the same write on a leaf). Globe-drag blocking time went
**23,732ms → 518ms** once the site's cursor reactivity was removed and the
aurora's offset moved onto the leaf that reads it. Two rules fell out of it, and
they bind everything here:

- **Never write an inherited custom property to `<html>` in a frame loop.** Give
  the value to the element that reads it.
- **A page's frame budget is global.** The globe was never the thing that was
  slow; a listener on an unrelated surface was. Profile the gesture, not the
  component you suspect.

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
  back-to-top). They share ONE ROW at every width — the FAB lane in `globals.css`
  §5.5x A.1 — with back-to-top stepping left by `--float-fab-lane`, the compose
  button's measured width, which `RadialFeed` publishes because CSS cannot
  derive it (icon-only below 560px, labelled above it, and the label is
  translated). It used to be stacked above the FAB instead, which put a solid
  disc in the middle of the right edge, inside the reading column, on top of
  whatever the page had there.
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
- **`__scrim` and `__catcher` are two different elements.** The decorative fade
  under the docked orb (`.radial-hub__scrim`, fixed, bottom-centre, a gradient of
  the page ground) and the overlay's transparent dismiss surface
  (`.radial-hub__catcher`, absolute, filling the overlay) shared one class name,
  and two single-class rules on one name overwrite each other rather than
  coexist: the catcher inherited the fade's `min(24rem, 92vw)` width, ~92px
  height and `translateX(-50%)` — a 359×92 box half off the left edge, which no
  outside tap could hit — while the fade inherited the catcher's
  `background: transparent` and painted nothing. Keep the names distinct. The
  catcher also needs `place-self: stretch`: the overlay is a
  `place-items: center` grid, and an absolutely positioned grid child still takes
  its container's alignment, so `inset: 0` alone shrink-wraps it.
- **Translucency needs a blur behind it.** The top bar drops `backdrop-filter` on
  phones for paint cost, so it is fully opaque there — a partly-transparent bar
  with no blur just ghosts the feed scrolling underneath it. Frosted glass
  returns with the blur at ≥768px.
