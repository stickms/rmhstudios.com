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
| `LiquidGoo.tsx`      | The **metaball filter bank** — one hidden `<svg><defs>` mounted in the shell holding two goo filters (`#rmh-liquid-sm` / `#rmh-liquid`) that CSS references to fuse clusters of shapes. Blur → steep alpha ramp, so near shapes merge with a smooth neck and a lone shape just rounds off. Used by the hub dial, the orb aura and the loading mark — small, bounded clusters of **opaque** shapes only (see rule 5 below).                                                                                                                                                                                                                                                                                                       |
| `MetaballCursor.tsx` | The pointer metaball: a gooey drop under the mouse on desktop and under the finger on touch. An SVG **alpha ramp** (never the CSS `blur() contrast()` goo — rule 6 below), delta-time easing so it behaves identically at 60Hz and 240Hz, and a small bounded filter region (168px box, region = the box). Hides the native cursor while it is driving one, narrows to a caret over text fields, and blows up macOS-style when you shake to find it. Portals to `<body>`.                                                                                                                                                                                                                                                        |
| `RadialShell.tsx`    | The application frame for every standard (`_site`) route: fixed parallax ring backdrop, slim utility top bar, the **three-track frame** (nav rail · `<main>` · live rail), the hub, and the pointer metaball. The backdrop layer paints **only** the rings — the aurora canvas comes from the document's own fixed layers (`body::before/::after`), so it drifts and parallaxes and is the one scene every `backdrop-filter` on the page samples.                                                                                                                                                                                                                                                                                |
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

## Metaballs (the liquid layer)

The Liquid Glass material itself is central (`app/globals.css` — the elevation
classes render at full strength inside this shell). What lives here is the
**metaball** layer that makes the radial chrome behave like a body of liquid:

| Where               | What fuses                                                                               | How                           |
| ------------------- | ---------------------------------------------------------------------------------------- | ----------------------------- |
| Hub dial            | The clip-path sectors melt into one liquid disc; dividers become gooey necks.            | `#rmh-liquid`                 |
| Orb aura            | Orbiting blobs stretch and neck in and out of the orb's disc.                            | `#rmh-liquid`                 |
| Pointer             | The pointer's blobs fuse into one trailing drop — mouse _and_ finger (`MetaballCursor`). | `#rmh-pointer-goo`            |
| Loading mark        | Orbiting blobs melt into a pulsing core (`ui/radial-loader.tsx`, via `Spinner`).         | `#rmh-liquid-sm`              |
| Backdrop blob field | Huge faint blobs drift, swell together and pull apart behind everything.                 | **soft gradients, no filter** |

Five rules keep it safe — break them and you get chewed text, broken layout, or a
page that renders at 15fps:

1. **A goo group contains shapes only.** The alpha ramp destroys glyph
   antialiasing, so icons/labels ride in a sibling layer _above_ the filter.
   That is why the hub's sectors and `radial-hub__glyphs` are separate elements,
   and why those glyphs auto-contrast with `mix-blend-mode: difference` (white
   over the filtered dial = the exact inverse of whatever sector is beneath)
   instead of reacting to each sector's own hover/active state.
2. **Never filter an ancestor of fixed chrome.** `filter` creates a containing
   block for `position: fixed` descendants and a new stacking context — hence the
   orb's aura is its own fixed layer rather than a pseudo-element on the orb, and
   nothing filters `.radial-shell`.
3. **Gate the cost.** An always-on SVG filter is continuous GPU work, so every
   _decorative_ goo layer is
   `@media (min-width: 768px) and (prefers-reduced-motion: no-preference)` — the
   same budget the ring backdrop already respects on phones.
4. **Small, bounded clusters only — never a viewport-sized layer.** A filtered
   subtree whose children animate cannot take the compositor fast path, so the
   whole filter graph re-runs every frame across the whole filter region. The
   backdrop blob field used to carry a wide goo (`#rmh-liquid-lg`) and it pinned
   every desktop `_site` page at **~15fps**: measured headless at 1920×1080,
   16.7ms/frame without it vs 66.7ms with (83.4ms p95). It is now fused by the
   blobs' own soft-edged radial gradients — free, and closer to the intended look
   than hard-edged discs were. The three surviving goo layers are all small
   (a ≤460px dial, a ~72px aura, a 168px pointer box).
5. **A goo ramp only fuses OPAQUE shapes.** The ramp maps alpha
   `a → ramp·a − (ramp−1)/2`, so anything under ~50% alpha is clamped to nothing
   and the filter silently becomes a no-op. That is the other half of the
   backdrop-field bug: at 7% ink the filter produced pixel-identical output to no
   filter at all, so nothing on screen ever hinted at what it cost. If you want
   soft, use a gradient; goo is for solid fills.
   `lib/__tests__/metaball-perf-budget.test.ts` fails the build on rules 3–5.
6. **The pointer drop paints a shape and nothing else.** The tempting cheap goo
   is a CSS one — an opaque plate behind white blobs, `blur() contrast()` to
   threshold them, and `mix-blend-mode: difference` to cancel the plate (black
   being difference's identity element). Do not use it. It only stays invisible
   while the compositor blends against the true page backdrop; once the layer
   gets its own render surface — a GPU-compositing decision, not ours — the
   plate stops cancelling and the whole box appears as a bright rectangle
   trailing the pointer. It does not reproduce under software rasterisation, so
   it is not a bug you can test your way out of. The drop therefore uses an SVG
   **alpha ramp** (blur, then a steep curve on alpha alone), which emits the
   fused silhouette and transparency everywhere else — there is no box to
   reveal, on any path — and no blend mode at all, which also spares the
   per-frame backdrop readback that blending forces.

### Pointer metaball contract

- **Frame-rate independent.** Every spring converges at a fixed rate _per
  second_ (`1 − e^(−λ·dt)`), never a fixed fraction per frame. A 144Hz display
  gets the same curve as a 60Hz one instead of snapping to the pointer, and a
  dropped frame doesn't produce a jump. `dt` is clamped so returning to a
  backgrounded tab eases rather than teleports.
- **Bounded work, and the bound is small.** The filter region is a fixed box and
  every blob offset is clamped inside it, so the tail can stretch but can never
  enlarge (or escape) the region being blurred. Cost is **quadratic in `BOX`** —
  the goo plus both halo passes run over `BOX²` every frame the pointer moves —
  so the box is 168px and the `<filter>` region is the box itself (104%), not the
  220px box with a 140% region it shipped with: ~31k filtered pixels instead of
  ~95k. Padding the region only blurs empty pixels, because the clamp already
  guarantees the fused silhouette plus the blur's spill fits inside the border
  box. `will-change` is toggled by the loop — a parked pointer holds no
  compositor layer — and the loop skips the `--metaball-swell` write on frames
  where it hasn't moved, so a plain glide doesn't restyle all three blobs.
- **Legibility is built into the shape, not borrowed from the backdrop.**
  Without a blend mode there is no inversion to rely on, so the drop is filled
  with `--site-text` and carries a halo in `--site-bg` (two `drop-shadow`s
  chained after the goo, so the rim traces the fused outline rather than each
  blob). Those tokens are contrast-paired by definition, so it reads on the page
  in every theme — and on a control whose fill matches the ink (on the default
  theme the accent IS the ink, so over the compose button the halo is the whole
  mark) it reads as a ring.
- **It replaces the OS cursor.** While a real mouse is driving it, the native
  arrow is hidden (`[data-metaball-cursor]` in `radial.css`) — two pointers on
  screen read as a bug. Anything that needs the real cursor opts out with
  `data-native-cursor`, subtree included. The attribute is always removed on
  unmount, so the page can never be left without a pointer.
- **It says what it's over.** Swells over interactive elements, narrows to a
  caret over text fields (which is what makes hiding the I-beam acceptable), and
  — like macOS — blows up when you shake the pointer to find it.
- **Touch.** On a coarse pointer it appears under the finger on press, follows
  it, and fades on release. It never runs when idle, so a phone pays for it only
  while it is actually being touched.
- **Off entirely** under reduced-motion, forced-colors, reduced-transparency,
  and on devices reporting < 4 GB of memory.

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
