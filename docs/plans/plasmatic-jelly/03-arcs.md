# Plasmatic Jelly 03: electric arcs

Status: plan, 2026-10-23. Scope: the **electric arc** part of the Liquid Glass → Plasmatic
Jelly shift. Sibling plans cover the material (01), the soft-body physics (02), coverage,
a11y and performance, and the gates and docs. This plan uses their registry and event bus
but does not own them. Where it changes a contract another plan owns, that change is
listed in §9 so it can be approved once.

> Brief: "Jelly UI elements should occasionally produce electric arcs between each other,
> more often when they are physically closer. Clicking should also produce arcs."

## 0. Decisions at a glance

| #   | Decision                                                                                                                                                                                                                                     |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **One Canvas2D overlay** (`<canvas class="jelly-arc-layer">` on `<body>`, `position:fixed; inset:0; pointer-events:none`). It does **not** share the glass `GlassRenderer` WebGL2 context, which already copies up to 24 surfaces per frame (reasons in §4.2).                                  |
| D2  | **Idle at rest.** The scheduler runs on `setTimeout`. `requestAnimationFrame` runs only while an arc is alive (≤ 400ms including afterglow). One new rAF allowlist entry is needed.                                                       |
| D3  | **Ambient rate per pair** is `λ = λ0 · exp(−gap / L)` with `λ0 = 0.05/s` and `L = 48px`. Pairs farther apart than 240px are ignored. A global cap allows **at most 1 ambient arc per 2s**, with at least 1.2s between ambient arcs. Arcs are drawn by superposed Poisson sampling. |
| D4  | **Click arcs:** a `pointerdown` on a jelly element strikes 1–3 arcs from its rim to the nearest neighbours within 180px of its edge. With no neighbour in range, a **rim fizz** of 3–5 short sparks plays instead. Keyboard activation (a `click` with `detail === 0`) strikes one dimmer arc. |
| D5  | **Geometry:** a rounded rect is treated as its core rect plus a disc of radius r (a Minkowski sum). Arcs join the closest points of the two core rects, pushed out by each radius. The landing point is jittered along the facing overlap. Overlapping elements and ancestor/descendant pairs never arc. |
| D6  | **Colour** comes from new per-theme tokens `--site-arc-core` / `--site-arc-glow`, which by default follow the accent through `color-mix`. Dark themes composite with `lighter`, light themes with `source-over`. Hue is clamped away from saturated red. |
| D7  | **Photosensitivity:** a global **flash ledger** allows ≤ 3 strike onsets in any 1000ms window, including re-strikes and click storms. Re-strikes dip to about 45% brightness, never to dark. The lit area per arc stays under 1/10 of the WCAG small-area threshold. |
| D8  | **Off** when any of these apply: reduced transparency, forced colours, high contrast (site or app), `perf-lite`, print, hidden tab, hub/eversion open, or the user preference is off. **Ambient arcs only** also go quiet while scrolling, typing, playing visible video, or on a low-end device. |
| D9  | **New preference** `electricArcs: 'full' \| 'clicks' \| 'off'` (default `'full'`). It mirrors the `alwaysEvertGlobe` pipeline: Prisma column, `prefs.ts`, schema, API, seed, store, Providers, and the settings UI. No sound.                       |
| D10 | **Coupling** to the soft body is limited to a typed event on the shared `lib/jelly/bus.ts`: `arc:strike` carries `{el, x, y, nx, ny, energy}`. The arc code never moves DOM. Each soft-body element applies its own small impulse.                |

## 1. Visual spec

### 1.1 The bolt

- **Shape.** A main channel made by midpoint displacement between the two contact points:
  - Recursion continues until segments are ≤ 8 CSS px, up to a hard maximum of 64 main-channel segments.
  - The first-level displacement is `0.16 · len`, drawn perpendicular to the local chord. Each level multiplies it by `0.55`, which gives a jagged line with a fractal feel rather than noise.
  - The total perpendicular deviation is clamped to `≤ 0.22 · len`, so a bolt never wanders over unrelated UI.
- **Branches.** These are L-system-style forks. At a midpoint created at depth ≤ 2, a branch forks with probability `0.14`:
  - Branch length is `0.25–0.45 ×` the remaining channel length.
  - Branch heading is the channel heading `± 22–38°`, and the branch is generated recursively with depth −2.
  - Branch intensity is `0.5×`.
  - A bolt has at most **3 branches**, and branches never fork again.
- **Strokes.** Each path is drawn in two passes. No `shadowBlur` is used, because it costs a full Gaussian per stroke:
  1. **Glow pass:** `lineWidth = 5 + 2·energy` CSS px, colour `--site-arc-glow`, alpha `0.20 · I`.
  2. **Core pass:** `lineWidth = 1.1 + 0.5·energy` CSS px (branches `0.8`), colour `--site-arc-core`, alpha `0.92 · I`.
  - Both passes use `lineJoin = 'round'` and `lineCap = 'round'`. A third, very faint halo pass (`lineWidth 12`, alpha `0.06 · I`) is drawn only for click arcs with energy ≥ 0.8.
- **Contact glow.** Each endpoint on a jelly rim gets a radial gradient:
  - Radius 10px (ambient) or 14px (click).
  - Colour `--site-arc-glow` → transparent, peak alpha `0.35 · I`.
  - It is squashed 0.6× along the rim tangent, so it reads as a spot sitting on the rim rather than a ball floating in the gap. Because the overlay is above the element, the glow overlaps the element's lit rim and passes for the jelly brightening locally.
- **Local charge on the jelly ("pre-glow").** For 40ms before the first strike, the contact glows fade in to 40% with no bolt yet, as if the two rims were charging. Whether the material shader also brightens the struck element is up to the material plan (01), which may listen to `arc:strike` (§6.3). This plan does not write DOM styles or custom properties to show charge.

### 1.2 Timeline

Intensity is `I(t)` over one arc. Times are from the moment the arc is requested.

```
  0ms    pre-glow ramp (contact glows 0 → 0.4), no channel
 40ms    strike 1: channel I=1.0 for 30–50ms
 ~85ms   dip to I=0.45 (never 0, D7) for 25–45ms
~125ms   re-strike k (k = 1..2, each optional): channel re-generated from seed+k with
         70% of the previous displacement (same "path", flickering detail), I=0.85
 80–250ms  final strike ends
 +0–160ms afterglow: last channel, core only, I decays exp(-t/55ms) from 0.3; glow off
```

- **Ambient** arcs have 1–2 strikes, a total life of 80–180ms, and energy 0.5–0.7.
- **Click** arcs have 1–3 strikes, a total life of 120–250ms, and energy 0.8–1.0.
- **Keyboard** arcs have exactly 1 strike, a life of 100ms, and energy 0.45.
- Every re-strike passes through the flash ledger (§5.1). If the ledger refuses one, that re-strike is skipped and the arc goes straight to afterglow.

### 1.3 Colour per theme

Two new tokens are defined in `app/globals.css` for each theme block. The default derives from the accent so that custom accents and accent presets carry through. The "plasma" base is a cool violet-cyan. If plan 01 introduces `--site-plasma`, then `--site-arc-glow` should derive from it instead of the literal below.

| Theme (`.style-*`)           | scheme | accent                          | `--site-arc-core`                                         | `--site-arc-glow`                                     | composite     |
| ---------------------------- | ------ | ------------------------------- | --------------------------------------------------------- | ----------------------------------------------------- | ------------- |
| `default` (Paper, ink)       | light  | `#000`                          | `color-mix(in oklch, #5b3fd6 85%, var(--site-accent))`    | `color-mix(in oklch, #7c6cff 60%, transparent)`       | `source-over` |
| `light`                      | light  | `#6a4fd0`                       | `color-mix(in oklch, var(--site-accent) 80%, #1b1240)`    | `color-mix(in oklch, var(--site-accent) 45%, transparent)` | `source-over` |
| `sepia`                      | light  | `#a2592e`                       | `color-mix(in oklch, var(--site-accent) 70%, #3a1d6e)` (shifts orange toward violet, away from red) | same at 40%                                           | `source-over` |
| `graphite`                   | dark   | `#2997ff`                       | `color-mix(in oklch, white 70%, var(--site-accent))`      | `color-mix(in oklch, var(--site-accent) 55%, transparent)` | `lighter`     |
| `nocturne`                   | dark   | `#5e9dff`                       | same formula as graphite                                  | same                                                  | `lighter`     |
| `ultra`                      | dark   | `#76f7ff`                       | `color-mix(in oklch, white 60%, var(--site-accent))`      | `color-mix(in oklch, var(--site-accent) 50%, #b46cff 20%)` | `lighter`     |
| `high-contrast`, app high-contrast | —  | —                               | **not drawn** (D8)                                        | —                                                     | —             |

Rules:

- **Composite.** The renderer chooses the composite mode from the luminance of `--site-bg`, using the same `resolveColor`/`luminance` helpers as `lib/liquid/glass/color.ts`.
  - On a light theme, `lighter` would add white to white and the arc would vanish. Light themes therefore draw a **saturated, darker** core with `source-over`, which reads as an ink-coloured plasma filament.
  - On a dark theme, `lighter` gives a real emissive look.
- **Red clamp.** After resolving the tokens, if the core's oklch hue is within 0–40° or 340–360° **and** its chroma is > 0.12, the renderer rotates the hue to 300° (violet). This covers WCAG's saturated-red caution, and custom accents can be red.
- **When tokens are read.** Colours are re-read only on a theme or accent change. The renderer observes the `class` and `style` attributes on `<html>`, the same signal the glass engine's `readTheme` uses. They are never read per frame.
- **Gate compliance.** The literal hexes above live only inside `color-mix()` in the themed `globals.css` blocks. They are a scoped variable group, which is what the stylesheet raw-colour rule asks for. TSX never names a colour.

## 2. Ambient arcing scheduler

### 2.1 Candidates

- **Source.** Candidates come from the shared jelly registry, `lib/jelly/registry.ts`, owned by the coverage plan. It gives each registered jelly element plus its visibility (IntersectionObserver) and size (ResizeObserver).
  - Until that registry lands, `lib/jelly/arcs/candidates.ts` uses its own IntersectionObserver over `JELLY_SELECTOR` from `lib/jelly/selectors.ts`. The interim `JELLY_SELECTOR` should equal the glass engine's current `SELECTOR` in `lib/liquid/glass/engine.ts`, which covers panes, fills, chrome, overlays, insets, buttons, fields and `[data-evert]`. That way arcs land on exactly the surfaces that are drawn as slabs.
  - It then **deletes** that fallback when the registry lands, so two observers do not watch the same set.
- **Eligibility.** An element is a candidate only if all of these hold:
  - It is visible and at least 24px × 24px.
  - It is not inside `[aria-hidden="true"]`, `[inert]` or `[data-jelly-arcs="off"]`. Game viewports and the hub stage set this attribute.
  - It is not a focused editable element.
  - It is not a `canvas`, `video` or `iframe`.
  - At most 150 candidates are kept, chosen as those nearest the viewport centre.
- **Rect cache.** Each candidate's viewport rect and corner radius are cached.
  - The cache is refreshed in **batched reads** on registry/IO/RO callbacks and once at scroll end, in one `getBoundingClientRect` pass. The radius comes from the computed `border-radius` and is parsed once per resize using `innerRadius()` from `lib/liquid/glass/policy.ts`, which is reused rather than copied.
  - Nothing is read per pointer move. At strike time the renderer re-reads exactly the 2 rects involved, which is cheap, so a stale cache never puts a bolt in the wrong place.
- **Spatial hash.** Cells are 160px (G_max / 1.5). A pair is formed only within the 3 × 3 neighbouring cells. Pairs are excluded when:
  - one element contains the other (`a.contains(b)`), which removes nested cards and buttons;
  - their gap is ≤ 0 (they overlap);
  - their gap is > `G_max = 240px`.
- **Rebuilds.** The pair list is rebuilt only when the rect cache changes. That is O(n) to hash plus about O(n · k) pairs, with k ≤ 12 per element after sorting by gap.

### 2.2 Rate model

```
λ_pair(gap) = λ0 · exp(−gap / L)        λ0 = 0.05 s⁻¹, L = 48 px, gap ∈ (0, 240]
Λ_raw       = Σ λ_pair                  (superposed Poisson process)
Λ           = min(Λ_raw · m, Λ_max)     Λ_max = 0.5 s⁻¹ (≤ 1 ambient arc / 2 s)
next        = max(T_min, Exp(Λ))        T_min = 1.2 s between ambient arcs
pair        ~ weighted by λ_pair · charge_a · charge_b
```

- `m` is a mode multiplier: 1 on a fine pointer, 0.6 on coarse/touch (it saves battery and keeps small screens calm), and 0 when quiet (§2.3).
- **Worked numbers** (λ per pair): gap 8px → 0.042/s · 24px → 0.030/s · 48px → 0.018/s · 120px → 0.004/s · 240px → 0.0003/s.
  - A feed with about 30 visible cards 12px apart, plus toolbar buttons 8px apart, gives Λ_raw ≈ 1.5/s. That hits the cap, so it gets about 1 arc every 2–3s, mostly between the tightest pairs.
  - A sparse settings page gives about 1 arc every 8–20s.
  - An empty page gives none.
- **Charge model** (included; it is cheap and prevents repeats):
  - Each candidate holds `q ∈ [0,1]` that recharges as `q += (1−q)(1−e^{−dt/4s})`. It is evaluated lazily from timestamps, with no timer per element.
  - A pair is eligible only if both `q ≥ 0.35`. An arc drains both endpoints by 0.6, and a click drains the clicked element to 0.
  - The effect: the same two buttons do not arc twice in a row, and a cluster "discharges" and goes quiet for a few seconds, which reads as physical.
- **Scheduling mechanics.** One `setTimeout` holds the next event time.
  - On fire, the scheduler re-checks the quiet state and the rects, picks a pair, and hands it to the renderer.
  - It never uses rAF and never polls faster than the next event. When Λ = 0, no timer is armed at all; it re-arms on the next rect-cache change.

### 2.3 Quiet and pause

Ambient arcs stop, and the timer is cleared, while any of these hold. Click arcs are unaffected unless the condition is in the global-off list (D8).

| Condition                                                                                          | Resume                         |
| -------------------------------------------------------------------------------------------------- | ------------------------------ |
| Scrolling (capture `scroll` on document, the same signal as the engine)                             | 800ms after the last scroll    |
| Typing: `keydown`/`input` in an editable element or `[contenteditable]`                             | 2500ms after the last key      |
| Visible playing `<video>` covering more than 15% of the viewport, or any fullscreen element         | on `pause` / `ended` / exit    |
| Pointer drag in progress (soft-body `drag:start` on the bus)                                        | `drag:end` + 600ms             |
| Text selection is non-empty (reading/copying)                                                       | `selectionchange` to empty     |
| Open modal dialog (`[role=dialog][aria-modal=true]`), menu, or tooltip                              | close                          |
| Low-end device (same `lowEnd` heuristic as the glass engine) or Save-Data                           | never (clicks only)            |
| Pref `electricArcs = 'clicks'`                                                                      | pref change                    |
| `document.hidden`                                                                                   | `visibilitychange` (also kills live arcs) |

Global off (no arcs of any kind, the layer is removed, and listeners are detached except the
media-query/pref watchers): `prefers-reduced-transparency`, `forced-colors`,
`.reduce-transparency`, `.style-high-contrast`, `.app-high-contrast`, `.perf-lite`, print,
the hub open (`.radial-hub:not([data-phase="closed"])`), eversion in progress
(`.eversion-overlay`), and the pref `'off'`. This is the same predicate shape as `off()` in
`engine.ts` and `disabled()` in `runtime.ts`. Factor it into `lib/jelly/policy.ts` (coverage
plan) so all three agree.

## 3. Click arcs

- **Trigger.** One delegated `pointerdown` listener on `document` (capture, passive), filtered to the primary button or a touch contact.
  - It walks up to the nearest registered jelly element with `closest(JELLY_SELECTOR)`. If none is found, nothing happens.
  - There is no per-component listener. It also ignores `[disabled]`, `[aria-disabled=true]` and editable targets: a click into a text field arcs nothing.
- **Targets.** These are neighbours whose **edge gap** from the struck element is ≤ `R = 180px`. The edge gap is computed from the rect cache, then verified against fresh rects.
  - The count is `n = 1 + (nearest gap < 60 ? 1 : 0) + (third gap < 120 && fine pointer ? 1 : 0)`, capped at 3 (2 on touch).
  - Choice is weighted by `exp(−gap/L)`, not strictly nearest, so repeated clicks vary.
- **Path.** A brief contact flare appears at the click point: a contact glow of radius 14px over 90ms, which reads as the charge entering the jelly.
  - Each bolt starts on the struck element's **rim**, at the closest point toward its target (§4.4), and lands on the target's rim.
  - Bolts do not cross the struck element's own content.
- **Staggering.** Multiple bolts start 25ms apart. Each bolt passes through the flash ledger. If the ledger refuses one, it is dropped, and the click still has its flare and the soft-body press.
- **No neighbour in range: rim fizz.**
  - 3–5 sparks of 8–20px each, drawn as straight 2–3 segment zigzags. They leave from the rim point nearest the click, pointing outward along the rim normal ±50°.
  - Life is 90ms, energy 0.5, with a single strike and no re-strike. The fizz counts as **one** onset in the ledger.
- **Discharge to cursor** (when the pointer is outside every jelly element, e.g. a press on the page background):
  - If a jelly element's rim lies within 90px, one thin arc (energy 0.4) runs from that rim to the press point, as if the cursor drew the charge out.
  - Otherwise nothing happens.
- **Keyboard.** A `click` event with `event.detail === 0` (a keyboard- or AT-synthesised activation) on a jelly element whose `:focus-visible` matches strikes **one** arc at energy 0.45 to the nearest neighbour within R. With no neighbour, it plays a 2-spark fizz. Arcs are never triggered on Tab focus moves: focus is not an action.
- **Charge and impulse.** The clicked element's charge is set to 0. The renderer emits `arc:strike` for each endpoint at the moment of the first strike (§6.3).
- **Public API:**
  - `dischargeAt(x, y, opts?)` is for programmatic use, e.g. a "send" button's success state or a celebratory moment from `useCelebration`. It behaves like a pointer press at a viewport point.
  - `strike(a, b, opts?)` arcs between two specific elements.
  - Both go through every policy gate and the flash ledger. Neither one bypasses them.

## 4. Rendering

### 4.1 The layer

```html
<canvas class="jelly-arc-layer" aria-hidden="true" data-liquid-glass="off" data-jelly-arcs="off"></canvas>
```

- The canvas is created by the arc runtime and appended to `<body>`. It is not React-rendered, so no route re-render can unmount it.
- Its CSS lives in `app/jelly-arcs.css`, which is imported next to `app/liquid-glass.css`: `position: fixed; inset: 0; width: 100vw; height: 100dvh; pointer-events: none; contain: strict; z-index: var(--z-arcs);`
- **Z tier.** Add `--z-arcs: 45` to the z-scale block in `globals.css`.
  - It sits above the shell (z-auto) and above `--z-quickpanel`/`--z-menu` (40), so arcs can land on a top-bar button.
  - It sits **below** the z-50 dialogs and sheets, `--z-tooltip` and `--z-cursor`. A modal therefore covers arcs, and ambient arcs are quiet while one is open anyway (§2.3).
  - Click arcs **inside** an open modal set `data-layer="modal"` on the canvas for their lifetime, which maps to `--z-arcs-modal: 55`. Candidates are then restricted to `dialog.contains(el)`. Toasts (sonner) stay above both.
- **Design-consistency.** The canvas carries no Tailwind classes and no glass role. It is decoration, not floating UI, so the L4 floating-UI rule does not apply and does not need an exemption. The z values are named tokens, not raw numbers.
- **Never captured.** Add `.jelly-arc-layer` to `SCENE_EXCLUDE` in `lib/liquid/glass/scene.ts`, or to `CAPTURE_EXCLUDE_SELECTORS` so that eversion captures skip it too (preferred). This keeps refraction snapshots from freezing a bolt into the glass. Both glass `EXCLUDE` lists already skip `canvas`.

### 4.2 Canvas2D, not the shared WebGL2 renderer

The two options compared:

| Option | What it would cost |
| ------ | ------------------ |
| Share `GlassRenderer` (WebGL2) | It renders **per surface** into a framebuffer and copies to per-surface 2D canvases. Arcs live **between** surfaces, so sharing would need a viewport-sized framebuffer plus a full-viewport `drawImage` copy every frame. That is about 8MB of fill per frame at 1080p@2x versus a few kB of strokes. It also couples arcs to GL availability and context loss, and requires a new program, line tessellation and an AA strategy. |
| Canvas2D overlay | Strokes are native and anti-aliased, and `lighter` compositing is free. Cost scales with the length of the bolts, not the viewport. Dirty-rect clearing means an arc touches only its bounding box. Arcs keep working when WebGL2 is missing or the context is lost, because the CSS jelly material is still jelly. |

Recommendation: **Canvas2D**. If profiling ever shows stroke cost, move that work to an `OffscreenCanvas` in a worker. Do not move it to the glass GL context.

**Re-checked against main after the glass budget change** (`GLASS_BUDGET.maxSurfaces = 24`).

- The engine's `SELECTOR` now also admits `.glass-fill` cards, `.glass-inset` fields, `[data-slot=button|input|textarea]` and `[data-evert]` controls as shader slabs.
- Each GL frame therefore already draws and copies up to **24** per-surface canvases.
- Putting arcs in that frame would cost far more than a separate canvas:
  - Every 60Hz arc frame would have to re-run, or at least re-composite, all of that work.
  - It would add a 25th, viewport-sized target to a renderer whose framebuffer is sized for the largest *surface*.
  - It would wake the engine's frame (whose job is to settle and stop) for about 400ms of every arc.
- **Canvas2D stays the decision.** It is now the stronger choice: arc frames touch only their dirty rects and never request an engine frame.

One thing the arcs **may** take from the engine is its list of admitted, visible surfaces with their cached rects, read-only and with no extra observer. The coverage registry (§2.1) remains the primary source, because arcs must also reach jelly elements outside the 24-surface budget.

### 4.3 Frame lifecycle and budgets

- **rAF scope.** rAF is requested on the first live arc. Each frame advances every arc's timeline, clears the **union of the previous and current dirty rects** (each bolt's bbox inflated by its glow width), and draws.
  - The frame reschedules only while at least one arc or afterglow is alive. The worst case is 250 + 160 = 410ms after the last request.
  - Teardown, `visibilitychange → hidden` and global-off all call `cancelAnimationFrame` and clear the canvas.
- **Backing store.** The scale is `min(devicePixelRatio, 1.5)`, or 1.0 on coarse pointers. A glow is soft by nature, and the 1.1px core still looks crisp at 1.5×.
  - The canvas is resized only on `resize` / `visualViewport.resize`, debounced to 150ms. Mid-resize, live arcs are dropped.
- **Limits.** At most **4 arcs** are alive at once; the oldest ambient arc is dropped first. Each bolt has ≤ 64 main segments plus ≤ 3 branches of ≤ 16 segments, which keeps each frame to ≤ 450 `lineTo` calls in the worst case.
- **Target.** ≤ 0.4ms of main-thread time per arc frame on a mid-range laptop, and ≤ 1ms on a mid-range phone. This is measured in the perf plan's synthetic-perf scenario (§7.3).
- **Precomputation.** Bolt points are generated **once per strike** into a `Float32Array`. Frames only stroke the precomputed paths. They do no geometry work and no DOM reads.
- **Scroll during life.** Positions are viewport coordinates and arcs last under 0.5s. On scroll, live arcs fade out over 60ms instead of tracking their elements.

### 4.4 Geometry: closest points between rounded rects

Each rounded rect has a rect `{x,y,w,h}` and a radius `r`. The radius is the computed corner radius clamped to `min(w,h)/2`. When the corners differ, the **maximum** is used: it is conservative, and endpoints land slightly inside the rim rather than in the air.

```
core(R)   = { x+r, y+r, w−2r, h−2r }                  // the rect the disc is swept around
per axis  : if core intervals overlap → both points share a coordinate sampled
            uniformly in the overlap (jitter: the landing point varies along the facing edge)
            else → each point takes its interval's near end
p1, p2    = points on core(A), core(B);  d = p2 − p1;  dist = |d|
gap       = dist − rA − rB                             // ≤ 0 → overlapping, no arc
endpoints = p1 + rA·d̂ ,  p2 − rB·d̂                     // exactly on each rim
normals   = d̂ and −d̂                                    // for contact-glow orientation + impulse
```

- Facing edges produce a straight, perpendicular arc that lands at a random point along the overlap.
- Diagonally offset elements produce a corner-to-corner arc that lands on the arcs of the rounded corners.
- The jitter uses the scheduler's seeded RNG, so tests are deterministic.
- `pointToRoundedRect(p, R)` is the same Minkowski construction with a point. It serves the cursor discharge and the click flare's nearest-rim point.

## 5. Safety and accessibility

### 5.1 Photosensitivity (WCAG 2.3.1 / 2.3.2)

- **Flash ledger.** `lib/jelly/arcs/ledger.ts` is a sliding window of strike-onset timestamps, shared by ambient, click, fizz and API arcs.
  - `tryOnset(now)` returns false once 3 onsets have occurred in the previous 1000ms.
  - Callers degrade: re-strikes are skipped first, extra click bolts second, the bolt itself last. The click flare and the soft-body press always happen, because they are not flashes.
  - A 20-clicks-per-second storm therefore produces at most 3 flashes per second.
- **No dark-light-dark cycle inside an arc.** Re-strikes dip to I = 0.45, never 0. The afterglow decays smoothly. Together these mean an arc's flicker is a modulation, not a series of separate flashes.
- **Small area.** The worst-case lit area of one click arc is about 250px length × (12px halo + branches), around 4,000 CSS px². With 3 bolts that is about 12,000 px² of mostly low-alpha glow. The WCAG small-area threshold is about 21,824 px² (341 × 256 at the standard 1024 × 768 viewing assumption), and the core alone is under 1,000 px². The design target is ≤ 10% of the threshold for the high-luminance core.
- **Luminance delta.**
  - Core alpha is ≤ 0.92 and glow alpha is ≤ 0.20.
  - On light themes the arc is darker than the background, so there is no white flash.
  - On dark themes, the relative-luminance change over the glow area stays under 0.1, so it does not count as a flash, and only the 1px core exceeds it.
- **Saturated red** is excluded by the hue clamp in §1.3.

### 5.2 Other accessibility rules

- The canvas is `aria-hidden`, conveys no information, and never takes focus. No `aria-live` announcements are made.
- Arcs never move layout or text, and never sit under the cursor as a hit target.
- **Motion scheme.** The site has one motion scheme; the reduced-motion setting is retired (`docs/liquid-glass-system.md`). Arcs therefore do **not** read `prefers-reduced-motion`. The user's escape hatch is the explicit preference below, plus the global-off conditions. The settings copy should say plainly that turning arcs off is the choice for anyone sensitive to flicker. This decision must be confirmed with the a11y plan, which owns the overall stance.
- **Preference** `electricArcs`:
  - Values `'full'` (default), `'clicks'` (no ambient arcs) and `'off'`.
  - It follows the exact `alwaysEvertGlobe` pipeline: a Prisma `AppearancePreference.electricArcs String?` column (null means the default), `ELECTRIC_ARC_MODES`, the `ELECTRIC_ARCS_KEY = 'rmh-electric-arcs'` localStorage key, and an applier that sets `html[data-electric-arcs]` pre-paint.
  - The rest of the chain: `appearanceComfortSchema`, `/api/preferences/appearance` GET/PUT, `account-seed.ts`, `themeStore`, `Providers.tsx` sync, and a segmented control on `/settings/appearance` using the existing segmented primitive (not a hand-rolled tab strip).
  - The arc runtime reads `data-electric-arcs` through a `MutationObserver` on `<html>` attributes, which it already holds for theme changes.
- **Sound:** none, ever. No audio code is imported.

## 6. Architecture

### 6.1 Files

```
lib/jelly/arcs/
  geometry.ts     pure: roundedRectGap(), closestRimPoints(), pointToRoundedRect()
  bolt.ts         pure: generateBolt(a, b, {seed, energy, displacement}) → BoltPath (Float32Array + branches)
  rng.ts          pure: mulberry32(seed) (or reuse a repo PRNG if one exists in lib/)
  rate.ts         pure: pairRate(gap), ARC_BUDGET constants, chargeAt(q, dt), pickWeighted()
  ledger.ts       pure: createFlashLedger({max: 3, windowMs: 1000})
  pairs.ts        pure: buildPairs(rects, {maxGap, cell}) via spatial hash; excludes nesting
  timeline.ts     pure: arcIntensity(t, strikes) → {I, phase}; strike schedule from seed
  scheduler.ts    DOM-light: ambient Poisson scheduler (setTimeout only), quiet-state tracking
  renderer.ts     DOM: the overlay canvas, theme colour read, rAF while alive, dirty rects
  clicks.ts       DOM: delegated pointerdown + keyboard click(detail 0) → strike/fizz
  runtime.ts      installElectricArcs(doc): composes the above, policy gating, teardown
  index.ts        public API: dischargeAt(x,y), strike(a,b), installElectricArcs
  __tests__/…     §7
app/jelly-arcs.css           layer CSS (fixed, pointer-events none, z tokens)
```

### 6.2 Mounting

- `hooks/useLiquidInteractions.ts`, or its successor `useJellyInteractions` if the coverage plan renames it, lazy-imports `@/lib/jelly/arcs/runtime` in the **same idle callback** as the glass engine and keeps one teardown.
- Arcs do not paint on first load. They begin after idle plus a 3s warm-up, so the first impression of a page is never a spark.
- Mounting is guarded by the shared `lib/jelly/policy.ts` off-predicate (§2.3). The runtime re-evaluates that predicate on media-query `change` and on `<html>` attribute mutations.

### 6.3 Event bus contract

The bus is `lib/jelly/bus.ts`, owned by the soft-body plan (02). It is a tiny synchronous typed emitter with no React dependency.

```ts
type JellyEvents = {
  'arc:strike': { el: Element; x: number; y: number; nx: number; ny: number; energy: number; kind: 'ambient' | 'click' | 'key' };
  'drag:start': { el: Element };    // produced by soft-body; arcs listen (quiet)
  'drag:end':   { el: Element };
};
```

- **Arcs emit** `arc:strike` once per endpoint at the first strike. `(x, y)` is the contact point in viewport px; `(nx, ny)` is the unit inward normal, i.e. the direction of the "kick"; `energy` is in [0, 1].
- **Soft-body consumes it.** The suggested impulse is ≤ 1.5 CSS px of visual displacement at energy 1, applied only to the struck element's own body and decaying with its normal spring. Whether neighbours ever move stays the soft-body plan's decision; this plan asks for nothing beyond the struck element.
- **Material (01) may consume it** to brighten the rim locally for about 200ms. That is optional; the overlay contact glow already conveys it.
- **Arcs never import** soft-body or material modules, and they do not need them to exist.

## 7. Tests

### 7.1 Unit tests (vitest, `lib/jelly/arcs/__tests__/`)

- **`geometry.test.ts`**
  - Horizontal, vertical and diagonal separation: gap equals the analytic value (diagonal: `hypot(dx,dy) − rA − rB` between core corners).
  - Endpoints lie on each rim: the distance from the core rect equals r to 1e-6.
  - The function is symmetric under swapping A and B (endpoints swap).
  - Overlapping and nested rects give `null`.
  - The radius is clamped to half the short side, and pill shapes work.
  - Jitter stays inside the overlap interval.
  - `pointToRoundedRect` handles points inside, on a corner arc and on a straight edge.
- **`bolt.test.ts`**
  - The same seed gives byte-identical `Float32Array`s; a different seed differs.
  - The first and last points equal the endpoints exactly.
  - Maximum perpendicular deviation is ≤ 0.22 · len.
  - Segment count is ≤ 64 and branches are ≤ 3, each ≤ 16 segments, over 1000 seeds.
  - A re-strike (seed + k) stays within the 70% envelope of the original.
- **`rate.test.ts`**
  - `pairRate` is monotone decreasing: `pairRate(0) = λ0`, and it is 0 beyond `G_max`.
  - Charge recharge is correct at 0, 4s and 20s.
  - `pickWeighted` distributions are correct (chi-square at a fixed seed).
- **`scheduler.test.ts`** uses fake timers, a seeded RNG and synthetic rects.
  - Over 10 simulated minutes, the ambient count is ≤ `Λ_max · T` and consecutive arcs are ≥ `T_min` apart.
  - A pair at 8px arcs about `exp((120−8)/48)` times as often as a pair at 120px, within a tolerance, when charge is disabled.
  - Every quiet condition produces 0 arcs, and resume works.
  - Hidden tab means no armed timer, i.e. `vi.getTimerCount() === 0`.
  - Λ = 0 means no armed timer.
- **`ledger.test.ts`**: a 20 Hz click storm over 5s never produces more than 3 onsets in any 1000ms window, checked by brute-force window scan.
- **`timeline.test.ts`**: I(t) never reaches 0 between strikes, life lies within the per-kind bounds, and afterglow is monotone.
- **`policy.test.ts`** (arcs half): an off-matrix covering each media query and class, the pref values, low-end → clicks-only, and modal → ambient-off.
- **`renderer.test.ts`** (jsdom with a stub 2D context):
  - With no arcs there are no rAF calls.
  - One arc produces a bounded number of frames and then stops.
  - Teardown cancels the frame and removes the canvas.
  - Light-theme bg selects `source-over`; dark-theme bg selects `lighter`.

### 7.2 Gates

- **`lib/__tests__/raf-loop-allowlist.test.ts`.** Add `lib/jelly/arcs/renderer.ts` with this reason: _"Arc overlay frame. Requested only while an arc or its afterglow is alive (≤ ~410ms per request), reschedules only while live arcs remain, cancelled on hidden/off/teardown. The ambient scheduler uses setTimeout, never rAF, so a page at rest has no loop."_ No other arc file may call rAF.
- **Z-scale test.** Add to `design-consistency.test.ts`, or the gates plan's equivalent: `--z-arcs` exists and satisfies `--z-menu < --z-arcs < 50 < --z-arcs-modal < --z-tooltip`.
- **Capture exclusion test.** Extend `lib/liquid/glass/__tests__` so that `SCENE_EXCLUDE` (or `CAPTURE_EXCLUDE_SELECTORS`) contains `.jelly-arc-layer`.
- **No `shadowBlur` / `filter` in arcs.** A small source scan in `renderer.test.ts` asserts that `renderer.ts` never assigns `shadowBlur` or `ctx.filter`. This keeps the arc cost model from regressing; it plays the same role as the filter-cost budget.
- **Appearance pref.** Add `lib/__tests__/appearance-electric-arcs.test.ts`, mirroring `appearance-always-evert-globe.test.ts` (PUT/GET round-trip and the seed).

### 7.3 Browser checks (not CI-blocking)

- Add `testing/e2e/jelly-arcs.mjs`, following the pattern of `glass-slab.mjs`.
  - Load the feed, wait, and assert the canvas exists and stays idle: no rAF for 5s with `electricArcs=clicks`.
  - Click a toolbar button and assert one frame burst followed by idle.
  - Toggle high contrast and assert the canvas is removed.
- Add an arc scenario to `synthetic-perf.yml`: a 30s feed idle with ambient arcs on, where p95 frame time must not regress by more than 0.5ms against arcs off.
- Do a manual review across all six themes (Paper, Light, Sepia, Graphite, Nocturne, Ultra) plus high-contrast, at narrow mobile width, with keyboard activation, with a modal open, and with the hub open.

## 8. File-by-file ownership for parallel implementation

| WS                 | Owner     | Files                                                                                                                                                                                                                                                                                                                                                               | Depends on                                     |
| ------------------ | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| A1 pure core       | arcs      | `lib/jelly/arcs/{geometry,bolt,rng,rate,ledger,pairs,timeline}.ts` + their tests                                                                                                                                                                                                                                                                                   | nothing; start immediately                     |
| A2 renderer        | arcs      | `lib/jelly/arcs/renderer.ts`, `app/jelly-arcs.css`, `renderer.test.ts`, the rAF allowlist entry                                                                                                                                                                                                                                                                    | A1 types (`BoltPath`, timeline)                |
| A3 behaviour       | arcs      | `lib/jelly/arcs/{scheduler,clicks,runtime,index}.ts`, `scheduler.test.ts`, temporary `candidates.ts` fallback                                                                                                                                                                                                                                                       | A1, A2; registry/bus/policy interfaces (stub OK) |
| A4 tokens & tiers  | arcs      | `app/globals.css`: `--site-arc-core/glow` in each `.style-*` block and `--z-arcs` / `--z-arcs-modal` in the z-scale; the z-scale gate test                                                                                                                                                                                                                         | material plan's `--site-plasma` naming, if any |
| A5 preference      | arcs      | `prisma/schema.prisma` (+ migration), `lib/appearance/{prefs,prefs-schema,account-seed}.ts`, `app/routes/api/preferences/appearance.ts`, `stores/themeStore.ts`, `components/Providers.tsx`, the settings appearance panel component, `locales/en/*.json` via `pnpm i18n:extract`, `lib/__tests__/appearance-electric-arcs.test.ts`                                  | none (parallel with A1)                        |
| A6 integration     | arcs      | `hooks/useLiquidInteractions.ts` (lazy mount; coordinate if the coverage plan renames it), `lib/eversion/constants.ts` or `lib/liquid/glass/scene.ts` (capture exclusion + test), `useCelebration.ts` (optional `dischargeAt` hook-in, behind the same gates)                                                                                                         | A3                                             |
| shared, not owned  | soft-body | `lib/jelly/bus.ts` (event types in §6.3, agreed up front; arcs may land a stub if the bus is late)                                                                                                                                                                                                                                                                  | —                                              |
| shared, not owned  | coverage  | `lib/jelly/registry.ts`, `lib/jelly/selectors.ts`, `lib/jelly/policy.ts` (off-predicate)                                                                                                                                                                                                                                                                             | —                                              |
| docs               | gates/docs | the arcs section of the new jelly system doc (successor of `docs/liquid-glass-system.md`), `docs/design-language.md` motion/effects section, the `lib/CLAUDE.md` pointer                                                                                                                                                                                            | A3 merged                                      |

Rules for parallel work: A1 exports only pure functions and types and touches no DOM. Only A2
calls rAF. Only A5 touches Prisma and appearance files. A4 is the only workstream that edits
`globals.css` for arcs; batch its edits into one commit to avoid conflicts with the material
plan's token work. Every commit passes `pnpm check:consistency`.

## 9. Contract changes needing sign-off

1. **Clicks.** `docs/liquid-glass-system.md` currently says "Clicks and taps never emit ripples, propagate waves to nearby UI…". Under jelly, a click emits an **overlay arc** that is pure light, changes no layout, and moves no neighbouring host. The doc sentence becomes: _"Clicks never move layout or neighbouring hosts; a click may emit a bounded electric arc on the overlay layer (flash-ledgered)."_ This is owned by the gates/docs plan.
2. **New allowlisted rAF** in `lib/jelly/arcs/renderer.ts` (§7.2).
3. **New z tokens:** `--z-arcs: 45` and `--z-arcs-modal: 55`.
4. **Reduced motion.** It stays retired for arcs; the dedicated `electricArcs` preference is the opt-out (§5.2). The a11y plan must confirm.
5. **Capture exclusion** of `.jelly-arc-layer` in the shared capture selector list.

## 10. Tuning table (single source: `ARC_BUDGET` in `rate.ts`)

| Constant                  | Value        | Notes                                         |
| ------------------------- | ------------ | --------------------------------------------- |
| `lambda0`                 | 0.05 /s      | pair rate at contact                          |
| `decayLength` L           | 48 px        | e-folding gap                                 |
| `maxGap`                  | 240 px       | pairs beyond are ignored                      |
| `maxAmbientRate`          | 0.5 /s       | viewport-wide                                 |
| `minAmbientInterval`      | 1200 ms      |                                               |
| `coarseMultiplier`        | 0.6          |                                               |
| `chargeTau` / threshold / drain | 4 s / 0.35 / 0.6 |                                       |
| `clickRadius` R           | 180 px       | edge gap                                      |
| `maxClickBolts`           | 3 (touch 2)  |                                               |
| `maxLiveArcs`             | 4            |                                               |
| `flashMax` / window       | 3 / 1000 ms  | WCAG 2.3.1                                    |
| `dprCap`                  | 1.5 (coarse 1) |                                             |
| `warmupMs`                | 3000         | after the idle mount                          |
| `maxCandidates`           | 150          |                                               |
