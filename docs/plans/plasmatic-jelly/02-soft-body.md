# Plasmatic Jelly 02: soft-body hover, press, release and drag

Status: plan, 2026-10-23. Scope: how every UI element deforms under the pointer.
Sibling plans cover the hazy material and interior motion (01), electric arcs (03),
coverage, accessibility and performance policy, and the gates and docs migration. Where
this plan needs something from a sibling, it says so under **Dependencies**.

This plan reverses three rules in `docs/liquid-glass-system.md`: "Clicks never push or
bounce neighbouring surfaces", "text and hit areas remain fixed", and the `hover-css.ts`
rationale that hosts never move. The rules it keeps are: one delegated document
service, no per-component pointer loops, no animated root custom properties, no layout
reads for each pointer event, no rAF loop at rest, compositor-only writes, and no
`backdrop-filter`.

---

## 0. Decisions at a glance

| #   | Decision                                                                                                                                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | **Two tiers.** **Tier E (envelope)** applies to every eligible element: a 4-DOF affine soft body written to the CSS `translate` and `scale` properties. **Tier L (lattice)** applies only to shader-admitted surfaces: an 8-node perimeter spring lattice that warps the slab's SDF in the shader. The host stays still. |
| D2  | One document service, `installJellyPhysics()` in `lib/jelly/physics.ts`, mounted by `useJellyPhysics()`. It **replaces** `useFluidPressLayer` (the radial shell's delegated press spring). The `data-fluid-press*` attributes stay as aliases.                                                          |
| D3  | Amplitude is capped by **both** a percentage and a pixel distance: `≤3%` and `≤4px` of travel at any edge. Large elements therefore deform proportionally less. Panes (Tier L) never get a host affine, so their text never moves.                                                                    |
| D4  | Volume (area) is preserved: a squash on one axis bulges the other (`sx·sy ≈ s0²`). A release overshoots and wobbles 2 to 3 visible cycles, then sleeps.                                                                                                                                                  |
| D5  | Neighbours get a **bounded nudge**: at most 4 siblings, at most 1.5px, applied through `translate` only. Layout never changes. It fires only above an energy threshold and never while scrolling.                                                                                                       |
| D6  | framer-motion stays compatible because the service writes only the independent `translate`/`scale` properties, composed with a base read once at activation. An element whose inline `transform` is changing (framer is animating it) is set to rest for those frames.                                |
| D7  | The service holds at most 12 Tier E bodies (6 on coarse pointers) and at most 8 Tier L bodies, which is the engine's existing budget. The rAF stops when every body sleeps. Rects are read only at activation or after a scroll, in a batched read phase.                                                |
| D8  | The Wasm dough kernel is **not** reused. The lattice is about 100 flops per step and a JS-to-Wasm crossing costs more than that. We reuse dough's **ideas**: elastic plus a small plastic layer, a saturating ceiling, sleep at REST, and capped substeps.                                                 |
| D9  | The Tier L lattice is **stepped inside the glass engine's frame**, using the pure solver in `lib/jelly/lattice.ts`. Inputs arrive through `lib/jelly/bridge.ts`, so the warp is never a frame behind the draw.                                                                                           |
| D10 | Touch gets press, release and drag jelly but no hover. On every device, hover hysteresis uses the **rest** rect plus a 4px margin, so a bulging element can't cause enter/leave flicker.                                                                                                                  |

---

## 1. The deformation model

### 1.1 Options considered

| Option                                                                       | Verdict                                                                                                                                                                                                                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) CSS affine on the host (squash and stretch through `scale`/`translate`)  | **Adopted as Tier E.** It is compositor-only and reaches every element. Text and hit areas move with it, but at ≤3% and ≤4px that is the same order as today's 0.96 press, which already ships. CSS has no individual `skew` property, so shear is excluded and stretch is projected onto the x and y axes.                                                                                             |
| (b) Visual-only deformation of the shader slab, plus a CSS radius/clip morph | **Adopted for the slab (Tier L).** The `border-radius` morph is adopted only for small controls ("corner flex", §1.4). A `clip-path` morph is rejected: it clips focus rings, menus and arcs, and it repaints the subtree.                                                                                                                                                                                  |
| (c) Per-element spring-mass lattice                                          | **Adopted for Tier L only.** Its output feeds shader uniforms, not CSS. Driving `clip-path` or SVG paths from it costs a paint per frame for each element, and it is the wrong choice for 12 simultaneous bodies.                                                                                                                                                                                         |

### 1.2 Tier E: envelope body (all eligible elements)

**State.** Each active element holds four independent springs: `sx`, `sy` (scale
multipliers about the element's centre, rest 1) and `tx`, `ty` (px, rest 0). Each one
is advanced with the existing **analytic** `springStep` from `lib/fluid.ts`, which
stays unconditionally stable at any `dt`. No new integrator is needed for Tier E.

**Write.** Each frame does one style write per property:
`el.style.scale = "${bs·sx} ${bs·sy}"` and
`el.style.translate = "calc(${btx} + ${tx}px) calc(${bty} + ${ty}px)"`.
`bs`, `btx` and `bty` are the computed `scale` and `translate` read once at activation
(§3.4). At sleep, both properties and `will-change` are cleared back to `''`. This is
the lifecycle the current press layer already uses.

**Caps.** `s0` is the mode's base scale and `size` is the element's rest width and
height:

```
maxScaleDev(axis) = min(0.03, 4px / size[axis] * 2)      // ≤3% and ≤4px of travel at each edge
maxTranslate      = min(2px, 0.006 · min(w, h))           // hover lean
```

A soft saturating ceiling (`x → cap·tanh(x/cap)`, the dough `U_MAX` idea) is applied
**after** the spring, so a violent flick never shows a clamp edge.

**Spring constants.** Each spring is given by perceptual period `T` and damping
ratio `ζ`, with `k = (2π/T)²` and `c = 2ζ·2π/T` at unit mass. Each one is added to
`SPRINGS` in `lib/fluid.ts` and to `APPLE_SPRING` in `lib/motion.ts` as `bounce = 1 − ζ`,
so the existing agreement test keeps both vocabularies in sync.

| Name                 | Used for                       | T (s)  range / default | ζ range / default | k, c at default   |
| -------------------- | ------------------------------ | ---------------------- | ----------------- | ----------------- |
| `jellyHover`         | lean and plump toward cursor   | 0.30–0.40 / **0.34**   | 0.70–0.85 / 0.78  | 341.6, 28.8       |
| `jellyPress`         | press-down squash              | 0.16–0.22 / **0.18**   | 0.95–1.0 / 1.0    | 1218.5, 69.8      |
| `jellyRelease`       | let-go wobble                  | 0.38–0.50 / **0.44**   | 0.35–0.55 / 0.42  | 203.9, 12.0       |
| `jellyDrag`          | stretch while dragging         | 0.24–0.32 / **0.28**   | 0.50–0.65 / 0.55  | 503.5, 24.7       |
| `jellyNudge`         | neighbour response             | 0.36–0.48 / **0.40**   | 0.45–0.60 / 0.50  | 246.7, 15.7       |

`jellyRelease` at ζ 0.42 overshoots about 23% of the squash. That is about 0.9% on
a default control, which is visible as jelly and still legible. It decays below the
sleep threshold in about 1.1s.

**Behaviours** (all targets are clamped by the caps above):

- **Hover enter (fine pointer only).** The element *plumps*: `sx = sy = 1 + 0.008`, and
  it *leans* toward the cursor: `t = maxTranslate · u`, where `u` is the cursor offset
  from the centre normalised to `[-1, 1]` against the cached rest rect. Entry also adds
  a velocity kick of `min(1, |v_pointer| / 1500 px/s) · 0.6 /s` to the scale springs
  along the entry axis. This makes the element jiggle on contact, more when the cursor
  arrives fast.
- **Hover move.** The lean target follows `u`. Only the pointer coordinates are stored
  for each event; targets are computed in the frame.
- **Hover dent (controls).** Instead of plumping, controls (`data-jelly="control"`, the
  default for buttons, tabs and menu items) show a faint *dent*: `sx = sy = 1 − 0.004`,
  with the lean halved. A button reads as something you push, and a card as something
  that rises to meet you. This keeps the existing sink/lift vocabulary.
- **Press (all pointers).** The contact point `u = (ux, uy)` is taken from the rest rect.
  Axis weights are `wx = ux² / (ux² + uy² + 0.15)`, and `wy` likewise. The squash amount
  is `q = 0.025`. The press is **volume-preserving**:

  ```
  sy_target = s0 · (1 − q·wy) · (1 + q·wx)      // pressing near top/bottom flattens vertically, widens
  sx_target = s0 · (1 − q·wx) · (1 + q·wy)
  ```

  A press at the centre (`wx = wy ≈ 0`) reduces to today's isotropic sink `s0`. The base
  `s0` comes from today's `MODES`: `sink` 0.96, `firm` 0.985, `lift` 1.028, or
  `data-fluid-scale`. The translate target moves 30% of the lean *toward* the contact,
  so the element "gives" under the finger.
- **Release.** Targets return to rest, or to the hover pose if the cursor is still
  inside, using `jellyRelease` with the **current velocity carried over**. Re-pressing
  mid-wobble retargets seamlessly. If the press was held longer than 350ms, a
  plastic term `p` (decay τ = 0.6s) keeps a fraction (≤0.4) of the squash as a slow
  "memory" after release. It is borrowed from dough's plastic layer, at far smaller
  amplitude.
- **Drag** (elements that move with the pointer: `data-jelly="drag"`, `useFluidDrag`
  handles, framer `drag` surfaces opted in). Velocity comes from the existing
  `VelocityTracker` (100ms window). It stretches along the velocity axis, projected onto
  x and y, and preserves area:
  `s_par = 1 + min(0.035, |v| / 2400 · 0.035)` and `s_perp = 1 / s_par`. The axis
  weights are those of `v`. A lag translate of up to 2px *against* `v` gives the trailing
  jiggle. The caller still owns the drag translation itself; jelly only adds the
  deformation. On release, the stretch is handed to `jellyRelease` with its velocity.
- **Scroll cancel.** The existing 10px slop still releases a press (UIKit semantics), but
  for `drag` elements the slop starts a drag instead of cancelling it.

**Hit testing and legibility.**

- Amplitude caps (D3) bound edge travel to ≤4px. At most, the hit area drifts by a few
  px for under a second, which is within normal pointer jitter.
- Hover leave is **not** decided by `pointerout` alone. The element counts as left only
  when the pointer is outside the *cached rest rect* expanded by 4px. This stops the
  enter → bulge → leave → shrink → enter oscillation at edges.
- Text inside Tier E deforms affinely with the host. No content counter-transform is
  applied: inverting a scale on the child doubles the layer count and blurs glyphs on
  some GPUs, and at ≤3% the affine is indistinguishable from today's press. Elements
  above 640,000 CSS px² (the engine's slab ceiling) get **no** Tier E affine, only lean.
- Fields (`input`, `textarea`, `select`, `[contenteditable]`) never take a host affine,
  because caret and IME placement would wobble. They can still take Tier L if admitted,
  otherwise nothing.

### 1.3 Tier L: lattice body (shader-admitted surfaces only)

Tier L runs on surfaces the glass engine has already admitted (`glass-pane`, `-chrome`,
`-overlay`, `app-glass`, `[data-liquid-glass]`, at most 8 visible). These are large
panels, dialogs and sticky chrome, where a 3% host scale would be 30px. **The host
never moves.** Only the slab's rim deforms.

**Nodes.** There are 8 perimeter nodes at the four corners and four edge midpoints,
stored in slab-local CSS px. Each node has a 2D offset `o_i` and velocity `v_i`.

**Forces per node** (semi-implicit Euler, fixed substep `h = 1/120 s`, at most 4
substeps per frame, `dt` clamped to 0.05s. ω stays below 40 rad/s, well inside the
2/h stability bound):

```
F_i = −k_a·o_i                                   // anchor to rest           k_a = (2π/0.40)²
    + k_n·(o_{i−1} + o_{i+1} − 2·o_i)            // perimeter smoothness     k_n = 0.6·k_a
    − k_v·ΔA·n̂_i                                 // area preservation        k_v tuned so a 6px dent bulges sides ≈1.5px
    − c·v_i                                      // ζ ≈ 0.40 (release), 0.8 (hover)
    + input_i
```

`ΔA` is the shoelace area of the rest polygon plus offsets, minus the rest area,
normalised by perimeter.

**Inputs:**

- Hover: a Gaussian-weighted outward pull (σ = 0.18 of the perimeter) on the nodes
  nearest the cursor, up to **+3px**. The slab reaches toward the cursor.
- Press: an inward push at the contact up to **−min(bevel, 8px)**, which is the dent.
  The area term then bulges the far sides.
- Drag (a panel dragged by a `useFluidDrag` sheet): the pseudo-force `−m·a_host` from the
  host's acceleration, read through the bridge. The trailing edge lags and the leading
  edge piles up.
- Neighbour nudge (§2): an impulse on the facing edge's nodes.

**Plastic layer.** The same as Tier E, scaled to px: ≤30% of a held dent persists, τ =
0.6s.

**Sleep.** The lattice sleeps when `max|o| < 0.05px` and `max|v| < 0.5px/s`. Once it
sleeps, offsets are zeroed and `uJellyOn = 0`.

**Shader warp** (owned by 01's shader work, specified here). Add
`uniform vec2 uJelly[8]; uniform float uJellyOn;`. The fragment computes the perimeter
parameter `θ` of `q`, interpolates `off(θ)` with a periodic Catmull-Rom over the 8
nodes, and offsets the signed distance along the outward normal:

```
float push = dot(off(θ), n̂(q)) * uJellyOn;
float fall = 1.0 - smoothstep(bz, 2.0 * bz, d);   // full at the rim, zero two bevels in
sd -= push * fall;
```

The bevel profile, refraction and lighting all follow `sd`, so the lit edge visibly
squishes. The interior, where text sits, is untouched because `fall` is 0 there. Tangential
offsets are ignored; only normal displacement is visible on an SDF.

**Overdraw.** Outward bulges (≤3px) draw outside the host. While jelly is enabled,
`.liquid-glass-canvas` gets `inset: calc(-1 * var(--jelly-margin, 0px))` with
`--jelly-margin: 6px`, set **statically** on `[data-liquid-canvas='on']`, not animated.
`uSize` and the SDF origin are offset by the margin.

### 1.4 Corner flex (Tier E add-on, small controls only)

Pills and buttons no larger than 160×64 px may additionally morph their per-corner
`border-radius` by ±25% of the rest radius. The corners nearest the contact tighten
and the far corners round out, which sells "jelly" on small controls better than any
affine. `border-radius` costs paint but no layout, and only on a ≤10k px² surface. The
limit is **3** simultaneous corner-flex bodies, and the base radius is read at
activation. It is disabled for elements with `overflow: visible` children such as
badges, which the base read detects.

---

## 2. Neighbour interaction

**Decision: yes, bounded.** Jelly that never touches its neighbours reads as a sticker.
The bounds:

- **Trigger.** Only a press release or a drag end whose stored energy
  (`|s−1|·size + |t|`) exceeds 2px. Hover never nudges.
- **Who.** At most 4 siblings, chosen at press time from the element's parent. If an
  ancestor has `[data-jelly-group]` (feed lists, button groups, tab strips, card grids),
  the candidates come from that ancestor's descendants matching the jelly selector
  instead. A candidate must also be within a **24px** gap of the pressed element's rest
  rect. The ≤16 candidate rects are read **once**, in the read phase of the press frame.
- **What.** An impulse on the neighbour's `tx`/`ty` springs (`jellyNudge`) pointing away
  from the source, with peak displacement `1.5px · (1 − gap/24)`. Scale is unaffected.
  A Tier L neighbour instead gets an edge impulse on its lattice, ≤2px, through the bridge.
- **Never.** No layout properties, no chains (a nudged element does not nudge others),
  nothing while a scroll happened in the last 150ms, and nothing inside
  `[data-jelly-group="off"]` (data tables, code blocks, dense editors such as RMHCode
  and RMHType). Nudged bodies count against the active-set cap and are evicted first.
- **Arcs (03).** The same energy event is published on the bridge as
  `{source, neighbours, energy}`, so the arc system can fire a click arc to the nudged
  neighbours without recomputing geometry.

---

## 3. Architecture

### 3.1 Files and API

```ts
// lib/jelly/physics.ts — the document service (client-only, no React)
export function installJellyPhysics(doc?: Document): () => void;

// lib/jelly/bridge.ts — tiny pub/sub shared with the glass engine, arcs and drag hooks
export interface JellyBridge {
  /** Drag owners report host motion so jelly can stretch it. */
  drag(el: HTMLElement, vx: number, vy: number, phase: 'move' | 'end'): void;
  /** Engine pulls lattice inputs for an admitted surface (null = none pending). */
  latticeInput(el: HTMLElement): LatticeInput | null;
  /** Engine registers so physics can wake its frame on new lattice input. */
  onLatticeWake(cb: (el: HTMLElement) => void): () => void;
  /** Arc system (03) subscribes to press/nudge energy events. */
  onEnergy(cb: (e: JellyEnergyEvent) => void): () => void;
}
export const jelly: JellyBridge;

// lib/jelly/envelope.ts — pure Tier E math (targets, caps, area preservation, plastic)
// lib/jelly/lattice.ts  — pure Tier L solver: createLattice(), stepLattice(), latticeAsleep()
// lib/jelly/policy.ts   — eligibility, tiers, modes, budget, eviction (pure, tested)
// lib/jelly/compose.ts  — base transform parsing/composition, framer-ownership detection
// hooks/useJellyPhysics.ts — mounts installJellyPhysics once (Providers)
```

`installJellyPhysics` follows the pattern of `installLiquidInteractions` and
`installLiquidGlass`: a teardown function, capture-phase passive listeners, and cleanup
on `blur`/`visibilitychange`.

### 3.2 Opt-in and opt-out

The default is **on** for every eligible element on site and app routes. "Every UI
element becomes jelly" is incompatible with the current scope gating.

| Attribute / selector                                                                                                              | Meaning                                                                                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `data-jelly="control"` (default for `button`, `[role=button\|tab\|menuitem\|switch\|option]`, `summary`, `[data-slot=button]`)    | Hover dent, sink press, corner flex if small                                                                      |
| `data-jelly="card"` (default for `.glass-fill`, `.glass-interactive`, `[data-liquid-surface]`, `a[href]` that wraps a card)       | Hover plump/lean, lift press                                                                                      |
| `data-jelly="pane"` (default for engine-admitted roles)                                                                           | Tier L only, no host affine                                                                                       |
| `data-jelly="drag"`                                                                                                               | Drag stretch; the slop starts a drag instead of cancelling                                                        |
| `data-jelly="firm" \| "lift" \| "sink"`, `data-jelly-scale="0.97"`                                                                | Mode and base overrides                                                                                           |
| `data-jelly="off"` on an element, or `data-jelly-scope="off"` on a subtree                                                        | Opt out                                                                                                           |
| `data-jelly-group` / `data-jelly-group="off"`                                                                                     | Neighbour nudge set / no nudges                                                                                   |
| **Aliases (kept)**                                                                                                                | `data-fluid-press` → `control`; `="lift"` → `lift`; `="none"\|"off"` → `off`; `data-fluid-scale` → `data-jelly-scale`; `data-liquid-motion="off"` → scope off; `data-fluid-press-scope` becomes a no-op (on everywhere) |
| **Always excluded**                                                                                                               | `canvas`, `video`, `iframe`, `[data-gesture]:not([data-gesture=hold])`, `[draggable=true]` unless `data-jelly="drag"`, `.radial-globe__stage`, `.eversion-overlay`, `.evert-ghost`, `[disabled]`, `[aria-disabled=true]`, `[inert]` descendants, and prose links (untagged `a[href]` inside text) |

Games and apps: the shells that carry `data-fluid-press-scope` (`AppShell`, `GameShell`s,
`StudioShell`) keep working because the defaults now apply everywhere. Twitch surfaces
are already excluded by the `[data-gesture]`/canvas rule. Each game owner should still
audit for `data-jelly-scope="off"` on HUD regions whose buttons are held (fire, thrust).
This is listed as a follow-up in §6.

Resolution happens **once, at activation**: a single `closest()` over a combined
selector, then a policy check, then a cache in a `WeakMap<Element, Policy>`. It never runs
for each move.

### 3.3 Integration with existing systems

- **`useFluidPressLayer` (radial shell's delegated press spring): replaced.** Its
  behaviour (modes, slop cancel, velocity-carrying retarget, `will-change` only while
  moving, release on blur/hidden) becomes a strict subset of Tier E's press path.
  `hooks/useFluidPress.ts` is deleted. `Providers.tsx` swaps
  `useFluidPressLayer()` → `useJellyPhysics()`. Comments in `liquid-tabs.tsx`,
  `button.tsx`, `AppShell.tsx` and `RadialShell.tsx` that say "delegated press spring"
  are updated, but their `data-fluid-press` attributes stay as aliases, so there is no
  sweep of the ~19 files.
- **`useFluidDrag`: wrapped, not replaced.** It keeps owning the drag position. It gains
  an optional `jellyTarget?: () => HTMLElement | null`. In `onMove` and `finish` it calls
  `jelly.drag(el, v, phase)` with its own `VelocityTracker` value, so the service
  stretches the sheet. Sheets are usually Tier L panes, which get the lattice
  pseudo-force; a Tier E sheet gets envelope stretch. `dialog.tsx` passes its sheet ref.
- **`lib/liquid/runtime.ts` (fallback cursor light):** unchanged. It only moves a
  decorative leaf inside the host, which deforms along with the host.
- **`lib/liquid/glass/engine.ts`:** steps the lattice in its own frame (D9). Its
  `again` condition gains `|| lattice awake`. `jelly.onLatticeWake` calls its
  `requestFrame`. Tilt and light are unchanged.
- **`lib/liquid/hover-css.ts`: kept and re-justified.** CSS `:hover` transforms are still
  stripped, now because *JellyPhysics owns hover motion*, and a CSS hover `scale` would
  fight it. Two writers on `scale` is exactly the bug the plugin prevents. Its docblock
  and the liquid-glass doc say so.
- **`globals.css`:** `button.tsx`'s `active:scale-[0.98]` remains the no-JS fallback,
  because the inline `scale` wins while jelly is active. The legacy `:active { opacity:
  .6 }` cue is excluded for elements jelly handles; its selector gains
  `:not([data-jelly-active])`. Jelly sets that attribute only for the press duration.
- **framer-motion `whileHover`/`whileTap`** (41 call sites): where they animate `scale`,
  they now double up with jelly. The gates plan (04) removes them in favour of
  `data-jelly` modes and adds a consistency gate (§5).

### 3.4 framer-motion and Tailwind composition

The CSS transform order is
`translate` → `rotate` → `scale` → `transform` (each about `transform-origin`), so:

1. **Tailwind v4** `scale-*`, `translate-*` and `-translate-x-1/2` write the same
   independent properties. At activation, in the read phase, `compose.ts` reads
   `getComputedStyle(el).translate` and `.scale` **once** and stores them as the base.
   Writes compose as `calc(base + Δpx)` (percent bases such as `-50%` survive) and
   `base·s`. Bases are not re-read during a body's life, which is under 1.5s.
2. **framer-motion** writes `el.style.transform`. Our `scale` is applied *outside* it, so
   it would scale framer's translation. That is harmless at rest (`transform: none`) but
   wrong mid-animation. Each frame, `compose.ts` compares `el.style.transform` (an inline
   string read with no style or layout flush) with the previous frame's value. If it
   changed, the element is **framer-owned this frame**: its jelly targets go to rest and
   its writes are skipped once rest is reached. When the string stops changing for 2
   frames, jelly resumes. This also covers `layout`/`layoutId` FLIP animations, which
   animate `transform`.
3. Elements whose inline `transform` contains a non-zero `translate`/`scale` at
   activation (framer `x`/`y` motion values at a resting offset) get **lean only**,
   because translate composes additively and safely, and no scale.

Separately, `rotate` is never written.

### 3.5 Wasm dough reuse: not viable (D8)

`wasm/dough.ts` is one static 48² × 16-grid state (about 147KB) built for a single disc
under one finger, with an RGBA field upload. Tier E needs 4 scalar springs and Tier L
needs 8 nodes, both about 100 flops per step. A crossing into Wasm with marshalled inputs
costs more than the work, and the module's single static state cannot hold 8 to 12
bodies without an ABI rewrite. Reused **ideas**: the elastic plus plastic split, the
saturating ceiling, `REST` sleep, `MAX_STEP` substepping, and "derive, don't simulate"
(the Tier L area term plays the role of dough's divergence-derived height). If a single
hero surface ever needs field-level kneading, it should get its own `DoughBody`, as the
globe does.

---

## 4. Performance

- **One rAF, idle at rest.** `physics.ts` schedules a frame only while a Tier E body is
  awake, and the frame reschedules only if one remains awake. The Tier L lattice runs in
  the engine's already-allowlisted frame. A page with no pointer activity runs no loop.
- **Frame phases.** (1) A **read** phase handles queued activations and rect
  invalidations: `getBoundingClientRect` and the one `getComputedStyle` per activation,
  batched for all pending elements. (2) A **step** phase with no DOM access. (3) A
  **write** phase sets only `scale`, `translate`, `will-change` and corner-flex
  `border-radius`. Writes are skipped when they would change the value by less than
  0.0005 scale or 0.05px.
- **No layout reads for each pointer event.** `pointermove` stores `clientX/Y`,
  `timeStamp` and `pointerType`, then calls `requestFrame()`. `pointerover` does one
  `closest()` and enqueues an activation. The rect cache is
  `WeakMap<Element, {rect, epoch}>`. A capture-phase passive `scroll` listener or
  `resize` bumps `epoch`, and awake bodies re-read in the next read phase (≤12 reads).
- **Active-set bounds.** Tier E allows 12 bodies on fine pointers and 6 on coarse.
  Eviction removes the lowest energy first, with order nudge < hover < released < pressed.
  Pressed and dragged bodies are never evicted. An evicted body snaps to rest by
  clearing its inline styles. Corner flex allows 3 bodies, and Tier L is capped by the
  engine's 8.
- **Compositor-only.** `translate` and `scale` with `will-change: transform` (which
  covers the individual properties) are set only while awake. Corner flex is the single
  paint-cost exception, bounded in size and count.
- **Scroll.** No hover activation while a scroll happened in the last 150ms, and active
  hover bodies retarget to rest. This keeps a feed flick from leaving a wake of plumped
  cards. Press slop cancel works as before.
- **Touch.** There is no hover tier. Press, release and drag are kept. Listeners are
  passive and never call `preventDefault`, so `touch-action: manipulation` and native
  scrolling are untouched.
- **Degradation.** The full fallback matrix belongs to the coverage plan. This plan
  proposes: under `perf-lite`, forced colors or print, Tier E press only (isotropic, no
  wobble overshoot: `jellyRelease` ζ → 1), with no hover, nudge, corner flex or Tier L.
  Under reduced transparency or high contrast, Tier E stays, because the motion does not
  depend on the material, and Tier L is off because there are no canvases. Hidden tab:
  all bodies are cleared and the frame is cancelled.
- **Budget target.** Step plus write for 12 bodies takes ≤0.3ms per frame on a mid-tier
  Android. This is measured by `testing/e2e/jelly-soft-body.mjs` (§5) with a perf mark
  around the frame.

---

## 5. Tests

**New unit suites** (vitest, colocated):

- `lib/jelly/__tests__/envelope.test.ts`
  - Caps: for sizes 24px to 1200px, the max deviation is ≤3% and ≤4px at any edge,
    including under a 10× velocity kick (the saturating ceiling holds).
  - Area preservation: `sx·sy / s0²` stays within 1 ± 0.002 for presses at the
    centre, edge and corner, and for drag stretch.
  - A centre press reduces exactly to the legacy `MODES` scales (0.96/0.985/1.028).
  - Release overshoot is between 15% and 30% of the squash. The body sleeps within
    1.2s at 30, 60, 120 and 144Hz, and with a single catastrophic `dt = 0.25`.
  - Re-press mid-wobble is continuous: no position jump, and velocity is carried over.
  - The plastic term is zero for presses under 350ms and decays to <1% within 3τ.
- `lib/jelly/__tests__/lattice.test.ts`
  - Settles from a 6px dent to sleep in under 1.5s. Stable with `dt = 0.25`, with no
    NaN and bounded energy.
  - Area conservation: a held dent changes the polygon area by <3%, and the sides bulge.
  - Symmetry: a press at the top midpoint produces a left-right mirror-symmetric response.
  - Caps: outward ≤3px and inward ≤ min(bevel, 8px).
  - `latticeAsleep` agrees with the zeroed state.
- `lib/jelly/__tests__/policy.test.ts`: selector-to-mode resolution, every alias
  (`data-fluid-press*`), the exclusion list, eviction order, the coarse-pointer cap and
  the corner-flex size gate.
- `lib/jelly/__tests__/physics.test.ts` (jsdom with a fake rAF):
  - **Settle proof:** a press then release starts the loop, and it stops by itself with
    `scale`, `translate`, `will-change` and `data-jelly-active` cleared within a bounded
    number of frames. With no input, zero frames are requested.
  - Spy on `getBoundingClientRect` and `getComputedStyle`: **0 calls** across 200
    `pointermove` events on an active body, and exactly 1 of each per activation.
  - The active set never exceeds 12 (or 6 when `pointer: coarse` is mocked).
  - framer ownership: changing `style.transform` between frames suppresses jelly
    writes, which resume after 2 stable frames.
  - Composition with a Tailwind base `translate: -50% -50%` keeps the percentage.
  - Teardown removes listeners and inline styles. `blur` and `visibilitychange` release
    every body.
  - The nudge picks ≤4 neighbours within 24px, does not chain, and is suppressed after
    a scroll.

**Modified:**

- `lib/__tests__/raf-loop-allowlist.test.ts`: add `lib/jelly/physics.ts`, with an
  allowlist note that it is "idle-at-rest: frames only while a body is awake; settle
  proven in `lib/jelly/__tests__/physics.test.ts`". Remove `hooks/useFluidPress.ts` if
  it is listed. Update the `engine.ts` note to mention lattice frames.
- `lib/__tests__/fluid.test.ts` and the "two vocabularies agree" test: add the five
  `jelly*` springs. Add "jellyPress is quicker than jellyRelease" and "jellyRelease
  under-damps" assertions.
- `lib/__tests__/motion-spring-easings.test.ts`: only if a CSS twin is added. None is
  planned, because jelly is JS-driven.
- `lib/__tests__/evert-spring.test.ts:143` (asserts `data-fluid-press` on a button):
  keep it; the alias stays valid.
- `lib/liquid/glass/__tests__/policy.test.ts`: the canvas overdraw margin and `uSize`
  offset under jelly.
- `testing/e2e/site-controls.mjs`: mount `useJellyPhysics` instead of
  `useFluidPressLayer`, and keep the `data-fluid-press="none"` opt-out assertion.
- New `testing/e2e/jelly-soft-body.mjs` (Chromium): hover a card, press, release,
  check the computed `scale` deviates and then returns to `none`, and check that
  `performance` marks show no frames 2s after the last input. Check that text bounding
  boxes move ≤4px. Also check the hover-edge no-flicker case.

**Gates (owned by plan 04, requested here):** a design-consistency rule that fails on
new `whileHover`/`whileTap` that animate `scale`, and on any `el.style.scale =` /
`style.translate =` writes outside `lib/jelly/`, so no component adds its own soft body.

---

## 6. Implementation list and ownership

Each work package owns its files exclusively. The order is WP1 → (WP2 ∥ WP3 ∥ WP5) →
WP4 → WP6.

| WP  | Owner focus           | Files (create **C** / modify **M** / delete **D**)                                                                                                                                                                                                       | Depends on |
| --- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| WP1 | Pure math             | **C** `lib/jelly/envelope.ts`, `lib/jelly/lattice.ts`, `lib/jelly/policy.ts`, their `__tests__`. **M** `lib/fluid.ts` (`SPRINGS.jelly*`), `lib/motion.ts` (`APPLE_SPRING.jelly*`), `lib/__tests__/fluid.test.ts`                                      | —          |
| WP2 | Document service      | **C** `lib/jelly/physics.ts`, `lib/jelly/compose.ts`, `lib/jelly/bridge.ts`, `hooks/useJellyPhysics.ts`, `lib/jelly/__tests__/physics.test.ts`. **M** `lib/__tests__/raf-loop-allowlist.test.ts`                                                       | WP1        |
| WP3 | Engine plus shader    | **M** `lib/liquid/glass/engine.ts` (step lattice, wake, `again`), `lib/liquid/glass/shader.ts` (`uJelly`, SDF warp), `lib/liquid/glass/renderer.ts` (uniform upload), `lib/liquid/glass/policy.ts` and its test (margin), `app/liquid-glass.css` (canvas inset). **Coordinate the shader with plan 01, which owns the rest of the shader.** | WP1, bridge API from WP2 (interface only) |
| WP4 | Cutover               | **D** `hooks/useFluidPress.ts`. **M** `components/Providers.tsx`, `hooks/useFluidDrag.ts` (`jellyTarget`), `components/ui/dialog.tsx` (pass ref), `app/globals.css` (`:active` opacity guard), comment-only edits in `components/ui/button.tsx`, `liquid-tabs.tsx`, `menu.tsx`, `components/shared/AppShell.tsx`, `components/radial/RadialShell.tsx`, `testing/e2e/site-controls.mjs` | WP2        |
| WP5 | Opt-outs and groups   | Add `data-jelly-scope="off"` to held-control HUD regions in the game components, plus `data-jelly-group` on feed lists, tab strips, button groups and card grids, and `data-jelly-group="off"` on RMHCode/RMHType editors and data tables. Attribute-only edits, one commit per app or game family. | WP1 policy names |
| WP6 | Docs and verification | **C** `testing/e2e/jelly-soft-body.mjs`. The `docs/liquid-glass-system.md` rewrite of the "Interaction and layout" section and the `hover-css.ts` docblock **belong to plan 04**. This WP supplies the paragraph text.                                       | WP2–WP4    |

**Dependencies on sibling plans:**

- **01 (material):** the shader warp hook (§1.3), the canvas margin, and having the
  shader paint the tint and hairline on the deformed edge while `uJellyOn > 0`, so the
  host's rectangular CSS border does not betray the bulge.
- **03 (arcs):** consumes `jelly.onEnergy`.
- **Coverage/a11y:** confirms the degradation matrix in §4.
- **04 (gates/docs):** the new consistency rules and the doc reversal of
  "Clicks never push or bounce neighbouring surfaces".

**Open questions** (defaults chosen, so implementation can proceed):

- Should cards plump on hover on touch-capable hybrid laptops? Default: follow the
  `(hover: hover) and (pointer: fine)` media query live, as the runtime does.
- Should corner flex extend to `glass-fill` cards? Default: no. It is a paint cost on
  large repeated surfaces, and Tier E lean plus plump is enough.
