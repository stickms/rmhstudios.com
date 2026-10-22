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
| One shared GL context, draw + copy                | `lib/liquid/glass/renderer.ts`                                                  |
| Per-surface decisions (bevel, budget, coverage)   | `lib/liquid/glass/policy.ts` (pure, unit-tested)                                |
| Computed colour → RGBA                            | `lib/liquid/glass/color.ts` (pure, unit-tested)                                 |
| The page snapshot (capture, throttle, backoff)    | `lib/liquid/glass/scene.ts`, on `lib/eversion/capture.ts` (`modern-screenshot`) |
| Snapshot shared with other GL contexts            | `lib/liquid/glass/scene-store.ts`                                               |
| Neighbour push (translate-only)                   | `lib/liquid/runtime.ts`, wave math in `lib/liquid/interaction.ts`               |
| Globe dough simulation                            | `lib/dough.ts` (pure, unit-tested)                                              |
| Globe coat (field, silhouette, lens, light)       | `components/radial/jelly-glass.ts`, `components/radial/LiquidGlobe.tsx`         |
| Captured-page transmission during eversion        | `lib/eversion/gl/shaders.ts` (unchanged)                                        |

## Roles

| Role / class                              | Drawn as                                      | Refracts the page?                           |
| ----------------------------------------- | --------------------------------------------- | -------------------------------------------- |
| `glass-chrome` (sticky header, dock)      | slab                                          | **yes**                                      |
| `glass-overlay` (dialogs, menus, toasts)  | slab                                          | **yes**                                      |
| `glass-pane` (heroes, composers, panels)  | slab                                          | no by default; `data-liquid-glass="refract"` |
| `app-glass` (full-screen app tier panels) | slab                                          | no by default                                |
| `glass-fill` (repeated cards, rows)       | CSS only: tint + lit edge. **Never a canvas** | no                                           |
| `glass-inset` (fields)                    | CSS only                                      | no                                           |
| `[data-liquid-glass]`                     | slab (opt in any element)                     | only with `="refract"`                       |

Why panes do not refract by default: a pane is a content block, so its own text is in the
page snapshot. Refracting it would draw the same words twice, live and bent, wherever they
start inside the bevel. Floating glass is _hidden_ from the snapshot, so what its rim shows
really is what is behind it. A pane over imagery with nothing near its edge can opt in.

Opt-outs: `data-liquid-material="off"` or `data-liquid-glass="off"`. Never slabs: the
opaque `glass-chrome--aside`, the globe stage, eversion layers, anything smaller than 28px
or larger than 640,000px².

## The slab

Geometry. A rounded-rect signed distance gives each pixel its depth `d` inside the edge. A
convex squircle height field `h = bz·(1 − (1 − t)³)^⅓`, `t = d/bz`, gives the surface a
normal that tilts outward at the rim and is flat inside `bz` (the bevel width, 8–18px,
`policy.bevelFor`).

Refraction. A ray straight down meets that surface, bends by Snell's law (IOR 1.5) and
travels `thickness` (0.85 × bevel) before it reaches the page, so the rim shows page content
from a point shifted **inward** (never outside the snapshot). Red, green and blue shift by
slightly different amounts (dispersion 0.07). Only the bevel band is painted opaque
(`t < 0.55`, fading to nothing by `t = 1`), which is also where refraction goes to zero, so
there is no seam and no double image.

Light. Blinn-Phong glints from a fixed key light (up-left) and from the cursor (a point
light 96px above the surface, reach 440px, falling off smoothly), a dimmer counter-glint on
the far edge, a thin inner stroke that is brightest where the edge faces a light, Schlick
Fresnel, and a soft sheen. Shade is as important as light: glass on a pale ground reads
through a dark refraction line at the rim and a denser far side, drawn in the theme's ink
(`--site-text`), so it works in monochrome and every other theme.

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
- **Using it.** The picture is mapped with the scroll since it was taken. A viewport-anchored
  surface fades its refraction out as its sample region leaves the picture; a route change
  fades it out until a new one lands. Only the bevel uses it, so a picture a second or two
  old is invisible.
- **Observability.** `<html data-liquid-scene="on">` while a picture is in use.

## What runs when

Nothing runs at rest. There is no standing frame loop: a frame is requested only while the
cursor light is easing, a ripple is alive, the refracted rim is fading in, or once for a
surface whose size, theme, tint, snapshot or (if viewport-anchored) scroll changed. Every
frame recomputes whether anything is still moving and reschedules only if so (the one
`requestAnimationFrame`, allow-listed in `lib/__tests__/raf-loop-allowlist.test.ts`). The
engine reads rects in observer callbacks and frames and writes only canvases and attributes.

Draw path: one shared WebGL 2 context renders a surface offscreen, then `drawImage` copies it
into that surface's own 2D canvas in the same task. The page never holds more than one GL
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

**Lens.** The coat refracts the page behind the hub as a ball lens (inverted, magnified,
slightly dispersed), from the shared snapshot sampled at mip level 5 to match the hub's 20px
blur. It is driven by the surface normal, not by a two-surface refraction: that has a
total-internal-reflection cutoff that drew a visible ring on the ball.

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
| Chromium (headless, SwiftShader)              | Everything: unit tests, `glass-slab`, `dough-globe`, `liquid-glass-engine` (30 checks), the real app                                                                                                                                                                                             |
| WebKit (WebKitGTK 2.52, WebGL 2, real engine) | Shaders compile and are **pixel-identical** to Chromium at probed points; the full engine on the real site, including a successful page capture; the globe                                                                                                                                       |
| Firefox / Gecko                               | **Not run.** The sandbox this was built in could not download Firefox. By construction there is no `backdrop-filter` dependency, no `rotate()` on text, no float-texture or extension requirement beyond WebGL 2 core, and no `will-change` toggling. **Test it in Firefox before trusting it.** |
| Real GPUs, iOS, Android                       | **Not run.** Headless software rendering says nothing about energy or frame cost.                                                                                                                                                                                                                |

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
- At most 8 slabs at once; extras fall back to the CSS material (the highest-priority roles
  win: overlay, chrome, pane).
- `glass-fill` and buttons are not slabs. A shader per card would cost more than it buys.
- The default Daylight theme is deliberately monochrome; glass on white reads through shading
  and the content beneath it, not through colour. A richer ambient backdrop would help and is
  a design decision, not made here.
- The globe's lens is only as good as the snapshot: it needs one to exist before the hub
  opens (it does after the page has been idle ~1s).
