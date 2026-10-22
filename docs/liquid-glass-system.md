# Liquid glass: implementation contract

Status: current as of 2026-10-22. This supersedes the 2026-10-21 contract (native backdrop
blur + clear coat) and the first 2026-10-22 plan (a Chromium-only SVG refraction tier).
Why it changed: [plans/2026-10-22-liquid-refraction.md](plans/2026-10-22-liquid-refraction.md).

**The one-paragraph version.** Singular glass (`glass-pane`, `glass-chrome`, `glass-overlay`,
the app tier's `app-glass`) is drawn by a WebGL shader into a canvas _behind_ the surface's
content. The shader models a real slab: a convex bevel, Snell refraction, dispersion,
Fresnel, a key light and the **cursor as a lamp**, and tap **ripples** that run over the
glass. The middle of the slab is transparent, so the live DOM shows through; only the bevel
is painted, and on floating glass it bends a snapshot of the page behind it. There is **no
`backdrop-filter` anywhere**, so the look does not depend on the engine. The globe uses the
same optics plus a **dough** simulation.

## Ownership

| Concern                                           | Implementation                                                                  |
| ------------------------------------------------- | ------------------------------------------------------------------------------- |
| Fallback material (always complete without WebGL) | `app/liquid-glass.css` (site), `components/shared/app-theme.css` (app tier)     |
| The document service (discovery, loop, input)     | `lib/liquid/glass/engine.ts`, mounted by `hooks/useLiquidInteractions.ts`       |
| The optics                                        | `lib/liquid/glass/shader.ts` (GLSL ES 3.00)                                     |
| Wavelengths, dispersion and shared Snell geometry | `lib/liquid/optics.ts` (SCHOTT N-BK7 Sellmeier model)                            |
| One shared GL context, draw + copy                | `lib/liquid/glass/renderer.ts`                                                  |
| Per-surface decisions (bevel, budget, coverage)   | `lib/liquid/glass/policy.ts` (pure, unit-tested)                                |
| Computed colour → RGBA                            | `lib/liquid/glass/color.ts` (pure, unit-tested)                                 |
| The page snapshot (capture, debounce, backoff)    | `lib/liquid/glass/scene.ts`, on `lib/eversion/capture.ts` (`modern-screenshot`) |
| Snapshot shared with other GL contexts            | `lib/liquid/glass/scene-store.ts`                                               |
| Neighbour push (translate-only)                   | `lib/liquid/runtime.ts`, wave math in `lib/liquid/interaction.ts`               |
| Globe dough simulation                            | `lib/dough.ts` (pure, unit-tested)                                              |
| Globe coat (field, silhouette, lens, light)       | `components/radial/jelly-glass.ts`, `components/radial/LiquidGlobe.tsx`         |
| Captured-page transmission during eversion        | `lib/eversion/gl/shaders.ts` (unchanged)                                        |

## Roles

| Role / class                                                            | Drawn as                             | Refracts the page?                           |
| ----------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------- |
| `glass-chrome` (sticky header, dock)                                    | slab                                 | **yes**                                      |
| `glass-overlay` (dialogs, menus, toasts)                                | slab                                 | **yes**                                      |
| `glass-pane` (heroes, composers, panels)                                | slab                                 | no by default; `data-liquid-glass="refract"` |
| `app-glass` (full-screen app tier panels)                               | slab                                 | no by default                                |
| `glass-fill` (repeated cards, rows)                                     | slab, admitted after the roles above | no (live content)                            |
| `glass-inset`, `[data-slot=button]`, `[data-evert]`, field hover carrier | slab, admitted last (controls)       | no (live controls)                           |
| `[data-liquid-glass]`                                                   | slab (opt in any element)            | only with `="refract"`                       |

Why panes do not refract by default: a pane is a content block, so its own text is in the
page snapshot. Refracting it would draw the same words twice, live and bent, wherever they
start inside the bevel. Floating glass is _hidden_ from the snapshot, so what its rim shows
really is what is behind it. A pane over imagery with nothing near its edge can opt in.

Opt-outs: `data-liquid-material="off"` or `data-liquid-glass="off"`. Never slabs: the
opaque `glass-chrome--aside`, the globe stage, eversion layers, anything smaller than 16px
or larger than 640,000px².

## Clarity: tints, the ground and hover (read this before changing a fill)

Liquid glass is **clear**. If a surface reads as a coloured card, the material is wrong, whatever the shader does at
the rim. Three things have to hold together, and each has been the cause of "it is not liquid yet":

1. **Low tints.** The role tints in `app/liquid-glass.css` are slivers of the ground, not paint: fill 14%, pane 18%, chrome
   42%, overlay 86% (menus/dialogs sit on arbitrary content with no blur behind them, so they keep the most body),
   `glass-inset` 3%. The surface tokens (`--site-surface`, `-hover`, `-active`, `--site-glass-tint*`) are likewise
   translucent in every light theme (about 0.3–0.5 alpha, dark Graphite similar). `--site-surface-opaque` is the opaque
   twin for things that must hide the page. A local `background:` on a glass role is **unlayered** and silently beats the
   role (the top bar was an opaque white strip this way): let the class own the fill.
2. **A ground with something in it.** Clear glass over flat white has nothing to bend. `--site-canvas` carries soft
   chromatic light in Daylight, and **the body must not paint over it**: `.site-aurora` is a fixed layer at `z-index: -1`,
   which paints above the root's background but below an in-flow body background, so `body { background }` hid it on every
   theme. On the site tier `<html>` carries the solid base and `<body>` is transparent (`paintDocumentGround`,
   `bodyThemeScript`, `globals.css`); app/game routes keep painting their own body.
3. **Hover that reaches the whole face.** The eversion hover/press layer is `[data-evert]::before` at `z-index: -1`, so
   the engine canvas is at `-2`: the layer paints over the slab, rim included. Over glass its tint is translucent ink
   (`--evert-tint` in `liquid-glass.css`), never `--site-surface-hover`. The cursor light also has a soft bloom across the
   FACE of a slab (shader `curGlow`), not only a glint on the bevel band.

The glass clarity preference is retired. All visitors use the role tints above;
legacy `rmh-glass-level` and `rmh-reduce-transparency` device values are cleared
before first paint and during hydration, and saved account values are ignored.
There is no slider or account override. OS reduced transparency, forced colours,
high contrast, performance budgets and renderer capability fallbacks still apply.

## No shadows: the edge is the depth

Nothing on the site carries a drop shadow or an inset highlight any more. Every `--site-shadow*`,
`--site-glass-depth*` and `--app-shadow*` token is a zero shadow (`0 0 0 0 transparent`, valid inside any
`box-shadow` list, so no consumer breaks) in every theme except High contrast, which keeps its white outline
as a requirement, not a style. Depth now comes from what a surface's EDGE does to the light: the shader's
refracted, shaded, lit bevel. That is why cards (`glass-fill`) and controls are admitted as slabs, and why the
bevel is wider than it was (up to 24px, refraction reach just under it). The CSS tier (no WebGL, reduced
transparency, `perf-lite`, past the budget) is a coat and a hairline border, nothing that could clash. Do not
add `box-shadow` to a UI surface; if something needs separating from the ground, that is the glass's job.

Panes, cards and controls stay in the snapshot as page content, but **do not sample it themselves**. Sampling their own
text, borders or hover would draw a stale second copy at the rim, making hover look cut off and scrolling shimmer.
Only floating glass refracts by default; a pane over imagery can opt in with `data-liquid-glass="refract"`.
`data-liquid-glass="lit"` always disables refraction while retaining the lit bevel, cursor light and tap ripples.

## The slab

Geometry. A rounded-rect signed distance gives each pixel its depth `d` inside the edge. A
convex squircle height field `h = bz·(1 − (1 − t)³)^⅓`, `t = d/bz`, gives the surface a
normal that tilts outward at the rim and is flat inside `bz` (the bevel width, 8–18px,
`policy.bevelFor`).

Refraction. Three rays meet the surface and independently obey Snell's law. The shared
Sellmeier model uses SCHOTT N-BK7 coefficients at 656.2725 nm (red), 546.074 nm (green),
and 435.8343 nm (blue): the refractive indices are approximately 1.51432, 1.51872 and
1.52668. Blue bends more than red. The page-plane intersection divides each ray's lateral
direction by its depth direction, then multiplies by `thickness` (0.95 × bevel); this is
a geometric ray intersection, with no adjustable RGB offset or dispersion multiplier.
Only the bevel band is painted opaque
(`t < 0.55`, fading to nothing by `t = 1`), which is also where refraction goes to zero, so
there is no seam and no double image.

The coefficients and reference indices come from the
[SCHOTT N-BK7 datasheet](https://media.schott.com/api/public/content/41e799d0bf874807a0bb8e702fbb75b5?v=54856406);
exact spectral-line wavelengths are listed in SCHOTT TIE-29. This is a three-wavelength
approximation over an RGB page capture; the capture does not contain a full light spectrum.
Indices are precomputed once, so shader work stays at three scene samples per slab/globe.
Eversion uses the same model: the high tier traces three wavelengths, mid retains one
representative green ray within its existing texture budget, and low keeps its static coat.

Light. Blinn-Phong glints from a fixed key light (up-left) and from the cursor (a point
light 96px above the surface, reach 440px, falling off smoothly), a dimmer counter-glint on
the far edge, a thin inner stroke that is brightest where the edge faces a light, Schlick
Fresnel, and a soft sheen. Shade is as important as light: glass on a pale ground reads
through a dark refraction line at the rim and a denser far side, drawn in the theme's ink
(`--site-text`), so it works in monochrome and every other theme.

Hover. All adopted controls (including ghost buttons, links, menu items and tabs) use the same bounded optical tilt:
the shared engine eases a unit-disc cursor pose, and the shader rocks its normal by at most about 2.6 degrees.
Reflections and refracting rims respond while text, hit areas and scroll geometry stay fixed. The face bloom is subtle;
shader-backed controls do not also paint a flat colour wash. Fields and native selects use the existing inert hover
carrier, drawn as lit glass; compact 16–27px controls get a narrower bevel. Disabled controls never tilt.
Reduced motion, coarse pointers and scrolling return the optical pose to zero.

Hover colours are normalized at compilation by `lib/liquid/hover-css.ts` (Vite's shared PostCSS pipeline). It handles
Tailwind's nested/escaped variants and authored styles, replacing hover colour, border, shadow and host-transform
changes while preserving focus/selected/disabled states and content reveals. Runtime inline CSS follows the same
contract. The no-WebGL tier uses the shared clear coat instead of a variant-colour fill.

Ripples. Each tap within 520px of a surface adds an expanding wave (up to 3 per surface,
1.15s life) that tilts the normal, so the glints run over the glass like it was liquid while
the text on it stays perfectly still.

## The page snapshot

A browser will not hand a shader the pixels behind an element, so the engine keeps a picture
of the viewport. It uses the site's own capture (`lib/eversion/capture.ts`,
`captureViewport`), which already handles fonts, offscreen stubbing, time-slicing and
Firefox/Safari/Chromium quirks.

- **When.** On settle only: load, route change, scroll rest, resize, theme change, content
  changing (1.6s after the last mutation). Coalesced (260ms), at most once per 1.5s, one in
  flight, idle-scheduled, never while the tab is hidden or the hub is open. Three failures in
  a row stop it until the next route.
- **What.** The viewport at capture scale ≤ 1.25. `canvas[data-liquid-glass]` is **excluded**
  (so the rim never feeds back on itself); `.glass-chrome` and `.glass-overlay` are
  **hidden, not removed**: they keep their box and lose their paint. Removing a sticky header
  reflows the page up by its height, and every rim would then refract a picture of a
  different page (this was a real bug found during development).
- **Using it.** Content glass uses live DOM plus a lit rim. On scroll, floating glass immediately drops stale
  refraction and keeps the lit rim attached to its host; it does not repaint captured text a frame behind the browser's
  compositor. Cursor lighting and ripples pause during scrolling. Refraction returns only after a fresh settled capture.
  Requests reset the debounce, including queued idle callbacks. Pictures invalidated by a new request, route, viewport
  size or scroll position while in flight are closed without publishing.
- **Observability.** `<html data-liquid-scene="on">` while a picture is in use.

## What runs when

Nothing runs at rest. There is no standing frame loop: a frame is requested only while the
cursor light is easing, a ripple is alive, the refracted rim is fading in, or once for a
surface whose size, theme, tint, snapshot or (if viewport-anchored) scroll changed. Every
frame recomputes whether anything is still moving and reschedules only if so (the one
`requestAnimationFrame`, allow-listed in `lib/__tests__/raf-loop-allowlist.test.ts`). The
engine reads rects in observer callbacks and frames and writes only canvases and attributes.

Draw path: one shared WebGL 2 context renders a surface offscreen, then `drawImage` copies it
into that surface's own 2D canvas in the same task. Its backing store grows to the largest admitted dimensions and is
reused; it never reallocates for each differently sized surface. A frame reads all host rects before drawing any canvas. The page never holds more than one GL
context for all slabs (browsers cap them at ~16; the globe uses a second).

## Tiers and fallbacks

| Condition                                                                                              | Result                                                    |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------- |
| WebGL 2 + a fresh snapshot                                                                             | slabs, floating glass refracts                            |
| WebGL 2, no snapshot (first second, failed capture, low-end, Save-Data)                                | slabs, lit only (never blank)                             |
| No WebGL 2 / context lost                                                                              | CSS material (tint + static lit edge); restored on regain |
| Reduced transparency, forced colours, `.style-high-contrast`, `.app-high-contrast`, `perf-lite`, print | **no canvases**; CSS material                             |
| Reduced motion                                                                                         | slabs, but no cursor light and no ripples                 |
| Touch                                                                                                  | ripples, no cursor light                                  |
| ≤ 2 cores, ≤ 2 GB, or Save-Data                                                                        | slabs, no snapshot capture                                |

The CSS material is a complete design on its own and looks the same in every engine. Never
add `backdrop-filter` to a glass role.

## Neighbour push

Taps still push nearby surfaces (`runtime.ts`): a damped wave that arrives later at distant
surfaces, bounded to **±6px and translate only**. It no longer rotates: rotating a surface
rotates its text, which every engine re-rasterises (and Gecko snaps to the pixel grid again
when the animation ends), and that reads as shimmer. It composes with component transforms
through additive native animations (no JS frame loop). The model is kept linear on purpose: retargeting folds old waves into a recovery by subtraction, which only reproduces the pose if the sum is linear, so the clamp is applied only at display (a smooth saturation inside the model broke retargeting; do not add one). Surfaces the engine draws also get
the shader ripple; the cursor light on them is the shader's, so no CSS light carrier is
appended to them (that DOM churn was removed).

## The globe

**The lat/long cage is drawn OVER the coat.** The meridians and parallels are one canvas (`.radial-globe__cage`) after
the glass in the stage. The coat is opaque where it lenses the page, so a cage underneath it vanished the moment the
shader took over (the self-contained harness has no page snapshot, so it never showed). Keep the cage last in the stage
order, above `.radial-globe__glass`, below the pins.

**Dough, not a stretchy ball.** `lib/dough.ts` simulates a displacement field `u(x)` on a
48×48 grid over the disc. Two layers: an **elastic** layer (a damped spring that rebounds) and
a **plastic** layer (strain flows into it, it eases out over ~1.4s, so a dent outlives the
finger). A press pushes material _out of_ the contact and banks it up around it; height is
derived as `h = −0.12·∇·u`, so **volume is conserved by construction** (the discrete
divergence of a field that vanishes at the border sums to zero; asserted in tests). A drag
grips the material under the finger and carries it, so it piles up ahead and leaves a groove
behind, which is what the plastic layer remembers. At rest it is exactly zero and `step`
says so, so nothing repaints.

The same field drives everything you see: the cage and pins are displaced by sampling it on
the CPU (`DoughBody.deform`), and it is uploaded as a half-float texture to the coat shader,
which inverts it per pixel to find the material at each point. So the **silhouette bulges**,
the lighting wraps around every dent (lit wall, shadowed wall, a bright lip on the
shoulder), and the wireframe all describe one surface.

**Lens.** The coat traces air → glass → air separately for all three wavelengths,
intersecting each entry ray with the reference sphere to find its actual exit normal.
The background plane sits three radii behind the centre, beyond the focal point, so the
page appears inverted. The shared snapshot is sampled at mip level 5, retaining the
ball's own blur. Dents and ripples bend the entry normal; the exit geometry remains the
reference sphere. The old approximate exit normal caused an artificial total-internal-
reflection ring; exact sphere intersections avoid it. A ray that truly totally reflects
or turns toward the viewer contributes reflection rather than an invalid background sample.

Needs WebGL 2 (a half-float texture that filters linearly); without it the globe keeps its
CSS body and still deforms its cage and pins.

## Writing UI that uses it

```tsx
// A panel: a lit slab. Layout, spacing and content stay yours.
<section className="glass-pane rounded-site p-6">…</section>

// Floating UI: refracts the page behind it.
<div className="glass-overlay rounded-site p-4">…</div>

// A pane over imagery that should bend it (keep text away from the edge):
<div className="glass-pane" data-liquid-glass="refract">…</div>

// Intentionally custom material, or a gesture subtree the engine must leave alone:
<div className="glass-pane" data-liquid-material="off">…</div>
<section data-liquid-motion="off">…</section>
```

Do not hard-code a background on a role (the tint is the surface's own and is read by the
shader so the rim matches the interior). Do not put `:first-child`/`:last-child` rules on the
direct children of a glass role: the canvas is appended as its last child. Do not add
`backdrop-filter`. Do not refract canvases, video or repeated rows.

## Cross-browser: what is verified and what is not

| Engine                                        | Verified                                                                                                                                                                                                                                                                                         |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Chromium 156 (headless) | `liquid-glass-engine`: 37 checks; `ui-stability`: 80 checks across three themes × two widths. Real `/games` page and shell. |
| WebKit 27.2 (headless, macOS) | Same glass and feed suites, 34 + 80 checks; real `/games` page and shell. |
| Firefox 157 / Gecko (headless, macOS) | Same glass and feed suites, 34 + 80 checks; real `/games` page and shell. Firefox uses isolated test app data for Playwright's macOS startup issue. |
| Physical iOS, Android, Windows/Linux GPUs | Not verified by these headless engine tests. |

The live home feed could not be checked against this local database (its schema is behind the code); the feed
suite uses the actual wheel, hover hook, interaction runtime and styles with fixture posts instead.

Note for anyone screenshotting WebKit WebGL under WebDriver: a WebGL canvas is only
_presented_ on an animation frame. A screenshot taken straight after a draw shows the
previous frame. (This looked like a rendering difference until the pixel readbacks proved
the GL output identical.)

## Validation

```sh
pnpm test                       # includes lib/liquid/**, lib/__tests__/dough.test.ts
pnpm exec tsc --noEmit
pnpm check:consistency
pnpm build
export CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome
node testing/e2e/glass-slab.mjs          # shader contract over a loud synthetic page
node testing/e2e/glass-dispersion.mjs    # GPU Snell/sphere parity, RGB ordering, all eversion tiers
node testing/e2e/liquid-glass-engine.mjs # the engine on a real DOM, real capture, real CSS
node testing/e2e/dough-globe.mjs         # dough sim + coat shader + lens
node testing/e2e/liquid-glass.mjs        # neighbour push + older contract
LIQUID_BROWSER=firefox|webkit node testing/e2e/liquid-glass-engine.mjs   # where installed
EXPORT_HTML=/tmp/x.html node testing/e2e/glass-slab.mjs   # standalone page for another driver
```

## Known limits (honest list)

- Not photorealistic refraction of arbitrary live content: the snapshot is a second or two
  old and only the bevel uses it. Video or animation under floating glass refracts a
  slightly stale rim; the interior is always live.
- At most 24 VISIBLE slabs at once; extras fall back to the CSS material (the highest-priority roles
  win: overlay, chrome, pane, fill, then controls). Only surfaces on screen count, so this is "how many
  cards and controls fit in a viewport, with headroom". Ghost and link buttons are never slabs (no body to
  give an edge to).
- The default Daylight theme is deliberately monochrome; glass on white reads through shading
  and the content beneath it, not through colour. A richer ambient backdrop would help and is
  a design decision, not made here.
- The globe's lens is only as good as the snapshot: it needs one to exist before the hub
  opens (it does after the page has been idle ~1s).
