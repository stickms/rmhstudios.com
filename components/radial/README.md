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

## Current material contract

The October 21 liquid-glass replacement is documented in
[`docs/liquid-glass-system.md`](../../docs/liquid-glass-system.md). It supersedes
historical lens/sheen and blanket cursor-retirement notes below. The scene
backdrop stays still; bounded surface-local lighting and nearby tap waves use
one document runtime. The navigator now has an independent dielectric coat and
a shared local contact indentation for cage/pins, with CSS and preference
fallbacks. Historical compositor measurements still explain the blur budgets;
they do not validate the replacement on native hardware.

## Files

| File                 | Role                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RadialWheel.tsx`    | A stable column on the **document's own scroll** (no inner scroll region, so mobile Safari collapses its toolbars). Cards flow at natural heights with no scroll-linked transforms or per-card promotion. The glass travels with its DOM content in every engine. Optional `lead` slot for the compose box. IntersectionObservers handle the haptic focus tick and `onEndReached` pagination.                                                                                                                                                                                                                                                                                                                                                                  |
| `RadialHub.tsx`      | The persistent navigator's **phase state machine** (closed → open → closing) and chrome. Tapping the fixed RMH orb sends it to the centre of the screen, where it **swells and dissolves into the liquid globe**; an expanding circular **veil** sinks the page behind it, and the foot capsule (identity · settings · sign out · close) rises. Consumes `lib/sidebar-nav`, honours auth/admin gating, owns Escape / outside-tap / focus restoration. The globe is mounted **only** while the menu is up.                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `hub-handoff.ts`     | The hub's hand-off to the Globe Eversion as a React-free state machine: who navigates, when the hub may react to input, and the fallback to today's navigation. See _Globe Eversion_ below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `eversion/`          | The effect's components: `EversionBridge` (lazy entry), `EversionOverlay`, `useEversionController`, `useBeforeCapture`, `eversion.css`, and the admin-only `lab/` harness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `LiquidGlobe.tsx`    | **The navigator itself** — the destinations as pins on a glass sphere you turn to find where you want to go. Drag (pointer or finger) to spin, release to coast; magnetism eases the nearest destination into the **reticle** once the spin settles; **hold** with the pointer down and the reticle's ring fills; **let go once it is full** and you land there. Let go early, or drag away, and the ring drains — nothing navigates without a deliberate hold-and-release. **Poke it and it ripples** — a wave spreads from the point you touched and travels with the surface. Wireframe = one canvas, pins = JS-projected real links (click, Enter and screen readers all work without the gesture) — both from the same projection. See "The globe" below.                                                                                                                                                                                                              |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed ring backdrop, slim utility top bar, the **three-track frame** (nav rail · `<main>` · live rail) and the hub. The backdrop layer paints **only** the rings and the blob field — the aurora canvas is the document's own `.site-aurora` element (rendered in `app/routes/__root.tsx`), so it drifts on its own compositor keyframes and is the one scene every `backdrop-filter` on the page samples. The rings used to drift against the pointer, driven by a `pointermove` listener and a rAF lerp mounted on **every** route; that went with the rest of the site's cursor reactivity (`docs/design-language.md` §5.1.1) and must not come back.                                                                                                                                                                                                                                                          |
| `RadialNavRail.tsx`  | Desktop-only left rail: the same `SIDEBAR_NAV` source of truth as the hub, shown persistently ≥1120px with live inbox/notification/admin badges.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RadialLiveRail.tsx` | Desktop-only right rail (≥1440px): who's online, the daily loop, friends online, trending tags, who to follow — plus the slot a page's `PageLayout` `rightSidebar` portals into (`rail-slot.tsx`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `RadialSideFeed.tsx` | The home deck's second feed (≥1280px): Following · News · Games, with its own local cache so it never fights the singleton `feedStore` driving the wheel.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `QuickPanel.tsx`     | Shell for the top bar's preview popovers — anchoring, viewport clamping (`useMenuViewportFit`), Escape / outside-press dismissal, focus.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `TopBarPanels.tsx`   | The four quick panels: search (live results), notifications, messages, and the account menu. Each previews, then links through to its full page.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `RadialFeed.tsx`     | The home feed — drives `RadialWheel` off the shared `feedStore` (streamed first page, live SSE, lazy pagination). Leads with an inline `ComposeBoxLazy` (the first rmhark follows it); a floating compose button opens the full `ComposeModal`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `WheelCard.tsx`      | The compact monochrome feed unit (rmhark or platform announcement).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `RmharkMedia.tsx`    | A post's pictures inside the card: up to four tiles, the rest summarised as "+N". Two rules are load-bearing — a lone image's aspect is **clamped** to 4:5…16:9 (the wheel is a glance; a 1:4 panorama would own three screens of it, and the full frame is one tap away on the post page), and every tile reserves a **numeric** aspect box before decode, because the wheel caches each card's document centre and a late image with no reserved box costs a re-measure of every mounted slot on top of the layout shift it causes.                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `RmhLogo.tsx`        | The RMH mark — a 6-fold radial spirograph, path baked, drawn as line-art in `currentColor` (so it inherits the orb's accent-contrast ink) with `pathLength={1}` so the stroke-draw bloom is resolution-independent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `rail-slot.tsx`      | The context carrying the live rail's DOM node, so a page's `PageLayout` `rightSidebar` can **portal** into it. A portal rather than lifting the node into shell state on purpose: a `setState(node)` in an effect re-runs on every render (the element is a fresh object each time) and loops forever. `null` during SSR and below the rail's breakpoint — callers must tolerate its absence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `Parallax.tsx`       | Reusable **scroll**-linked parallax layer (framer-motion `useScroll` → GPU transforms; static under reduced motion). Scroll-linked, not pointer-linked — nothing on the site parallaxes to the cursor any more.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `radial.css`         | All radial styling. Every colour is a `--site-*` token (theme-safe); accent text comes from `--site-accent-fg`, which each theme/preset authors and `ensureReadableAccent()` contrast-checks. Mobile-first and viewport-safe. Its final section radialises **content pages** too: it flattens PageLayout's `.page-heading` card and **unpins sticky** headers/tabs/search so every `_site` route flows like the feed. It does **not** touch the material — the Liquid Glass classes render at full strength inside the shell.                                                                                                                                                                                                                                                                                                                                                                                                                                               |

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
  the _paint_. A decoration must never be able to shake a destination into or out
  of the reticle under a finger that is holding on it.
- **It rides the existing frame loop.** No second rAF, no React state, no
  per-frame allocation: live ripples are a ref the loop reads, capped at three
  (newest wins), pruned in place, and `waveAt()` returns on an array-length check
  when nothing is rippling — so a visitor who only ever turns the globe pays one
  comparison per sample.

The wave's _shape_ is `lib/fluid` §rippleWave, shared rather than local for the
same reason the spring and the rubber band are. It is a Ricker wavelet on a
quadratic decay: a crest flanked by shallow troughs, so the surface it crosses
rises, falls back below rest, and settles — a ripple, not a shockwave. Retune the
feel there, and it stays testable (`lib/__tests__/fluid.test.ts`) and available to
anything else that ever needs to answer a touch this way.

**The site's Reduce motion switch stands it down completely** (since 2026-10-21
the OS preference does not: the owner asked for the motion to play by default).
The press still turns the globe as it always did.

### The dough body

Grab the globe and it gives like dough (2026-10-22: it used to "morph like a
stretchy ball … I want it to truly morph like little bits at a time almost like
dough"). The first soft body (2026-10-21) was three global springs around one
Gaussian: it had no memory of _where_ material had been pushed, so the only thing
it could do was stretch as a whole. The replacement keeps its state in space.

- **A displacement field, not a few springs.** `lib/dough.ts` holds the in-plane
  displacement `u(x)` of every piece of material on a 48×48 grid, in two layers:
  an **elastic** one (a damped spring that rebounds, so a release wobbles a
  little) and a **plastic** one (held strain flows into it and it eases out over
  ~1.4s, so a dent outlives the finger). A press pushes material _out of_ the
  contact and banks it up around it. Height is derived, `h = −0.12·∇·u`, so volume
  is conserved by construction (asserted in `lib/__tests__/dough.test.ts`). A drag
  grips the material under the finger and carries it: it piles up ahead and leaves
  a groove behind, which is what the plastic layer remembers.
- **One field, three readers.** The paint pass samples it on the CPU at the points
  it already draws (`DoughBody.deform`: every cage sample, the ripple crest, every
  pin; the same call the old body had, so the callers did not change). The coat
  shader reads the same field as a half-float texture and inverts it per pixel, so
  the **silhouette bulges** past the rest limb and the lighting wraps every dent.
  The CSS disc no longer takes an affine transform and no longer clips.
- **Free at rest.** `step()` says whether the body is deformed; only then does the
  loop repaint for it. The field upload is skipped unless its `version` changed.
- **Display only**, like the ripple and the wobble: `project()` never reads it, so
  a squeeze cannot move a destination into or out of the reticle.
- The canvas hangs outside the disc by 11% of its diameter (`JELLY_BLEED`, the same
  fraction as the cage) so the silhouette has somewhere to go.
- The stage's box is read once per press, never in the frame loop; the finger's
  velocity is the drag's own (`VelocityTracker`), so nothing new listens.

### The material (jelly glass)

The ball reads as thick, gelatinous glass (2026-10-21: "more jelly refractive
reflective like a gelatinous glass surface"). Two halves, split by what each is
cheapest at:

- **Refraction is geometry** (`lensScale` in `LiquidGlobe.tsx`). Everything
  behind the front face — the far half of the cage, the far pins, a crest on the
  back — goes through a ball-lens remap that magnifies the middle and crowds the
  rim, growing with depth (identity at the limb, so the cage never tears). One
  division per back-face sample; the lines stay vector-crisp. Display only.
- **Light is a shader** (`jelly-glass.ts`, its own lazy chunk, ~3 KB gzip):
  a softbox reflection and sky placed in reflection space, Fresnel, a hard
  glint plus a kicker, a hairline at the limb with an absorption band inside it,
  the room seen upside-down through the ball, a crescent caustic on the far inner
  rim, and the theme accent as the jelly's subsurface tint. Ripples bend its
  normals (the light runs over the wave) and the dough field's height tilts them
  too, so a press dimples the glint and a drag smears a groove through it.
- **It refracts the page** (2026-10-22: "the same effect"). The glass engine keeps
  a snapshot of the page taken while it was idle, i.e. before the hub opened
  (`lib/liquid/glass/scene-store.ts`); the coat samples it through a ball-lens
  model (inverted, magnified, slightly dispersed) at mip level 5, to match the
  hub's 20px blur, driven by the surface normal so it warps with every dent. It is
  placed (a layout read) when the globe attaches, finishes blooming, resizes, or a
  new picture lands, never per frame.
- **It costs nothing at rest or while spinning.** A uniform glass ball looks the
  same at any rotation, so the shader is redrawn only while the surface moves (a
  ripple, the dough body) plus the frame it settles on, and never during the
  eversion. Measured: 0 GL draws idle, ~70 over a poke's whole life; the CSS
  sheen's infinite animation is retired while the material is up.
- **One GL context per page**, shared by every mount; the idle rehearsal builds
  it, so the real open never compiles a shader. The stage only drops the CSS
  glass (`data-jelly="on"`) after the first frame is drawn, and a lost context
  hands back to it.
- **Not everywhere.** High contrast, reduced transparency (setting or media
  query), `prefers-contrast: more`, `perf-lite` and no-WebGL keep the CSS glass;
  refraction applies in all of them. Reduced motion keeps the material, static.

## Globe Eversion (the hub's navigation transition)

> **The ending is one movement (2026-10-18).** The canvas dissolves onto the live page during UNWRAP's last 200 ms and
> ends with it. While a run owns the page `html.eversion-live` (eversion.css) holds the shell layers sharp and
> transition-free, because the hub otherwise keeps them at `blur(20px)` until its phase leaves `everting` (the old
> "glitchy extra step": a fade onto a blurred page, then a pop). The compose button and the orb come in with the
> dissolve. AFTER is captured only once the destination is settled (`lib/eversion/settle.ts`).

Confirming a destination in the hub can play a one-shot WebGL2 transition instead
of the veil-and-navigate: the current page **WRAPs** onto the liquid globe through
a map projection, the globe performs Thurston's corrugated sphere **EVERSION**
with the destination on the inside, the destination **UNWRAPs** onto the live
page, where the effect **ends** (there is no stage after UNWRAP: the AFTER page is
flat and full-screen and the canvas hands off to the identical live page).
It is **on** for every visitor (`EVERSION_ENABLED = true`), enabled by the owner
ahead of the device lab (T38) and visual sign-off (T28); set it back to `false`
to restore today's navigation site-wide.

**Pointers.** The module map, conventions, the ending, router/fault cases and
render-side robustness live in [`lib/eversion/README.md`](../../lib/eversion/README.md);
the decisions, timeline maths, capture rules and the 46 numbered tests (`S#n`)
are in the spec,
[`docs/plans/2026-10-17-globe-eversion.md`](../../docs/plans/2026-10-17-globe-eversion.md),
with the task plan beside it. The components here are in `eversion/`
(`EversionBridge`, `EversionOverlay`, `useEversionController`,
`useBeforeCapture`, `eversion.css`, the `lab/` harness).

### How the hub hands off

- **Entry points.** A release of the drag on a pin (`release`), a click or tap
  on a pin (`click`), and Enter on the focused pin (`enter`). Settings >
  Appearance > Preview runs the same effect without navigating (`preview`).
- **`hub-handoff.ts` decides who navigates.** It is a plain state machine (unit
  tested without React): one hand-off at a time, checked before eligibility;
  the hub flips to its `everting` look only at the controller's commit, so every
  earlier failure is **today's navigation, untouched** and has nothing to undo.
  There is no fallback that adds a visible delay: no controller, no WebGL2,
  reduced motion, a render host or BEFORE capture that is not ready yet all
  answer immediately with the ordinary dismiss-and-navigate.
- **It always plays in full** (amended 2026-10-20; it used to fast-forward on
  input). No tap, click or key speeds it up, before `start` or after it: a tap
  while the destination rendered was queued and ran the whole animation in
  650 ms. While a run is `busy`, the hub's close / toggle / Escape do nothing.
- **Back/forward never animates.** A traversal during priming reports
  `traversal` and the hub just closes; mid-run it aborts with a crossfade onto
  the live page. A run always ends: a stall watchdog force-ends it with a fade.
- **Reduced motion** (OS or the account toggle) runs today's veil-and-navigate
  fade unchanged, never the effect. `perf-lite` runs it at the minimum tier.
- **The orb returns through the hub's ordinary closed-state fade.** It is hidden
  during the run (`data-phase='everting'`, `opacity` + `pointer-events` only, so it
  never moves) and fades back in (`opacity 0.34s ease`, the base `.radial-hub__orb`
  rule) when the hub goes `closed` at `done`: the live page is already showing, so
  there is no globe to crossfade with and no hard cut. An aborted or context-lost
  run gets the same fade.

### The flag, the settings row and the lab

- **`isEversionEnabled()`** (`lib/eversion/flags.ts`) is
  `EVERSION_ENABLED || ?eversion`. The query override is **latched once per page
  load**, because the router drops the param on the first client navigation. It
  is honoured in production too, so QA can opt in while the constant is `false`;
  whether it survives the flip is a deliberate T39 decision. **`?eversion-debug`**
  (`isEversionDebugEnabled()`) loads the debug surface (`window.__eversion`) and
  appears in no static closure otherwise.
- **Settings row.** `NavTransitionRow` in `components/settings/AppearancePanel.tsx`
  (Settings > Appearance) is **hidden while the flag is off**. When on it offers
  the projection (Random, Mercator, Peirce quincuncial, stereographic, Lambert
  azimuthal, equirectangular) with **Random as the default** (it never repeats the
  previous projection) plus a Preview button. After the flip, confirm the row is
  visible, defaults to Random, persists and previews (tasks T39 acceptance).
- **"Globe eversion" (the eversion level, 2026-10-21).** A select under "Navigation transition"
  (`EversionLevelRow`; same flag and Reduce-motion rules): **Every navigation** (default) or **Only the liquid
  globe**. At the second, `eversion-nav.ts` lets every navigation that does not start from the hub through untouched
  (no hold, no pop-up globe, no added latency; plain `<a>`s are left to the browser) and only hub-confirmed
  navigations (hold-release, pin click, Enter, anything asked for while the hub is open) run the effect. The level
  is read per navigation, so switching it needs no reload. Page navigations only: the per-control press animation is
  separate. Stored as `eversionLevel` (account column + `rmh-eversion-level` cache; absent = `all`). Spec amendment
  2026-10-21 (f).
- **"Always evert globe" (removed from Settings 2026-10-21).** A switch next to the transition picker
  (`AlwaysEvertRow` in `AppearancePanel.tsx`; hidden while the flag is off, disabled
  with a hint while reduced motion is on) that forces the effect on devices where it
  is normally skipped to keep navigation fast: a host still starting, a BEFORE
  picture not ready, a slow overlay. It lengthens those bounded waits and never
  overrides reduced motion, WebGL2, back/forward or a busy runner. Stored as
  `alwaysEvertGlobe` (account column + `rmh-always-evert-globe` cache), default off.
  The gate-by-gate table is in
  [`lib/eversion/README.md`](../../lib/eversion/README.md).
- **Lab route `/eversion-lab`.** The device-lab and e2e harness
  (`app/routes/eversion-lab.tsx`, `eversion/lab/`): `noindex`, in no sitemap or
  nav, **admin-gated**. `EVERSION_LAB_OPEN=1` skips the admin check for the e2e
  runs, and only outside a production build (`labAccessAllowed`); in production
  it is ignored.

### Rules that bite

- Everything heavy (capture library, render host, prefetch) sits behind
  `EversionBridge`, loaded with `React.lazy` after the hub's idle window. The
  hub's static imports are the flag and nothing else; the bundle-budget gate
  enforces it.
- The effect is a dark launch: with the flag off, nothing here changes any
  visitor's navigation (the flag-off e2e proves it).

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
- **Nothing paints behind the docked orb.** There was a decorative legibility
  fade under it (`.radial-hub__scrim`, fixed bottom-centre, a radial gradient of
  the page ground) so text scrolling through the orb's band dissolved rather
  than collided with the disc. It is gone: anchored to the bottom of the visual
  viewport, it landed exactly on iOS Safari's floating bottom bar and tinted the
  browser's own chrome with a band of page background on every `_site` page —
  and it read as a glow hanging off the orb, which is the same thing the orb's
  own "no shadow" rule exists to avoid. Columns already reserve
  `--site-floating-reserve` at their end, so nothing sits under the orb once a
  scroll settles. Don't reintroduce a bottom-anchored decorative layer here.
- **Give any new hub layer its own class name.** The scrim above and the
  overlay's transparent dismiss surface (`.radial-hub__catcher`, absolute,
  filling the overlay) once shared one, and two single-class rules on one name
  overwrite each other rather than coexist: the catcher inherited the fade's
  `min(24rem, 92vw)` width, ~92px height and `translateX(-50%)` — a 359×92 box
  half off the left edge, which no outside tap could hit — while the fade
  inherited the catcher's `background: transparent` and painted nothing. The
  catcher also needs `place-self: stretch`: the overlay is a
  `place-items: center` grid, and an absolutely positioned grid child still takes
  its container's alignment, so `inset: 0` alone shrink-wraps it.
- **Translucency needs a blur behind it.** The top bar drops `backdrop-filter` on
  phones for paint cost, so it is fully opaque there — a partly-transparent bar
  with no blur just ghosts the feed scrolling underneath it. Frosted glass
  returns with the blur at ≥768px.
