# Globe Eversion — Navigation Transition Implementation Spec

**Date:** 2026-10-17
**Status:** Proposed — not implemented.
**Task plan:** [`2026-10-17-globe-eversion-tasks.md`](./2026-10-17-globe-eversion-tasks.md)
(39 tasks, dependency graph, parallel waves, traceability to the tests in §11).
**Scope:** The liquid-globe hub navigator only (`components/radial/LiquidGlobe.tsx`
via `components/radial/RadialHub.tsx`). Not the Kaikai debt globe, not the Rebar
& Rutabaga menu globe (they share `lib/globe.ts` but do not navigate).
**Companions:** [`components/radial/README.md`](../../components/radial/README.md)
(the globe and the hub), [`docs/design-language.md`](../design-language.md) §0,
§0.5, §7, §13, [`docs/testing.md`](../testing.md),
[`docs/performance-slo.md`](../performance-slo.md).

> **For the implementing agent:** read §1 (the decisions — they were made with
> the product owner and are not up for re-litigation), §3 (architecture) and §11
> (testing) before writing code. Work in the phase order of §13; every phase
> lands green on `pnpm check:consistency`. Where this doc and the code disagree
> about what exists today, the code wins; where they disagree about what should
> be built, this doc wins unless §14 lists it as open.

---

## 0. The effect in one paragraph

You confirm a destination on the liquid globe. The globe **swells** to fill most
of the view while the page you are on **wraps onto its outside** through a map
projection. The globe then **everts** — Thurston's corrugated sphere eversion —
turning slowly so you can watch it. The page you came from starts on the outside
and the page you are going to starts on the inside. Both stay painted on their
own side of the surface throughout the eversion, through every self-intersection.
When the eversion ends the destination is on the outside and the origin is hidden
inside. The destination then **unwraps** into the full-screen rectangle, landing
pixel-for-pixel on the live page. Last, the empty glass globe **shrinks back
into the RMH orb and pops**. Every channel of motion is eased and continuous to
the second derivative, including when the visitor fast-forwards.

---

## 1. Decisions of record

These were settled in the grilling round on 2026-10-17. Numbers refer to the
question list in that conversation.

| #   | Question                    | Decision                                                                                                                                                              |
| --- | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Entry points                | **All** of them: hold-and-release on the reticle, pin click, keyboard Enter on a focused pin. External links keep today's hard navigation.                            |
| 2   | Which globes                | **Only the hub navigator.**                                                                                                                                           |
| 3   | Frequency                   | **Every navigation.** No "first time only", no off switch in Settings (but see §1.1 for the accessibility fallback).                                                  |
| 4   | Skipping                    | **Click/tap/key fast-forwards smoothly.** No hard cuts, ever.                                                                                                         |
| 5   | "Before" page               | The page **as it was before the menu opened** — no veil, no globe.                                                                                                    |
| 6   | Extent                      | **Viewport only** at the current scroll position.                                                                                                                     |
| 7   | Capture fidelity            | **Fastest viable**, performance-first, but accuracy matters.                                                                                                          |
| 8   | "After" page not loaded yet | Navigate for real **underneath** the animation, **and** start with a placeholder on the inside that crossfades to the real capture.                                   |
| 9   | Slow or failing destination | Eversion **stretches** up to a cap, then unwraps onto whatever is live.                                                                                               |
| 10  | Coverage                    | **Full sphere** coverage (both pages).                                                                                                                                |
| 11  | Aspect                      | **Fit page width to 360°**; latitude follows the aspect.                                                                                                              |
| 12  | Poles                       | **Glass caps** carrying the existing wireframe.                                                                                                                       |
| 13  | Projection                  | **All five** available: Mercator, Peirce quincuncial, stereographic, Lambert azimuthal equal-area, equirectangular. **User setting**, with **Random** as the default. |
| 14  | Look                        | Keep a faint cage, the ripple crest and a fresnel rim — it is still the same glass object.                                                                            |
| 15  | Size                        | Diameter **88 % of the shorter viewport side**.                                                                                                                       |
| 16  | Eversion                    | **Thurston corrugations.**                                                                                                                                            |
| 17  | Spin                        | ~**1.25 turns** about a slightly tilted vertical axis, eased to land front-facing and upright.                                                                        |
| 18  | Shading                     | Subtle per-side lighting so the self-intersections read.                                                                                                              |
| 19  | Mirroring                   | The "after" page is **corrected** so it unwraps right-reading.                                                                                                        |
| 20  | Exit                        | The empty globe shrinks into the RMH orb's position and **pops** with a ripple.                                                                                       |
| 21  | Timing                      | **WRAP 700 ms · EVERSION 3200 ms · UNWRAP 700 ms · POP 300 ms** ≈ 4.9 s, velocity carried across stages.                                                              |
| 22  | Back/forward, deep links    | **No animation.**                                                                                                                                                     |
| 23  | Weak devices                | Lower mesh resolution / DPR on weak GPUs is acceptable; 60 fps is the target.                                                                                         |
| 24  | Loading                     | Prefetching **before** navigation is fine, but it **must not affect page content load time.**                                                                         |
| —   | Approach                    | **Hand-rolled WebGL2** + **DOM-to-image capture** (`modern-screenshot`, already a dependency — `lib/library/epub-raster.ts`).                                         |

### 1.1 Decisions this spec makes on the owner's behalf

Each of these follows from the table above or from a repo rule. Each is listed
so it can be overruled.

1. **Reduced motion still wins.** "Every navigation" is read as "not
   rate-limited, not opt-in", not as overriding `prefers-reduced-motion` or the
   account-level `reduceMotion` toggle (`hooks/useReducedMotion.ts`). Under
   either, today's veil-and-navigate path runs unchanged. An approximately
   five-second full-screen rotation is exactly what that preference exists to
   prevent, and design-language §7 requires every motion to be gated off by it.
2. **`perf-lite` runs the effect at the minimum tier** (§8.2) rather than
   skipping it — Q23 accepted lower resolution on weak GPUs. Save-Data does not
   disable it either: the effect makes no network requests of its own beyond a
   chunk that is already prefetched.
3. **Hard fallbacks** (no WebGL2, context creation fails, the "before" capture
   fails or times out) run today's path. The effect only ever _adds_ to the
   navigation; it can never block or delay it.
4. **One projection per navigation.** The same projection is used for wrap and
   unwrap. With Random, a new projection is drawn per navigation, never the same
   as the previous one.
5. **Projection fit policies** for the non-cylindrical projections, where "fit
   width to 360°" has no meaning, are specified in §5.3.
6. **Equirectangular on tall pages** cannot fit width to 360° (a 9:19.5 phone
   page would need 390° of latitude). It falls back to fit-by-height, leaving a
   glass gore at the back (§5.3).
7. **The renderer runs off the main thread** (OffscreenCanvas in a worker)
   where supported, because the destination route renders on the main thread
   _during_ the animation. This follows from Q24 plus "cannot be jerky" (§3.2).
8. **Glass in captures is the designed opaque tier.** The capture cannot
   rasterise `backdrop-filter`. The clone is rendered with the same class the
   opaque glass tier uses, so glass shows as its designed degradation instead of
   as holes (§6.4).

---

## 2. What exists today (verified 2026-10-17)

- **`RadialHub.tsx`** owns the phase machine `closed → open → closing`
  (`MOTION_MS = 500`). It mounts `LiquidGlobe` lazily only while open, preloads
  the chunk on idle (800 ms race), and runs a one-time invisible **rehearsal
  mount** to pre-pay first-open costs.
- **`LiquidGlobe.tsx`** — a 2D-canvas wireframe cage plus DOM-link pins
  projected from the same math (`lib/globe.ts`: `GLOBE_PERSP = 3.1`, `globeK`,
  the 13-ring cage). Confirmation happens in `go()` (`LiquidGlobe.tsx:695`):
  haptic, then `onDismiss()` (the hub closes) then `navigate()`. Locked pins
  already **preload their route** after `LOCK_PRELOAD_SETTLE_MS = 90`
  (`router.preloadRoute`).
- **`lib/fluid.ts`** — springs, `smoothstep`, ripple shape (`RIPPLE`,
  `rippleWave`, `rippleFront`). Reused here; nothing re-derived.
- **`lib/render/`** — `governor.ts` (`FrametimeMonitor`, downscale-only),
  `tier.ts`, `refresh-rate.ts`. Reused for quality steps.
- **`lib/perf-tier.ts`** — `html.perf-lite`.
- **`AppearancePreference`** (`prisma/schema.prisma`) plus `stores/themeStore.ts`
  plus `PUT /api/preferences/appearance` plus `components/settings/AppearancePanel.tsx`
  — the path every comfort setting already takes (localStorage no-flash cache,
  account is the source of truth once signed in).
- **Gates that will see this work:** `lib/__tests__/raf-loop-allowlist.test.ts`
  (new rAF files must be sanctioned), `design-consistency.test.ts`,
  `filter-cost-budget.test.ts`, `scripts/check-bundle-budget.ts` (critical-path
  bytes), `testing/e2e/frame-budget.mjs --gate` (idle at rest).
- **CSP** (`deploy/apache/rmhstudios.conf`) already allows `img-src data: blob:`
  and `worker-src 'self' blob:` — enough for the capture and the renderer
  worker. No CSP change is expected; verify in Phase 1.

---

## 3. Architecture

### 3.1 Module map

```
lib/eversion/                       pure, client-safe, unit-tested in node
  types.ts                          ProjectionId, StageId, EversionPlan, …
  projections.ts                    forward/inverse maps + fit policies (§5)
  projection-lut.ts                 bakes the sphere→page LUT (Float32Array) (§5.4)
  thurston.ts                       TS reference ("oracle") of the eversion (§4)
  timeline.ts                       channels, quintic re-planning, gates, fast-forward (§7)
  mesh.ts                           (θ,φ) grid + index buffer, seam/pole handling
  orientation.ts                    end-map calibration, after-page mirror + alignment (§4.5)
  random.ts                         projection draw (never repeat previous)
  constants.ts                      every tunable in this doc, one place

lib/eversion/gl/                    WebGL2, client-only, no React
  shaders.ts                        GLSL ES 3.00 sources (vertex: wrap+evert+spin; fragment: two-sided page/glass/cage)
  renderer.ts                       context, programs, buffers, textures, draw(), dispose()
  worker.ts                         dedicated worker: owns OffscreenCanvas + the frame loop
  host.ts                           main-thread facade; picks worker or in-thread renderer

lib/eversion/capture.ts             modern-screenshot wrapper: viewport capture → ImageBitmap (§6)
lib/eversion/placeholder.ts         instant 2D placeholder for the destination (§6.5)

components/radial/eversion/
  EversionOverlay.tsx               the fixed full-viewport canvas element + a11y shell
  useEversionController.ts          orchestrates capture → navigate → renderer → hand-back
  eversion.css                      the overlay's and the cover class's styles (tokens only)
```

`components/radial/LiquidGlobe.tsx` and `RadialHub.tsx` are modified (§9); no
other existing file changes behaviour.

### 3.2 Threads

```
MAIN THREAD                                   RENDER WORKER (OffscreenCanvas)
───────────                                   ───────────────────────────────
hub open (+500ms, idle)
  └ capture BEFORE  ──── ImageBitmap ────────▶ (held until start)
release / click / Enter
  ├ snapshot globe state (yaw, pitch, ω, rect)
  ├ build placeholder ── ImageBitmap ────────▶ texture[after] = placeholder
  ├ start ──────────────────────────────────▶ timeline starts, worker rAF loop
  ├ navigate() (router, immediately)
  │   … destination renders on main thread …   frames keep coming: not blocked
  ├ route settled → capture AFTER ─ ImageBitmap ▶ crossfade placeholder→after
  ◀───────────────────────── 'cover' (canvas opaque & presented) ─┤
  ├ html.eversion-cover on (hides live DOM)
  ◀───────────────────────── 'unwrap-done' ──────────────────────┤
  ├ eversion-cover off; 2 rAF ──── 'reveal' ──▶ fade page texture out over the live DOM
  ◀───────────────────────── 'done' ─────────────────────────────┤
  └ unmount overlay, restore orb, focus main     loop stops; textures freed; worker idles
```

**Why a worker.** The destination route mounts, fetches and hydrates on the main
thread while the eversion plays. A main-thread rAF loop would drop frames at
exactly those moments — a 120 ms route render is seven missed frames in the
middle of the effect. A worker-owned `OffscreenCanvas` with the worker's own
`requestAnimationFrame` keeps presenting while the main thread is busy. It costs
the main thread nothing per frame: no uniforms, no `postMessage` per frame.

**Fallback.** Where `OffscreenCanvas` + WebGL2 + worker `requestAnimationFrame`
are not all available, `host.ts` runs the _same_ `renderer.ts` on the main
thread with a normal rAF loop. Feature-detect once, cache the result for the
session. Behaviour is identical. The only difference is that it shares a thread
with the route render (mitigated by §8.4).

**The worker is long-lived but idle.** It is created when the eversion chunk is
first prefetched (§8.1), runs no loop until `start`, and stops its loop on
`done`. Textures and buffers are freed on `done`; programs stay compiled for the
next navigation. Lose the context and terminate the worker on `pagehide`.

### 3.3 Message protocol (main ↔ worker)

All messages are typed in `lib/eversion/types.ts`. The worker never reads the
DOM.

| Direction | Message         | Payload                                                                                             |
| --------- | --------------- | --------------------------------------------------------------------------------------------------- |
| → worker  | `init`          | `OffscreenCanvas` (transferred), tier, DPR cap, theme colours (§10.2)                               |
| → worker  | `prime`         | projection id, viewport `{w,h,dpr}`, globe start state, orb rect, LUT (transferable `Float32Array`) |
| → worker  | `texture`       | `{ slot: 'before' \| 'after' \| 'placeholder', bitmap }` (transferred)                              |
| → worker  | `start`         | `t0` (main `performance.now()`; both share the time origin)                                         |
| → worker  | `fast-forward`  | —                                                                                                   |
| → worker  | `after-failed`  | — (unwrap proceeds on the placeholder; the final reveal crossfades to live DOM)                     |
| → worker  | `resize`        | viewport `{w,h,dpr}`                                                                                |
| → worker  | `reveal`        | — (the live DOM is visible underneath; fade the page texture out)                                   |
| → worker  | `abort`         | — (fast-forward with a skipped gate; see §7.6)                                                      |
| ← main    | `cover`         | the first frame is presented and the canvas is opaque                                               |
| ← main    | `stage`         | `{ stage, t }` — for `performance.mark` and the e2e trace                                           |
| ← main    | `need-after-by` | `{ deadline }` — the timeline's after-gate, for the controller's timeout                            |
| ← main    | `unwrap-done`   | —                                                                                                   |
| ← main    | `done`          | `{ frames, dropped, p95 }` — the frame stats (§11.3)                                                |
| ← main    | `context-lost`  | —                                                                                                   |

---

## 4. The eversion (Thurston corrugations)

### 4.1 Source and licence

Build it from the construction in Silvio Levy, _Making Waves: A Guide to the
Ideas Behind Outside In_ (A K Peters, 1995) — the published math behind
Thurston's corrugation eversion. **Do not paste code from the Geometry Center
`evert` sources** unless its licence is confirmed compatible with this repo (the
repo carries no LICENSE file; treat it as proprietary). Re-derive the
parametrisation from the paper. _Update (T03): the owner authorised referencing
`evert`; the construction was read from McGuffin's port of it and re-implemented
without copying code — provenance and licence text in
[`globe-eversion/thurston-derivation.md`](./globe-eversion/thurston-derivation.md) §0._
The TS oracle (`lib/eversion/thurston.ts`) is
written first and is the reference that the GLSL must match (§11.2).

### 4.2 Parametrisation

The domain is the sphere in longitude/latitude, `θ ∈ [0, 2π)`,
`φ ∈ [−π/2, π/2]`. The eversion is a map `F(θ, φ, e) → ℝ³` for eversion
progress `e ∈ [0, 1]`, built from Levy's stages. With `n = 8` corrugations
(`EVERSION_STRIPS`, tunable 6–10):

| Stage         | Levy's name   | Effect                                                                                |
| ------------- | ------------- | ------------------------------------------------------------------------------------- |
| `corrugate`   | corrugation   | `n` longitudinal corrugations grow on the round sphere.                               |
| `push`        | push          | The two polar halves are pushed through each other along the axis.                    |
| `twist`       | twist         | The equatorial belt rotates by `π/n` (half a corrugation), through the halfway model. |
| `unpush`      | unpush        | (Second half) the halves separate again.                                              |
| `uncorrugate` | uncorrugation | The corrugations flatten onto the now-everted sphere.                                 |

The second half is the first half time-reversed and composed with the symmetry
of the halfway model. The result is that `F(·, 1)` is an **orientation-reversing
isometry** of the unit sphere (§4.5).

### 4.3 Smoothing the stage boundaries

Levy's stages are piecewise in time. Linear time within each stage puts a
velocity kink at every breakpoint, which reads as a stutter. Driving each stage
with `smoothstep` instead stops the surface dead at every boundary, which reads
as robotic.

Instead, each stage parameter `s_k(e)` is a **quintic smoothstep over a window
that overlaps its neighbours by `STAGE_OVERLAP = 0.3`** of the shorter window.
Overlapping stages are still a regular homotopy _if and only if_ the surface
stays an immersion. That is exactly what the immersion test in §11.1 checks. It
is the safety net for tuning the windows, and no window change merges without
it. Starting windows (fractions of `e`, tune visually):

```
corrugate   [0.00, 0.16]
push        [0.10, 0.36]
twist       [0.30, 0.70]   (halfway model at e = 0.5)
unpush      [0.64, 0.90]
uncorrugate [0.84, 1.00]
```

### 4.4 Poles

The longitude/latitude chart is singular at the poles, and Thurston's
corrugations degenerate there by construction (the poles stay put during
corrugation). In the shader:

- The mesh has a dedicated polar fan per pole (`mesh.ts`). It does not have a
  degenerate row of duplicated vertices.
- Normals near the poles (`|φ| > π/2 − POLE_EPS`) are taken from the analytic
  pole normal (`±axis` transformed by the stage), not from finite differences in
  `θ`.
- The polar regions are always **glass caps** under every projection that does
  not reach them (§5.3), so texture distortion near the singularity is never
  visible.

### 4.5 Orientation, two-sided texturing, and the mirror correction

This section is the correctness core of the effect. Implement it exactly.

- **Winding defines the sides.** Triangles are wound counter-clockwise when
  viewed from outside the round sphere at `e = 0`. With `gl.FRONT_FACE = CCW`
  and culling off, `gl_FrontFacing` is true where the visitor sees the original
  outer side. **Front faces sample `before`; back faces sample `after`.** The
  sides are bound to the surface, not to the screen, so the pages stay mapped
  through every self-intersection automatically: a fragment's side is a
  property of the triangle's parametrisation, and the eversion deforms the
  parametrisation continuously.
- **End map.** `F(·, 1) = R · p` where `R` is orthogonal with `det R = −1`.
  `orientation.ts` computes `R` from the oracle by a least-squares fit over the
  grid (Kabsch, allowing a reflection). The test asserts the residual is below
  `1e-4` and `det R ≈ −1`. Because `det R = −1`, after eversion the visible
  outside is the back side → the visitor sees `after`. ✔
- **Mirror correction (Q19).** A side viewed from outside after an
  orientation-reversing map reads mirrored. The `after` page is therefore
  sampled through a **pre-composed domain transform**
  `M_after = R⁻¹ ∘ Rot_align`. With it, the after page's centre lands on the
  camera-facing point at the end of the spin, and its handedness is
  right-reading on screen. This means texture coordinates for `after` come from
  `P(M_after · p)` rather than `P(p)`, where `P` is the projection. Before the
  eversion completes the after page is seen only from "inside", where any
  handedness is acceptable: nobody can read a page through a corrugated sphere.
- **Alignment with the spin (§7.4).** The spin's final angle is chosen so that
  `M_after`'s centre faces the camera exactly at UNWRAP start. The test in
  §11.1 composes oracle, spin, camera and projection, and checks that the
  screen→page-UV Jacobian has a positive determinant (no mirror) and that the
  page's up vector points up.

### 4.6 Final construction parameters (T03)

Fixed by [`globe-eversion/thurston-derivation.md`](./globe-eversion/thurston-derivation.md)
and verified by `globe-eversion/thurston-check.ts`; where this overrides text above, this wins:

- `n = 8` strips; stage windows exactly as in §4.3; `stageParams` writes the five
  windows to slots 0–4, then `κ = c(1−r)`, `sin πw`, `cos πw` to slots 5–7.
- Chart: `u = 1 − 2φ/π`, strip coordinate `v = nθ/2π`; body `(x,y,z) = (X,−Z,Y)` of
  Thurston's frame. The winding normal is `∂φF × ∂θF` (body frame is left-handed).
- Corrugation amplitude `SIZE0 = 0.14` (Thurston's own is 0.2); no global scale,
  `max‖F‖ = 1.336`. Minimum immersion 0.089 (`IMMERSION_MIN` stays 0.05).
- `R = −I` (the antipodal map). The twist is ±π of the caps about the polar axis and
  π of the belt about the viewer axis, not "π/n".
- Halfway symmetry (replaces the wording of §11.1 test 11): `D₈`, i.e.
  `F(θ + 2π/n, φ) = Ry(2π/n) F(θ, φ)` and `F(−θ, −φ) = diag(−1,−1,1) F(θ, φ)` at `e = ½`.
- Poles (§4.4): constant pole normal is only accurate to ≈ 0.003 rad; use the analytic
  surface-of-revolution normal for `|φ| > π/2 − POLE_EPS` with `POLE_EPS = 0.07`.

---

## 5. Projections (WRAP / UNWRAP)

### 5.1 The set

| Id              | Name                           | Class                 | Singular / uncovered regions                    | Look                                                      |
| --------------- | ------------------------------ | --------------------- | ----------------------------------------------- | --------------------------------------------------------- |
| `mercator`      | Mercator                       | conformal cylindrical | poles beyond `φ_max`                            | Default-feeling "world map" wrap; edges meet at the back. |
| `peirce`        | Peirce quincuncial             | conformal             | 4 points                                        | Page folds around from four corners; no polar gap.        |
| `stereographic` | Stereographic (back pole)      | conformal azimuthal   | a cap around the back pole                      | Shrink-wrap: the page puckers into one point behind.      |
| `lambert`       | Lambert azimuthal equal-area   | equal-area azimuthal  | lens-shaped gaps beyond the page corners        | The page closes around the globe into a single point.     |
| `equirect`      | Equirectangular (plate carrée) | neither               | poles beyond `φ_max`, or a back gore (see §5.3) | Plain, the classic texture wrap.                          |

`random` is the default setting. It draws uniformly from the five with
`lib/eversion/random.ts`, excluding the previous draw (kept in `sessionStorage`,
with read/write wrapped in try/catch).

### 5.2 Conventions

- Page UV `(u, v) ∈ [0,1]²`, `v` down, matching the capture bitmap.
- The page centre maps to the sphere point facing the camera at WRAP start,
  given the globe orientation inherited from the hub (§7.3).
- Each projection exports `forward(θ, φ) → (u, v) | null` (null means glass)
  and `inverse(u, v) → (θ, φ)`, plus `fit(viewportW, viewportH) → FitParams`.

### 5.3 Fit policies

`A = H / W` is the viewport aspect.

| Projection      | Fit                                                                                                                                                                                                                             |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `mercator`      | Width ↔ 360° longitude. Latitude `φ_max = 2·atan(e^{π·A}) − π/2`, which gives 70.6° at 16:9 and ≈ 89.9° at 9:19.5. Caps beyond `φ_max` are glass.                                                                               |
| `equirect`      | Width ↔ 360° if `A ≤ 0.5` (then `φ_max = π·A`). Otherwise height ↔ 180° and width ↔ `360°/(2A)` of longitude, centred front; the remaining back gore is glass. (§1.1-6)                                                         |
| `peirce`        | The page is **contained** in the projection's square, centred; the parts of the square outside the page are glass. The longer page side ↔ the square's side. (Conformal end to end, so no stretch; coverage is ≈ `min(A,1/A)`.) |
| `stereographic` | The page is centred on the front tangent plane. Scale so the page's **half-width** subtends 150° from the front point. The rest of the sphere (back cap and, on tall pages, beyond the short sides) is glass.                   |
| `lambert`       | The page's **corners** sit on the projection's bounding circle (radius 2) — the whole page reaches the back point. The four lens-shaped gaps between page edges and circle are glass.                                           |

All fits are pure functions, unit tested for coverage fraction and for the
invariant "the page centre maps to the front point" (§11.1).

### 5.4 The LUT

Peirce needs Jacobi elliptic functions, too heavy for a fragment shader at 60
fps. So every projection is baked the same way: `projection-lut.ts` fills a
`RG32F` texture of **1024 × 512** over `(θ, φ)` with page UV, or `(−1, −1)` for
glass. Baking is ≈ 0.5 M evaluations: run it in the worker on `prime` (target
≤ 25 ms for Peirce on a mid-tier phone; cache the baked LUT per
`projectionId × aspect bucket` for the session). The shaders sample the LUT
with:

- `textureLod(lut, …, 0)` in the **vertex** shader for the flat-page position
  during WRAP/UNWRAP, and
- `texture(lut, …)` in the **fragment** shader for the page lookup. This is
  per-fragment, so there are no per-vertex UV seams, and the lookup is
  `REPEAT` in θ.

Glass-edge antialiasing uses `fwidth` on the distance-to-page-edge in UV
space.

### 5.5 The wrap morph

Each vertex has two positions:

- `flat(p)`: the page pixel `P(p)` placed in the screen plane at `z = 0`, sized
  so the page exactly fills the viewport. Vertices whose LUT entry is glass take
  the **nearest page-edge pixel**, so the caps are collapsed onto the page
  border at `s = 0` and grow out of it. They never fly in from infinity.
- `sphere(p)`: the eversion surface (round at `e = 0`) times radius `r`,
  rotated by the spin.

Blend: `pos = mix(flat, sphere, w)` with a per-vertex **wrap wave**
`w = smootherstep(0, 1, s·(1 + k) − k·d)`, where `s` is the WRAP channel,
`d ∈ [0,1]` is the angular distance from the front point / π, and
`k = WRAP_WAVE = 0.6`. The centre curls onto the globe first and the edges
follow, so it reads as wrapping, not cross-fading. Continuity holds because
`w` is a smooth function of `(s, d)`.

**Pixel-exact endpoints.** The camera is set so that at `s = 0` (WRAP start)
and at `s = 0` of UNWRAP's end, `flat(p)` projects to exactly the page pixel.
This is an orthographic-equivalent placement: the plane `z = 0` sits at the
distance where the perspective scale is 1. §11.1 tests this to < 0.5 px.

UNWRAP is the same morph run backwards on the `after` side, with `M_after`
applied (§4.5).

---

## 6. Capture

### 6.1 Library

`modern-screenshot` (`domToCanvas` / `createContext`), dynamically imported.
**Reuse one context** (`createContext` … `destroyContext`) across the before and
after captures of a navigation. Font embedding and resource fetching are the
expensive part of a capture, and a reused context pays them once. Enable its
fetch workers (`workerUrl` pointing at the bundled worker asset;
`workerNumber: 1`).

### 6.2 BEFORE — when and how

- **When:** after the hub's open motion has finished (`MOTION_MS`), in the next
  `requestIdleCallback` (timeout 300 ms). Never during the 500 ms open morph,
  where a 100 ms task would hitch the bloom. The page under the veil is static
  (scroll is blocked while the hub is open), so a capture at +500 ms _is_ the
  page "before the menu opened" (Q5).
- **Excluded:** `.radial-hub` and its children, the eversion overlay, cookie
  bar and toasts (they are not part of "the page"). Use the library's `filter`.
- **Viewport only:** the output is exactly `innerWidth × innerHeight` CSS px at
  the current scroll, with fixed/sticky elements in their on-screen positions.
  The approach (capture the shell root, offset by the scroll) is the
  implementer's choice. The requirement is the §11.2 pixel test.
- **Scale:** `min(devicePixelRatio, CAPTURE_DPR_CAP[tier])` with
  `{ high: 1.5, mid: 1.25, low: 1.0 }`, and both bitmap dimensions capped at 4096.
- **Budget:** p95 ≤ 120 ms of main-thread time on the desktop reference and
  ≤ 220 ms on the mid-tier phone (§11.3). Hard timeout 600 ms. On timeout or
  throw, mark the navigation "fallback" and run today's path.
- **Staleness:** if the menu stays open longer than 30 s, recapture on the next
  idle. Live SSE updates may have changed the page.
- **Output:** `createImageBitmap(canvas)` → transferred to the worker. Keep no
  main-thread reference.

**Release before the capture is done.** The earliest possible release is about
500 ms (open) + 260 ms (`DWELL_MIN_MS`). If the capture has not resolved, the
controller waits for it for up to 250 ms while the reticle ring holds full with
a soft pulse. Nothing else on screen moves, so there is no discontinuity. If
the capture has still not resolved, run the fallback path.

### 6.3 AFTER — when and how

- `navigate()` is called **immediately at start**, not after the animation. The
  destination's data fetch and render are never delayed by the effect (Q24).
  The locked-pin `preloadRoute` that already exists usually means the route is
  warm.
- "Settled" = the router's pending state is resolved **and** `document.fonts.ready`
  **and** every `<img>` intersecting the viewport is `complete` or has errored
  (cap 1200 ms) **and** two rAFs. Then capture with the same context and
  options as BEFORE.
- The live DOM is hidden under the canvas (`html.eversion-cover`, §6.6). The
  capture override sets the clone root back to fully visible.
- On failure or timeout (1500 ms from settled), send `after-failed`.

### 6.4 Fidelity rules

| Content                                     | Treatment                                                                                                                                                                                                                    |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backdrop-filter` (all `.glass-*` surfaces) | Not rasterisable. The **clone root carries the opaque-glass tier class** (the same one Glass clarity "Opaque" applies), so surfaces render as their designed opaque fallback.                                                |
| Same-origin & CORS images                   | Inlined by the library (cache: `force-cache`).                                                                                                                                                                               |
| Non-CORS cross-origin images                | Library fetch fails → its box is filled with `--site-surface`. Never blocks.                                                                                                                                                 |
| `<video>`                                   | Poster frame, else `--site-surface`.                                                                                                                                                                                         |
| 2D canvases                                 | Copied. WebGL canvases without `preserveDrawingBuffer` capture blank; accepted.                                                                                                                                              |
| Web fonts                                   | Embedded once per context.                                                                                                                                                                                                   |
| Animations mid-flight                       | Captured as they are. `radial-page-rise` has finished by BEFORE; on AFTER the controller adds `data-eversion-settle` to suppress entrance animations on the destination (they would play invisibly under the canvas anyway). |

Fidelity is judged by the §11.2 SSIM thresholds, not by eye.

### 6.5 The placeholder

`placeholder.ts` draws, on a main-thread `OffscreenCanvas` (2D) at the capture
size: the resolved `--site-bg`, the destination's **lucide icon** (the
`NavLeaf`'s icon, stroked at 96 px) and its **translated label** in the site
font, centred. Cost < 3 ms; it is built at release and transferred with
`start`. It crossfades to the real AFTER over `PLACEHOLDER_XFADE = 320 ms` as
soon as that arrives.

### 6.6 Hiding the live page

While the canvas is opaque and covering, the live shell would otherwise keep
compositing under it. The readme's measurement is the warning here: any
`backdrop-filter` beneath an animating layer re-blurs in full every frame. So
on `cover`, the controller adds `html.eversion-cover`, which sets the shell's
root (`.radial-frame` and the backdrop layer) to `opacity: 0`. This is a single
class toggle, not a per-frame write.

- `opacity` and not `visibility` because computed `opacity` is not inherited.
  The capture override restores the clone root alone. `visibility` would be
  inlined as `hidden` on every cloned descendant.
- Removed on `unwrap-done`, before `reveal`, so the live page is already
  painted under the canvas when the page texture fades out.
- The aurora (`.site-aurora`) is under the canvas and hidden by it. That is
  accepted (see §10.1 for what the background shows instead).

---

## 7. Timeline

### 7.1 Channels

Stages are labels. Motion is carried by **channels**, each an independent
scalar animated by quintic segments:

| Channel     | Meaning                                                  | Plan                                                    |
| ----------- | -------------------------------------------------------- | ------------------------------------------------------- |
| `wrap`      | WRAP morph `s`                                           | 0 → 1 over 0–700 ms                                     |
| `radius`    | globe radius                                             | hub radius → `0.44·min(W,H)` over 0–700 ms              |
| `centre`    | globe centre (2D)                                        | hub globe centre → viewport centre over 0–700 ms        |
| `hubFade`   | hub overlay (veil, pins, 2D cage) opacity                | 1 → 0 over 0–250 ms (CSS, main thread; see §9.2)        |
| `evert`     | eversion `e`                                             | 0 → 1 over 600–3900 ms (overlaps WRAP's tail by 100 ms) |
| `spin`      | yaw about the tilted axis                                | inherited ω → ~1.25 turns → aligned, zero ω, by 4300 ms |
| `tilt`      | axis tilt toward the viewer                              | hub pitch → 18° by 900 ms → 0° by 4300 ms               |
| `afterMix`  | placeholder → AFTER crossfade                            | event-driven, 320 ms                                    |
| `unwrap`    | UNWRAP morph                                             | 1 → 0 over 3800–4600 ms                                 |
| `pageAlpha` | page texture opacity during reveal                       | 1 → 0 over 180 ms after `reveal`                        |
| `pop`       | glass globe → orb: radius to orb size, overshoot, ripple | 4600–4900 ms                                            |

The overlaps make the stage boundaries invisible. There is no frame where every
channel's velocity is zero until the very end.

### 7.2 Quintic re-planning — the continuity rule

Every channel segment is a **quintic Hermite** from the channel's current
`(x, ẋ, ẍ)` to a target `(x₁, ẋ₁, ẍ₁)` over a duration. **Any** retime (gate
wait, fast-forward, abort, resize) re-plans each live channel from its _current_
state. Position, velocity and acceleration are continuous across every re-plan
by construction (C²). This is the single mechanism behind "never jerky, never a
hard cut". No code path is allowed to set a channel's value directly.

### 7.3 Inheriting the hub's motion

At release, `LiquidGlobe` reports `{ yaw, pitch, yawVel, pitchVel, centre, radius }`
(§9.1). The WebGL sphere starts in exactly that pose, at that size and position,
moving at that angular velocity. Its cage is drawn with the same 13 rings as the
2D cage (`lib/globe.ts`), so the hand-off frame is visually identical, and the
hub's 2D cage fades out over a cage that is already there.

### 7.4 Spin landing

At the start of EVERSION the `spin` channel is planned to end at
`θ_end = θ_align + 2π·k` with zero velocity and acceleration at 4300 ms, where
`k` is chosen so that the travel from the current angle is the nearest to 1.25
turns. `θ_align` comes from `orientation.ts` (§4.5) and the eversion axis. Each
re-plan re-picks `k` so that the remaining travel is never backwards and never
more than 1.5 turns.

### 7.5 Gates and stretch (Q8, Q9)

- **After-gate:** UNWRAP may not start until the AFTER texture has been
  uploaded **and** its `afterMix` crossfade has finished, or until the
  **stretch cap** is reached.
- If the gate is not open by 3000 ms, `evert` is re-planned to approach
  `e = 0.96` asymptotically (its rate eases toward `MIN_EVERT_RATE = 0.25×`).
  `spin` is re-planned to an extra slow turn (never stopping), and the timeline
  waits.
- The **stretch cap** is +2500 ms. At the cap, or on `after-failed`, the
  timeline proceeds and unwraps **the placeholder**. At `reveal`, the page
  texture fades out over the live DOM (whatever has rendered by then, including
  an error page). That is a crossfade, not a cut.

### 7.6 Fast-forward (Q4)

Any `pointerdown` on the overlay, any key (including Escape), or a wheel
gesture sends `fast-forward`. Every channel is re-planned (§7.2) so that the
**remaining** timeline completes in `FF_REMAINING = 650 ms`, with the
after-gate still enforced: if AFTER is not ready, everything up to the gate
compresses and the gate behaves as in §7.5, with the stretch cap reduced to
+1000 ms. Fast-forward during POP is ignored. A second fast-forward is a no-op.

### 7.7 Clock

- Time-based, never frame-counted. Correct at 60/90/120/144 Hz.
- `dt` is clamped to `MAX_DT = 50 ms` per frame. After a tab switch or a long
  stall, the animation resumes where it was rather than jumping ahead. In the
  main-thread fallback this is also what turns a 120 ms route render into a
  hiccup rather than a teleport.
- `document.visibilitychange` → hidden: the worker pauses its loop.

---

## 8. Performance design

### 8.1 Zero cost to page load

- **No byte of the effect is on the critical path.** `scripts/check-bundle-budget.ts`
  must show a **zero** delta in critical-path bytes (§11.3).
- **Prefetch** (Q24): the eversion chunk, the `modern-screenshot` chunk and the
  worker script are fetched in the _same_ idle race that already preloads
  `LiquidGlobe` (`RadialHub.tsx`, 800 ms idle/timer race), **but only after
  `window` `load`**, and with low priority (`import()` from inside that idle
  callback). The worker is constructed then too (cheap), and so is the WebGL2
  context with its program compilation. Compiling is the expensive first-use
  cost; do it in the hub rehearsal window, the same idea as the existing
  rehearsal.
- **No GPU work until navigation.** Between prefetch and `start` the worker has
  no loop running and presents no frames. `testing/e2e/frame-budget.mjs --gate`
  must still show ≤ 2 frames/s at rest (§11.3).

### 8.2 Tiers

From `lib/render/tier.ts` plus `html.perf-lite`:

| Tier   | Mesh (θ × φ) | Canvas DPR cap | Capture DPR cap | Anisotropic | Notes                   |
| ------ | ------------ | -------------- | --------------- | ----------- | ----------------------- |
| `high` | 256 × 128    | 2.0            | 1.5             | 8×          |                         |
| `mid`  | 192 × 96     | 1.5            | 1.25            | 4×          | default for phones      |
| `low`  | 128 × 64     | 1.0            | 1.0             | off         | `perf-lite` starts here |

Eight corrugations need ≥ 16 longitudinal samples each to stay smooth: 128 is
the floor.

### 8.3 Runtime governor

`FrametimeMonitor` (window 30 frames, target 55 fps) in the worker. It is
**downscale-only**, steps the canvas DPR (never the mesh, which would pop
geometry) by 0.75× per step to a floor of 0.75, and allows at most two steps
per navigation. A DPR step changes sharpness, never position, so it does not
break continuity.

### 8.4 Per-frame work

- **CPU:** the worker writes about 8 uniforms and issues **2 draw calls** — the
  page/glass surface, then the cage lines from the same vertex shader. There
  are no allocations in the loop (the same rule as `LiquidGlobe`'s loop) and no
  `postMessage` per frame (only `stage` events: about 6 per navigation).
- **GPU:** the vertex shader evaluates `F` three times (centre + two
  finite-difference taps for the normal): 33 k verts × 3 at `high`, which is
  trivial. The fragment shader does 1 LUT tap + 1 page tap + fresnel.
  Overdraw is ≤ 3 layers inside the corrugations. Depth testing is on, with no
  sorting and no transparency, until POP.
- **Main thread during the effect:** the after capture (budget §6.2) plus the
  route render the visitor would have paid anyway. Nothing else.

### 8.5 Memory and cleanup

There are two page textures (≤ 4096² RGBA8 each, typically ~1440 × 900 × 1.5²)
plus the LUT (4 MB at RG32F; use RG16F where `EXT_color_buffer_half_float`
isn't needed: it is sampled, never rendered to, so **RG16F is fine** and costs
2 MB). Free both page textures, `ImageBitmap.close()` every bitmap, and release
the LUT on `done`. A 20-navigation soak must show a flat texture count and heap
(§11.3).

---

## 9. Integration

### 9.1 `LiquidGlobe.tsx`

`go(node)` changes from "dismiss + navigate" to:

```ts
if (node.external) {
  window.location.href = node.href;
  return;
}
onNavigate(node, snapshotGlobeState()); // new prop; replaces onDismiss() + navigate()
```

`snapshotGlobeState()` returns the current yaw/pitch, their velocities from the
existing `VelocityTracker`, and the globe's centre and radius from the cached
`cageSpan` and root rect (no new layout read in the hot path). Pin click,
keyboard Enter and hold-release all already converge on `go()`, so all three
entry points get the effect (Q1) with no per-entry code. Ripples in flight are
not carried over (the 2D cage fades out under the WebGL one).

### 9.2 `RadialHub.tsx`

A new phase: `closed → open → everting → closed` (the existing `closing` stays
for dismissals). `onNavigate` → `useEversionController.start()`:

1. If ineligible (§1.1-1/3: reduced motion, no WebGL2, BEFORE capture missing
   after the 250 ms grace, the eversion chunk not loaded), run today's
   `dismissForNavigation()` + `navigate()` and stop.
2. Mount `EversionOverlay` (fixed, full viewport, `z-index` just under the hub
   overlay). Send `prime` + `start`.
3. Set `data-phase="everting"`. In `radial.css` this fades the veil, globe and
   foot capsule out over 250 ms (`hubFade`) and hides the orb.
4. `navigate()`.
5. On `done`: unmount the overlay, set phase `closed`, bring the orb back with
   the pop's final frame (the orb scales from the pop's end radius, with
   matching size and position), and let the router's normal focus management
   land focus on the new page (as today: no focus restore to the orb after a
   navigation).

### 9.3 Settings

- **Schema:** add `navTransition String? @db.VarChar(16)` to
  `AppearancePreference` (null → `random`). Migration under `prisma/migrations/`
  with the usual naming.
- **API:** extend the zod body of `PUT /api/preferences/appearance` with
  `navTransition: z.enum(['random','mercator','peirce','stereographic','lambert','equirect'])`.
- **Store:** `themeStore.navTransition` with the same localStorage no-flash
  cache as the other comfort fields.
- **UI:** a row in `AppearancePanel` under Motion: "Navigation transition",
  a select with the six options and a one-line description each. Strings go
  through `t()` in the `settings-appearance` namespace, then
  `pnpm i18n:extract`. Mind design-language §10's two traps: new key for new
  wording; no JSX comment directly before `t()`. When reduced motion is on, the
  row is disabled with a hint that reduced motion replaces the transition.
- Optional, cheap, and worth it: a **Preview** button that runs the effect
  in place, navigating to the current route, so the choice can be judged.

### 9.4 Router edge cases

| Case                                                     | Behaviour                                                                                                                                        |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Destination is the current route                         | Run the effect; AFTER is the same page re-captured. (Also the Preview path.)                                                                     |
| Browser back/forward during the effect                   | `abort`: fast-forward with the gate skipped once AFTER is unavailable; the final `reveal` crossfades to whatever is live.                        |
| Navigation error / 404                                   | The router renders its error component → that is captured as AFTER like any page.                                                                |
| Redirect (e.g. auth-gated)                               | Capture whatever the redirect lands on.                                                                                                          |
| Resize / rotation mid-effect                             | `resize`: the canvas resizes; flat-target geometry uses the new viewport; textures stretch until `reveal`, whose crossfade hides the difference. |
| WebGL context lost mid-effect                            | `context-lost` → the controller removes `eversion-cover`, fades the overlay element out over 200 ms (CSS) and finishes as today.                 |
| Tab hidden mid-effect                                    | Pauses (§7.7); resumes on return.                                                                                                                |
| A second navigation (e.g. a link in the page) mid-effect | Not reachable: the overlay takes pointer input (it fast-forwards). Keyboard input fast-forwards too.                                             |

---

## 10. Visual design

### 10.1 Background

The canvas is **opaque** from its first frame, cleared to the resolved veil
colour (the `.radial-hub__veil` computed background composited over
`--site-bg`). At WRAP start the flat page fills the canvas exactly. As it
curls onto the globe, the veil colour shows around it, which is what the hub
overlay was showing a moment ago. During `reveal` and POP the canvas switches
to `alpha` output (the context is created `alpha: true, premultipliedAlpha:
true`) so the live page shows through around the shrinking glass globe.

### 10.2 Theme

Colours are resolved once at `prime` from computed styles. This is the same
pattern and the same registered `--cage-*` tokens `LiquidGlobe` reads
(including its `color-mix` fallback), plus `--site-bg`, `--site-accent`, and
the veil. They are passed as uniforms. Verify all three themes (dark, light,
high-contrast) in §11.2. **No raw colours in GLSL**: every colour is a uniform
fed from tokens.

### 10.3 Shading

- **Page:** the texture, multiplied by a gentle Lambert term
  `0.82 + 0.18·max(n·l, 0)`, with `l` fixed upper-left (the site's light
  convention).
- **Sides (Q18):** back faces (`after` while it is inside) get an extra
  `0.9×` and a 4 % accent tint, so each sheet of a self-intersection reads as
  separate.
- **Rim:** fresnel `pow(1 − |n·v|, 3)` × 0.35 in `--cage-major`. It is
  strongest at the silhouette, which is what makes the corrugations legible.
- **Glass caps/gores:** fresnel and the cage only, over the veil colour.
- **Cage:** the 13 rings, as anti-aliased procedural lines from the domain
  coordinates (`fwidth`), alpha 0.35 → 0.15 over EVERSION so the pages lead.
- **Ripple crest:** at `start`, one ripple is emitted from the front point.
  It uses the exact `lib/fluid` `RIPPLE` shape, evaluated in the vertex shader
  as a radial displacement. It ties the effect to the globe the visitor just
  poked. POP emits a second one.

### 10.4 Accessibility

- The canvas is `aria-hidden="true"`. The overlay root has `role="presentation"`.
  Route announcements are the router's, as today.
- No flashes: luminance never changes by more than 20 % in under 100 ms (the
  crossfades are ≥ 180 ms). This is checked in §11.2.
- The 4.9 s duration is always one input away from ≤ 650 ms (§7.6).
- Focus: nothing is focusable inside the overlay. At `done`, focus goes where
  the router puts it for any navigation.

---

## 11. Testing

The suites below map onto the repo's existing harnesses: vitest (node,
`lib/**/__tests__`) for pure math, and Playwright scripts under `testing/e2e/`
against the **built** app for rendering and performance. Per
[`docs/testing.md`](../testing.md), vitest is environment-agnostic, so GL and
DOM capture are tested in e2e only.

### 11.1 Unit — `lib/eversion/__tests__/` (vitest, node)

**Projections (`projections.test.ts`)**

1. **Round-trip:** `inverse(forward(p)) = p` to 1e-9 over a 512 × 256 grid,
   excluding a 1e-3 rad neighbourhood of each projection's singular set.
2. **Conformality:** for `mercator`, `peirce` and `stereographic`, the forward
   Jacobian at every grid point is a scaled rotation:
   `|J₁₁ − J₂₂| + |J₁₂ + J₂₁| ≤ 1e-6 · ‖J‖` (scaled by the cos φ metric).
3. **Equal area:** for `lambert`, `det J · (1/cos φ)` is constant to 1e-6.
4. **Fit invariants:** for aspects {9:19.5, 3:4, 1:1, 16:10, 16:9, 21:9}, the
   page centre maps to the front point. Mercator's `φ_max` matches the closed
   form. Equirect switches policy exactly at `A = 0.5`. The covered-area
   fraction is within 1 % of the analytic value.
5. **LUT:** for random samples, the baked LUT bilinearly interpolated matches
   `forward` to ≤ 0.5 px at 4096 px page width, except within 2 texels of a
   glass edge.

**Thurston oracle (`thurston.test.ts`)** — sampled on a 256 × 128 grid at
2001 values of `e`:

6. **Start:** `F(p, 0) = p` to 1e-9 (unit radius, identity).
7. **End:** `F(p, 1) = R·p` with `R` orthogonal, `det R = −1 ± 1e-6`, residual
   ≤ 1e-4.
8. **Immersion (the key one):** `‖∂θF × ∂φF‖ / cos φ ≥ IMMERSION_MIN` at every
   sample and every `e`, outside the polar fans, plus a separate check of the
   polar fans in a polar chart. A failure means a crease or pinch, which is not
   a valid eversion. This must hold for the **smoothed** stage windows of §4.3.
9. **Time continuity:** `max_p ‖F(p, e+δ) − F(p, e)‖ ≤ L·δ` (Lipschitz), and
   the second difference is bounded (C¹ in time). Both are tested at
   δ = 1/2000 across every stage window boundary.
10. **Bounded:** `max ‖F‖ ≤ 1.35` for all `e`. Radius `0.44·min(W,H)` × 1.35
    must stay inside the viewport, so the effect never clips.
11. **Symmetry:** the halfway model `F(·, 0.5)` is invariant under the expected
    symmetry (rotation by `π/n` composed with the reflection), to 1e-6.

**Orientation (`orientation.test.ts`)**

12. At `e = 0`, outward normals (by winding) satisfy `n·F > 0` everywhere. At
    `e = 1`, `n·F < 0` everywhere, so the visible side has flipped to `after`.
13. **No mirror:** compose oracle at `e = 1` → `spin(θ_end)` → camera →
    `P(M_after ·)`. The screen→page-UV Jacobian has `det > 0` and page-up maps
    to screen-up, at 100 points across the visible hemisphere.
14. **Alignment:** at UNWRAP start, the after page's centre is within 0.1° of
    the camera-facing point.

**Morph (`morph.test.ts`)**

15. **Pixel-exact endpoints:** at WRAP `s = 0` and at UNWRAP end, every vertex
    projects to its page pixel within 0.5 px, at three viewport sizes (360×780,
    1440×900, 2560×1440) and DPR 1/2/3.
16. **No fly-ins:** at `s = 0` every glass vertex is on the page border. The
    max screen-space vertex speed over the WRAP channel is ≤ 3× the median
    vertex speed.

**Timeline (`timeline.test.ts`)** — property-based, 10 000 seeded runs, each
with a random fast-forward instant, random AFTER-arrival time (or never),
random resize instants and random frame `dt` sequences (including 50 ms+
stalls):

17. **C² continuity:** for every channel, `|Δx|`, `|Δẋ|` and `|Δẍ|` across
    every re-plan instant are ≤ 1e-9 (analytic, at the boundary).
18. **Gate:** UNWRAP never starts before AFTER is ready, except at the stretch
    cap or after `after-failed`.
19. **Bounds:** the total duration is ≤ 4.9 s + 2.5 s cap. After fast-forward,
    completion is ≤ 650 ms + any gate wait (≤ 1 s cap) + POP.
20. **Monotone stages:** stage events are emitted in order, each exactly once.
21. **Spin:** the remaining travel is never negative and never more than 1.5
    turns. The final angle aligns (test 14) with zero velocity.
22. **Clock:** a `dt` of 10 s advances the timeline by at most 50 ms.

**Settings & misc**

23. `random.ts` never returns the previous projection over 10 000 draws, and
    the distribution is uniform over the other four (χ², p > 0.01).
24. The API zod schema accepts exactly the six values and `null`. The route
    stays on `defineHandler` (the existing API handler gate covers this).

**Existing gates updated in the same commit as the code they cover**

- `raf-loop-allowlist.test.ts`: add `lib/eversion/gl/worker.ts` and
  `lib/eversion/gl/host.ts` with the justification "bounded by the navigation:
  the loop starts at `start` and stops at `done`/`abort`/`context-lost`; no
  loop runs at rest".
- `design-consistency.test.ts` passes on `eversion.css` (tokens only, no
  `transition-all`, no raw colours).
- i18n catalog/namespace tests pass with the new settings strings.

### 11.2 Rendering & integration — `testing/e2e/eversion.mjs` (Playwright, built app)

Run against `pnpm build && node .output/server/index.mjs`, in Chromium (GPU
via SwiftShader in CI) at the **desktop** (1440 × 900 @1) and **mobile**
(390 × 844 @3, touch) profiles, in **dark**, **light** and **high-contrast**.
The script records `performance.mark`s (`eversion:start`, `:cover`, `:evert`,
`:gate-open`, `:unwrap`, `:reveal`, `:done`) and the worker's `done` stats, and
uses CDP `Page.startScreencast` for frame capture.

25. **Entry points:** hold-and-release, pin click and keyboard Enter each run
    the effect to `done`. Final URL correct. Overlay unmounted. `eversion-cover`
    removed. Focus is in the new page's `main`. The orb is back and focusable.
26. **External pin:** a full navigation; no overlay is ever mounted.
27. **GLSL ↔ oracle parity:** a test-only entry renders `F(p, e)` for 64
    values of `e` via **transform feedback** into a buffer, reads it back and
    compares with the TS oracle: max error ≤ 1e-4. This proves the shader is
    the eversion the unit tests verified.
28. **Two-sidedness:** a test build fills `before` solid red and `after` solid
    blue. At `e = 0` the frame has 0 % blue. At `e = 1` (paused via the test
    hook) it has 0 % red. In the middle both are present. No fragment ever
    shows a colour other than red, blue, glass or veil (no texture bleed across
    sides).
29. **First frame = before page:** the `cover` frame vs a Playwright screenshot
    of the page taken just before the hub opened. SSIM ≥ 0.97 desktop and
    ≥ 0.95 mobile. This also catches capture-geometry bugs: scroll offset,
    fixed elements, DPR.
30. **Last page frame = live page:** the final full-page frame before `reveal`
    vs a screenshot after `done`: SSIM ≥ 0.97 / 0.95.
31. **Jerk detector (smoothness, Q4 and "no hard cuts"):** over the screencast,
    compute the mean absolute per-pixel difference between consecutive frames,
    normalised by the run's median. **Fail if any frame exceeds 4× the median**
    outside the expected crossfades. Run it (a) uninterrupted, (b) with a
    fast-forward click at 20 seeded random instants, (c) with a 4 s delayed
    destination (route intercept), and (d) with a destination that 500s.
32. **Photosensitivity:** relative luminance of the frame mean never changes by
    > 20 % within 100 ms.
33. **Slow destination (Q9):** destination data delayed 4 s. The placeholder
    is visible, `:gate-open` arrives at the cap (+2.5 s), and the final
    crossfade lands on the live page. Delayed 1.2 s: AFTER crossfades in and
    the cap is not reached.
34. **Fallbacks:** each of {`prefers-reduced-motion: reduce`, account
    `reduceMotion`, WebGL2 disabled (`--disable-webgl2` or a `getContext`
    override), BEFORE capture throws, BEFORE capture exceeds 600 ms} → no
    overlay, today's behaviour, navigation completes. The time from
    confirmation to the router's resolved state is within 5 % of the baseline
    (test 41).
35. **Fault injection mid-effect:** `WEBGL_lose_context.loseContext()` during
    EVERSION → 200 ms fade, page usable, no console errors. Browser back during
    EVERSION → abort path, ends on the back target. Viewport resize and
    `setViewportSize` rotation during WRAP and EVERSION → completes; test 31
    passes with the resize frame excluded.
36. **Worker fallback parity:** force the in-thread renderer (no
    OffscreenCanvas); tests 25, 28–31 must pass identically.
37. **Settings:** each of the six options persists (signed in → reload →
    same; signed out → localStorage). The forced projection is the one used
    (exposed via the `eversion:start` mark's `detail`). Random never repeats
    across 10 consecutive navigations.
38. **No console errors** or unhandled rejections across the whole e2e run.

### 11.3 Performance — gates and measurements

**CI gates (blocking once Phase 6 lands):**

39. **Critical path untouched:** `pnpm run check:bundle-budget` delta in
    critical-path bytes = **0**. A new assertion in the same script fails if
    any eversion chunk, `modern-screenshot`, or the worker appears in the
    entry's static closure.
40. **Nothing before load:** on a cold load of `/`, `/explore` and one game
    page, the network log shows **no eversion, capture or worker request
    before `load`**, and none at all on full-screen routes that have no hub.
    LCP and TBT (Playwright + `PerformanceObserver`, 10 runs, median) are
    within noise (±3 %) of the base branch.
41. **Navigation not delayed (Q24):** for 6 destinations (feed, explore, a
    settings page, profile, a heavy page with media, a light page), 20 runs
    each, measure confirmation → router resolved and confirmation → destination
    LCP element painted (`largest-contentful-paint` is not re-emitted on soft
    navigation, so mark the destination's hero/heading via `MutationObserver`
    - rAF). With the effect vs the fallback path: **median Δ ≤ 5 % and
      ≤ 30 ms**.
42. **Idle at rest:** `node testing/e2e/frame-budget.mjs --gate` passes. In
    addition, after `done`: 0 perpetual animations, ≤ 2 frames/s within 1 s,
    and the worker reports no running loop.
43. **Frame pacing (regression-relative):** the worker's `done` stats (frame
    intervals measured in-worker) under SwiftShader are compared with a
    committed baseline JSON (`testing/e2e/baselines/eversion-frames.json`).
    Fail if p95 interval regresses > 15 % or the dropped-frame share regresses
    > 2 points. Absolute SwiftShader numbers are pessimistic; per
    > `frame-budget.mjs`'s own note, compare builds, not devices.
44. **Main thread during the effect:** count long tasks (> 50 ms) between
    `:start` and `:done`, excluding those attributed to the destination
    route's own render (attribute by stack/`PerformanceLongTaskTiming`
    container, or by diffing against the fallback run). Gate: the effect adds
    **≤ 1** long task (the AFTER capture), and that task is ≤ 120 ms on the CI
    desktop profile.
45. **Soak / leaks:** 20 consecutive effect navigations. WebGL live object
    counts (wrapped `create*`/`delete*` counters in a test build) return to
    the post-prime baseline after each `done`. JS heap after GC (CDP
    `HeapProfiler.collectGarbage` + `Runtime.getHeapUsage`) grows ≤ 2 MB over
    the run. Exactly 1 worker exists.
46. **Capture budget:** BEFORE and AFTER capture main-thread durations
    recorded via marks. CI desktop p95 ≤ 120 ms over the 6 routes × 10 runs.

**Device lab (manual, release gate for Phase 7, recorded in the PR):**

| Device class                     | Example                        | Target                                                                |
| -------------------------------- | ------------------------------ | --------------------------------------------------------------------- |
| Desktop, discrete/Apple GPU      | M-series MacBook, 120 Hz       | p95 frame ≤ 9 ms at 120 Hz; 0 frames > 25 ms                          |
| Desktop, integrated              | Intel Iris Xe laptop, 60 Hz    | p95 ≤ 17.5 ms; ≤ 1 frame > 33 ms per run                              |
| Phone, recent iOS                | iPhone 13+ (Safari)            | p95 ≤ 17.5 ms; ≤ 1 frame > 33 ms; in-thread fallback if no worker rAF |
| Phone, mid Android               | Pixel 6a / Galaxy A5x (Chrome) | p95 ≤ 17.5 ms at `mid`; governor ≤ 1 step                             |
| Phone, low Android (`perf-lite`) | ≤ 4 GB RAM, Mali-G52-class     | p95 ≤ 25 ms at `low`; no frame > 50 ms; capture ≤ 300 ms              |
| Firefox desktop                  | —                              | parity with Chromium integrated                                       |

Each run uses the in-worker stats from `done` (exposed in a
`?eversion-debug=1` overlay that prints them; the overlay is tree-shaken out
when the flag is absent) plus a 240 fps phone-camera recording of one
fast-forward per device, reviewed for visible stutter.

### 11.4 Where each gate runs

| Gate                            | When                                                                                                                                                                                        |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1–24                            | `pnpm test` (main vitest suite, `web-ci.yml`); 8 and 17 must stay < 2 s together.                                                                                                           |
| allowlist / design / i18n gates | `pnpm check:consistency` (every commit)                                                                                                                                                     |
| 25–46                           | new job `eversion-e2e` in `web-ci.yml` after `build`, path-filtered to `lib/eversion/**`, `components/radial/**`, `app/globals.css` and the capture/settings files; plus nightly on `main`. |
| 39                              | the existing `check:bundle-budget` step (already blocking)                                                                                                                                  |
| Device lab                      | before Phase 7's flag flip, recorded in the PR                                                                                                                                              |

---

## 12. Constants (`lib/eversion/constants.ts`)

```ts
export const WRAP_MS = 700;
export const EVERT_MS = 3200;
export const UNWRAP_MS = 700;
export const POP_MS = 300;
export const EVERT_OVERLAP_MS = 100;
export const UNWRAP_OVERLAP_MS = 100;
export const GLOBE_FILL = 0.88; // diameter / min(W,H)
export const SPIN_TURNS = 1.25;
export const SPIN_TILT_DEG = 18;
export const EVERSION_STRIPS = 8;
export const STAGE_OVERLAP = 0.3;
export const WRAP_WAVE = 0.6;
export const PLACEHOLDER_XFADE_MS = 320;
export const REVEAL_MS = 180;
export const HUB_FADE_MS = 250;
export const STRETCH_CAP_MS = 2500;
export const FF_REMAINING_MS = 650;
export const FF_STRETCH_CAP_MS = 1000;
export const MIN_EVERT_RATE = 0.25;
export const MAX_DT_MS = 50;
export const BEFORE_GRACE_MS = 250;
export const CAPTURE_TIMEOUT_MS = 600;
export const AFTER_SETTLE_CAP_MS = 1200;
export const AFTER_CAPTURE_TIMEOUT_MS = 1500;
export const BEFORE_STALE_MS = 30_000;
export const LUT_SIZE = [1024, 512] as const;
```

Every time-shaped constant is a planned duration for a quintic segment, not a
CSS duration. Design-language §7's "nothing slower than 0.3 s" governs UI state
changes; this is a navigation transition. Document the exception in §7 (§13,
Phase 7).

---

## 13. Phases

Each phase is one or more focused commits, green on `pnpm check:consistency`.

| Phase | Deliverable                                                                                                                                                                                                             | Exit criteria                                                                         |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| 1     | `lib/eversion` math: projections, LUT bake, Thurston oracle, orientation, timeline, mesh, random.                                                                                                                       | Tests 1–24 green. Immersion holds with smoothed windows.                              |
| 2     | Standalone harness route (test-only, `noindex`, not in the sitemap or nav): WebGL2 renderer + shaders on two static images; all channels; scrub slider; projection picker.                                              | Tests 27, 28 green; visual sign-off by the owner on the eversion and each projection. |
| 3     | Worker + host + in-thread fallback; message protocol; governor; tiers.                                                                                                                                                  | Test 36; worker frame stats reporting.                                                |
| 4     | Capture (`capture.ts`, placeholder, cover class), measured on real routes.                                                                                                                                              | Tests 29, 30, 46 green.                                                               |
| 5     | Hub/globe integration (§9.1–9.2), prefetch wiring (§8.1), edge cases (§9.4).                                                                                                                                            | Tests 25, 26, 31–35, 38–42 green.                                                     |
| 6     | Settings (schema, API, store, panel, i18n, Preview).                                                                                                                                                                    | Test 37; i18n gates.                                                                  |
| 7     | Perf hardening, soak, device lab; docs: `components/radial/README.md` (new "Globe eversion" section and file rows), design-language §7 exception, `docs/README.md` row; remove the harness route or keep it admin-only. | Tests 43–45 green; device-lab table filled in the PR.                                 |

---

## 14. Open items to verify during implementation

1. **Worker `requestAnimationFrame` on Safari.** If it is unavailable,
   `host.ts` uses the in-thread renderer there (already specified). Measure
   whether iOS then needs the `low` tier to hold the device-lab target.
   _Resolved by T25 (unverified on device):_ every WebKit engine (Safari and all of iOS) runs the in-thread host until T38 shows worker rAF presenting there (`WEBKIT_USES_WORKER` in `host.ts`); a worker's clock origin also differs from the page's, which `core.ts` corrects at `start`.
2. **`modern-screenshot` viewport-crop mechanics** with this shell's
   fixed/sticky layers and the `radial.css` de-stick rules. The requirement is
   test 29; the mechanism is open.
3. **The exact opaque-glass class** to put on the capture clone (§6.4). Use
   whatever the Glass clarity "Opaque" stop applies today.
4. ~~**Thurston construction licence** (§4.1) — re-derive from the paper unless
   confirmed.~~ **Resolved (T03):** derived from published mathematics, no code
   copied — see [`globe-eversion/thurston-derivation.md`](./globe-eversion/thurston-derivation.md).
   The owner authorised referencing the Geometry Center `evert` code; its geometry
   generator (read via M. McGuffin's `sphereEversion` 0.4 port; no explicit licence
   grant exists, only "freely available" and "used with permission") was read for the
   mathematics only and re-implemented — provenance and verbatim notices in that
   note's §0. The Bednorz–Bednorz analytic eversion of the first attempt is kept as
   a verified fallback in its Appendix A.
5. **Polar fan normals** under the push stage. If test 8's polar check is
   marginal, raise `POLE_EPS` or switch the poles to an analytic chart.
