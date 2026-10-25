# Plasmatic jelly: implementation contract

Current as of 2026-10-23. This contract **supersedes**
[`liquid-glass-system.md`](liquid-glass-system.md) as the implementation authority for
the site's material, and supersedes `design-language.md` §5.1.1 ("cursor reactivity is
retired") and the "idle at rest" wording of its §7 for the jelly services. The decisions
behind it are R1–R16 in
[`plans/plasmatic-jelly/00-master-plan.md`](plans/plasmatic-jelly/00-master-plan.md);
the five section plans beside it hold the derivations. Where this file and the code
disagree, the code (and its tests) win and this file is the bug.

**Unified design.** The material is the overhaul above **plus** the owner's #989 spec
layered on top of it: dormant plasma that wakes on hover, a molded RGB-led refracting edge
(a lit shoulder rising from the ground, no hairline) and no gloss band, a liquid-glass **lens dent** with a light dot that
slides with the pointer, and electric **charge** that hops on a click, breaks down small
gaps and attracts neighbours by Coulomb's law. The short statement every agent reads is
the "Design system: Plasmatic Jelly" section of [`CLAUDE.md`](../CLAUDE.md); this file is
the implementation detail behind it. Every number below is a named constant in
`lib/jelly/tiers.ts` (`JELLY_BUDGETS`, `MOTION_BOUNDS`, `AMBIENT_BOUNDS`, `FLASH_LEDGER`,
`DENT`, `PLASMA`, `CHARGE`, `JELLY_LAYOUT`), mirrored as a CSS token where CSS needs it
(§10) — never restated in a component.

Every surface is a slab of slightly hazy, translucent plasma-jelly. The 3D refracting,
lit, rounded rim of liquid glass stays, its light split into red, green and blue at the
edge. Inside, a low-contrast haze is always drifting, calm behind text and livelier at
the rim, and a dormant plasma core waits to wake under the hand. The jelly is soft: hover
plumps and leans it, press sinks a lens-like dent under the pointer and squashes it toward
the contact, drag slides the dent along, release wobbles it back. It is charged: nearby
surfaces occasionally throw an electric arc across the gap, a click deposits charge that
rings through the gel and hops to a neighbour, and charged neighbours lean toward each
other. **Text, hit areas and layout never move beyond the bounded squash.**

## 1. Material and roles

The `glass-*` classes keep their names (R1): "glass" names the **elevation role**,
"jelly" names the **material** that renders every role. There are no `jelly-*` alias
classes and no `data-material` flag (R5).

| Role                                 | Rim (shader slab)                         | Haze                                      | Soft body                           | Arcs                                 |
| ------------------------------------ | ----------------------------------------- | ----------------------------------------- | ----------------------------------- | ------------------------------------ |
| `glass-overlay` (L4)                 | admitted first; refracts settled snapshot | canvas slot or carrier; quietest interior | lattice rim only, host never moves  | endpoints yes; never across its text |
| `glass-chrome` (L3)                  | admitted second; refracts snapshot        | canvas slot or carrier                    | lattice rim only                    | yes                                  |
| `glass-pane` (L2), `app-glass`       | admitted third; lit, refract by opt-in    | canvas slot or carrier                    | lattice rim only                    | yes                                  |
| `glass-fill` (L1), cards             | within budget                             | carrier, else static haze floor           | envelope + lattice when admitted    | yes                                  |
| `glass-inset`, fields                | within budget                             | rim-only carrier on the wrapper           | rim only; never moves while focused | **never** an endpoint                |
| solid buttons (`[data-slot=button]`) | admitted last                             | carrier (never a canvas slot)             | envelope (press / hover dent)       | yes                                  |
| toasts (`[data-sonner-toast]`)       | —                                         | static haze floor                         | envelope                            | **never** struck                     |

What draws what:

- **Rim** — `lib/liquid/glass/engine.ts` + `shader.ts` + `jelly-glsl.ts`: the existing
  refracting, Fresnel-lit slab, with a haze veil, a plasma inner edge line, a plasma
  cursor bloom and the `uJelly[8]` lattice warp of the SDF edge. One shared WebGL2
  context (`renderer.ts`) copies into a canvas that is the host's **last** child at a
  negative z-index inside an isolated stacking context.
- **Haze (shader tier)** — `haze-shader.ts`: a low-resolution `.jelly-haze-canvas`
  (≤ 256 px long side) with a flow-map current (role axis + curl noise), three
  counter-rotating Gaussian eddies per surface, a warped fbm body plus soft ridged current
  filaments with crisp fronts (`HAZE_LOOK`), and plasma only at the crests. The interior is
  damped by `--site-jelly-quiet` (0.75; 0.9 in Daylight) inside the α/2…α range the
  legibility gate bounds; only the bevel may swing further (`--site-jelly-haze-edge`), so
  the currents visibly run along every edge. The host gets `data-jelly-haze="on"` after the
  first draw and the bus hears `haze:change`.
- **Haze (CSS tier)** — `lib/jelly/flow-carriers.ts` injects a clipped, `aria-hidden`
  `.jelly-flow` span as the host's **first** child; its two inner spans animate
  `transform` only (`jelly-drift` / `jelly-current` in `app/jelly-material.css`): a half-density
  veil with three slanted current streaks that turn and travel past each other. Speed is
  per host: wide hosts are capped at 12 px/s, small ones (buttons) lifted to 6 px/s
  (`cappedFlowSpeed`). Hosts with text-only children never get one (React's `textContent`
  path would delete it), so `<Button>` wraps a plain-text label in a `display: contents`
  span. After `IDLE_AFTER_MS` without input the service stamps `html[data-jelly-idle]`: the
  CSS pauses the carriers and the service steps their `currentTime` on the engine's ambient
  tick (`ambient:tick`), or its own idle-clock timer when no haze is ticking — the haze keeps
  moving at the same speed, the page at rest draws ≤ the idle clock's frames, not vsync's.
- **Static haze floor** — every role's background stack in `app/jelly-material.css`
  (milky gradient + `public/jelly/haze-tile.webp` grain), so a surface reads as jelly
  with no JavaScript or WebGL. It is the complete fallback tier.
- **Charge** — `pulse(el, k, x?, y?)` queues a charge **ring** at (x, y): it travels at
  `CHARGE.pulseSpeedPxS` and decays with `CHARGE.pulseTauMs` (lifetime ≤ ~1 s), at most 3
  rings per surface, and rings within 60 ms / 32 px merge, so an `arc:strike` and its
  `charge:pulse` show as one. Ring alpha stays ≤ the plasma peak (0.14), below the 0.1 ΔL
  flash threshold, so rings are not ledgered.
- **No gloss in the shader** — no sheen band and no cursor bloom on the face; every
  specular term is edge-only. The gel's body → depth gradient is CSS (`--liquid-coat`),
  not the shader.
- **Dormant plasma** — one shared `jPlasma` core + filaments in `--site-accent`, clipped
  3–14 px inside the edge and exactly 0 at level 0. It moves in the haze slots (× 0.5
  under `calm`) and is static in the rim program elsewhere (including under `still`).

Tokens: `--site-jelly-*` (haze per role, plasma A/B, strength, flow speed, quiet, bevel
haze swing `-haze-edge`),
`--site-arc-core` / `--site-arc-glow`, `--z-arcs` (45) / `--z-arcs-modal` (55), mirrored
for the app tier as `--app-jelly-*`. High contrast zeroes them all. Role knobs
(`--jelly-haze-a`, `--jelly-plasma-k`, `--jelly-flow-speed`, `--jelly-flow-axis-deg`) are
set on the host per role and read by both tiers, so the engine holds no role table.

**No `backdrop-filter` in any role, ever.** "Hazy" is drawn by the shader or by
transform-only CSS layers; frosted blur is the path back to the cost and engine
disagreement liquid glass removed. Every jelly paint layer sits at a **negative**
z-index inside its host; the arc layer is the one body-level exception and is
`pointer-events: none`. No jelly layer paints more than 2 px outside its host's border
box (`AMBIENT_BOUNDS.maxOverdrawPx`, the focus ring's offset).

### 1.1 The physical layers (#989)

Read a surface from the inside out. Each layer is drawn by a shared service and tuned
by tokens; no component paints one.

| #   | Layer               | What it is                                                                                                                                                                                                                                                                                                                                                                                                    | Drawn by                                                        | Tokens                                                                                                    |
| --- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1   | **Gel**             | Hazy, translucent body that darkens slightly toward its base. The primary action is ink gel.                                                                                                                                                                                                                                                                                                                  | CSS gel layers (`app/jelly-material.css`), rim shader           | `--gel-body` → `--gel-depth`; `--gel-ink`, `--on-ink`                                                     |
| 2   | **Haze**            | Always-moving, low-contrast flow: currents, eddies, faint plasma at the crests. Interior damped behind text (≤ 12 px/s, features ≥ 120 px).                                                                                                                                                                                                                                                                   | `haze-shader.ts` (slots) or `.jelly-flow` carriers              | `--site-jelly-*`, `--site-jelly-quiet`                                                                    |
| 3   | **Plasma**          | A core and filaments clipped **inside** the gel, invisible at rest (`PLASMA.rest` = 0). Hover wakes it to `PLASMA.wake`; press, focus and a click take it to 1; a click's charge rings through it. Plasma never draws an outline.                                                                                                                                                                             | engine (`jelly-glsl.ts`), level from physics via `plasma:level` | `--plasma-wake`, `--pulse-speed`, `--pulse-tau`                                                           |
| 4   | **Edge refraction** | The refracting, lit rim with a soft bevel band just inside it carrying a distinct R/G/B split — red toward the top-left light, blue away. The RGB split leads; white is secondary. **Molded:** the slab rises from the ground over a widened shoulder, lit toward the light and shadowed away from it, with a feathered silhouette and no hairline; the 1 px Fresnel edge returns only where the mold is off. | engine (`shader.ts`, `jelly-glsl.ts`), CSS rim in the fallback  | `--gel-bevel`, `--gel-disperse-r/-g/-b`, `--gel-fresnel`, `--gel-mold`, `--gel-feather`, `--gel-shoulder` |
| 5   | **No gloss**        | No broad gloss band or glint across the face. Shine lives at the edges and in the dent (§3.1).                                                                                                                                                                                                                                                                                                                | —                                                               | —                                                                                                         |

The plasma level is an event, not a style: physics emits `plasma:level { el, level }` on
the bus as the pointer wakes, presses and leaves a body; the engine eases the drawn level
toward it over `PLASMA.easeMs`, and the arcs read it as charge. The plasma colour **is**
the accent (`--site-accent`); the haze's second plasma hue only appears inside the gel,
never as UI colour.

## 2. The ambient clock and the idle policy (R7)

The owner's brief is that jelly **always** has underlying motion. The engine's ambient
clock therefore never freezes while someone could be looking:

| State                                                                                                              | Clock                                         |
| ------------------------------------------------------------------------------------------------------------------ | --------------------------------------------- |
| engaged (input within the last 20 s)                                                                               | tier clock: 60 Hz (30 Hz handheld)            |
| idle (`IDLE_AFTER_MS` = 20 s without input)                                                                        | floor: 30 Hz (15 Hz handheld) — **no freeze** |
| `jellyMotion = calm`                                                                                               | ≤ 12 Hz, amplitude × 0.4, slots halved        |
| hidden tab · unfocused window · scroll in flight · nothing hazy on screen · degraded tier · `still` · game playing | **0** — no loop at all                        |

Between ticks the engine sleeps on a timer, not on a spinning rAF: the timer wakes the
engine's driver on the shared frame loop (§8.1), which draws at most six due surfaces with
one shared `uTime` and then lets the driver sleep again.

**2026-10-25: the clock doubled (30/12 → 60/30 Hz, 15/8 → 30/15 handheld).** The owner asked
for "zero lag and as much fps as possible". What made it affordable: rims and haze draw in a
worker (`lib/liquid/glass/glass.worker.ts`; the engine still makes every decision — which
surfaces, when, light, dent, lattice, plasma — and posts each frame's draws, which the worker
coalesces per canvas so a slow GPU drops stale frames instead of queueing them), and there each
frame reaches its canvas by `transferToImageBitmap()` → `bitmaprenderer` instead of a
`drawImage` that made the main thread wait for the GPU. That wait was worst in Firefox, where
WebGL runs in a separate GPU process: hovering across eight cards cost 26 ms of main thread a
frame (37 fps, governor at its last step) and costs 0.7 ms (59 fps) from the worker. Engines
without a worker-capable `OffscreenCanvas` keep the main-thread copy path
(`renderer.ts` "Handing a frame over").
The governor walks the clock back to 30 Hz at its first step, so a
machine that cannot hold 60 — software GL, Safari Low Power Mode, Chrome Energy Saver (both
cap rendering at 30 fps) — settles where it can instead of missing every other tick.

**Audit reversal, recorded deliberately.** The 2026-10-08 performance audit set the
"page at rest" frame limit to 2 fps and the backdrop went fully still because of it.
R7 reverses that limit for the jelly material: the rest limit in `frame-budget.mjs`
becomes **31 fps** (the 30 Hz floor + 1; it was 13 fps over the original 12 Hz floor). The CPU target at rest stays **≤ 250 ms/s** on
`/` (desktop; ≤ 200 ms/s handheld; the 2026-10-08 failure was 1020 ms/s). What did
**not** change: the backdrop (aurora, ring field) stays completely still
(`static-backdrop.test.ts`) — jelly moves, the room does not — and no site CSS may add a
free-standing `infinite` animation outside `.jelly-flow`.

**The governor** (`lib/jelly/governor.ts`) is the battery and thermal answer. The engine
feeds it each tick's cost, interval and the clock that tick ran at; after a 30-tick warm-up,
a 2 s window whose p90 cost exceeds 4 ms (8 ms handheld) or whose p90 interval exceeds 1.5×
the period of the clock actually running (the 30 Hz idle floor is on time at 33 ms) takes one
step down: clock 60 → 30 Hz · slots halved · carriers halved · ambient arcs off · haze at
0.125 scale · floor clock 6 Hz (the ladder never freezes the haze). Downscale only, one step per window, reset on route change. The
tier itself never flips on a frame-rate reading.

## 3. Soft body (R11, R12)

`lib/jelly/physics.ts` is the one soft-body service. It subscribes to the pointer hub
(`lib/jelly/pointer.ts`) instead of owning listeners, and runs as a frame driver
(`lib/jelly/frame.ts`, order 10, before the engine draws) that is awake **only while a
body is moving**. It absorbed the old press layer; `hooks/useFluidPress.ts` is deleted and the
`data-fluid-press*` attributes remain accepted aliases (`soft-policy.ts`). A centre press
still lands exactly on the legacy 0.96 / 0.985 / 1.028 scales.

- **Tier E (envelope, `envelope.ts`)** — four analytic springs (`sx`, `sy`, `tx`, `ty`)
  written to the independent CSS `translate` and `scale` properties, composed on the
  element's own Tailwind base (`compose.ts`); framer-owned elements are left alone while
  framer animates them. Hover plumps/leans cards and dents controls (fine pointers
  only), press squashes toward the contact, release wobbles back with its velocity, drag
  stretches along the motion.
- **Tier L (lattice, `lattice.ts`)** — an 8-node perimeter spring lattice for admitted
  slabs, driven through `lattice-inputs.ts` and stepped **inside the engine's frame**, so
  the rim is never a frame behind the draw. Panes, chrome, overlays and fields get Tier L
  only: their hosts never move.

Bounds (`MOTION_BOUNDS`, `tiers.ts`): an edge moves ≤ 4 px and a scale changes ≤ 3 %,
saturated with `cap·tanh(x/cap)` so a violent flick never shows a clamp edge; the
lattice's drawn rim stays within 2 px outward. A strong release **nudges** at most 4
siblings within 24 px by ≤ 1.5 px, `translate` only, never chaining, never right after a
scroll. An arc strike gives the struck element a ≤ 1.5 px impulse. Surfaces over
250,000 px² get no host affine and half lattice amplitude. **Layout — box sizes and
document flow — never changes.** Bodies are capped (12 / 8 / 6 by tier; pressed and
dragged bodies are never evicted) and cleared at sleep (inline values restored,
`will-change` and `data-jelly-body` removed). No tier simulates more than
`JELLY_LAYOUT.bodyBudget` (24, `--jelly-body-budget`) bodies, and the springs step at a
fixed `JELLY_LAYOUT.simHz` (120 Hz, `--sim-hz`) inside the frame. Content follows the gel
by at most `DENT.contentStrain` (4 %, `--jelly-content-strain`).

### 3.1 Press is a liquid-glass dent (#989)

A press sinks a smooth, creaseless **Gaussian bowl** under the pointer:

- **Shape.** A Gaussian centred at the contact. Depth `DENT.depthPx` (6 px,
  `--jelly-dent-depth`) at full press, σ = clamp(`DENT.radiusFrac` (0.22) × the host's
  short side, 12, 48) px. The depth rides `DENT_SPRING`, a `lib/fluid.ts` spring damped at
  `DENT.damping` (0.9, `--jelly-dent-damping`): it sinks and eases back without ringing.
  The lattice outline indents by up to min(0.6 × bevel, 10 px, `DENT.indentPx` = 5 px)
  under the dent and the far side bulges, so area is conserved.
- **State.** Physics writes it with `setDent(el, dent)` in `lib/jelly/lattice-inputs.ts`
  (centre, depth, radius and the rubber-band stretch, host-local CSS px); the engine and
  the lens read it with `dentOf(el)` on the frame they draw. It is `null` once eased out.
  While a body is dented it carries `data-jelly-active`.
- **Lens.** The dent is a lens. `lib/jelly/lens.ts` keeps one per-document SVG filter (a
  data-URL displacement map and three displacement passes, one per colour channel) and
  applies it to **at most one** pressed host: content beneath refracts through the bowl
  (`DENT.lensStrength`, `--jelly-lens-strength`) and splits into R/G/B
  (`DENT.lensDispersionPx`, `--jelly-lens-dispersion`). Only in full deform mode, never on
  a host that has a filter of its own, and **only while the dent exists**; release
  restores the host's inline `filter` exactly. No stylesheet ever sets a `filter:` on a
  jelly body. On WebKit (and wherever SVG filters on HTML are unsupported) the lens is a
  no-op; the rim indent, glow and light dot remain.
- **Light.** A soft glow ring (about 1.15σ) follows the dent's rim and a specular **light
  dot** (`--gel-specular`) sits 0.6σ from the centre, away from the scene light: the only
  gloss on the face (§1.1, layer 5).
- **Drag.** The dent slides with the pointer: mouse and pen presses no longer cancel on
  the 10 px slop (touch still scrolls). Dragging off the element stretches the gel toward
  the pointer with `rubberBand` from `lib/fluid.ts`, capped at `DENT.rubberMaxPx` and, as
  drawn, at the overdraw margin (2 px on fills and controls, 0 on panes, chrome and
  overlays). Release eases depth, stretch and squash back together.
- **Plasma level.** Physics emits `plasma:level`: `PLASMA.wake` on fine-pointer hover,
  1 on press, focus-visible and click, eased with `PLASMA.easeMs`, in steps ≥ 0.02.
- **Coulomb pull.** `charge:attract` moves only awake bodies, by ≤ `nudgePx`, at most once
  per 400 ms; a resting body passes it to its support.
- **Bounds.** The dent is drawn, not laid out: hit areas never move, layout never
  changes, and the host affine stays inside `MOTION_BOUNDS`.

## 4. Arcs and the photosensitivity ledger (R9, R10, R13)

`lib/jelly/arcs/` draws arcs on one Canvas2D `.jelly-arc-layer` appended to `<body>`
(never React-rendered, not the WebGL context): seeded midpoint-displacement bolts with
≤ 3 branches, a wide low-alpha glow stroke under the core (no blur filters, no shadows),
1–3 re-strikes and an afterglow. Its frame driver (`ARC_FRAME_ORDER` = 30, drawn last) is awake only
while an arc or afterglow is alive (≤ ~410 ms).

- **Ambient** (`scheduler.ts`) — one `setTimeout`, never a frame. Pair rate
  `λ = 0.05·e^(−gap/48px)` s⁻¹ up to a 240 px gap; viewport cap 0.5 s⁻¹ (≤ 1 arc / 2 s;
  handheld ≤ 1 / 4 s, R10); ≥ 1.2 s between arcs; per-element charge drains on an arc and
  recharges over ~4 s. Paused while scrolling, typing, dragging, selecting text, with a
  modal or menu open, over a large playing video, or in fullscreen.
- **Click** (`clicks.ts`) — `pointerdown` from the pointer hub plus one capture `click`
  on the document (keyboard activation has no pointer event). A press discharges 1–3 bolts (3 fine / 2 coarse / 1 handheld) to the nearest
  neighbours within 180 px, or a rim fizz when nothing is in range; a keyboard activation
  strikes one dim arc; focus moves never arc. Disabled, editable and opted-out targets
  arc nothing.
- **Never**: an endpoint inside a field (`.glass-inset`, inputs), a strike on a toast, a
  field with focus or the element under the caret; arcs while the radial hub is open or an
  eversion is running.
- **Flash ledger** (`ledger.ts`, WCAG 2.3.1) — **one site-wide ledger**, ≤ 3 onsets in any
  1000 ms window (`FLASH_LEDGER`), shared by ambient, click, fizz, discharge and API arcs
  and any rim pulse above 0.1 ΔL. A 20-clicks-per-second storm still produces at most 3
  flashes per second; callers degrade by dropping re-strikes, then extra bolts, then the
  bolt, and keep the press and contact flare. Light themes composite with `source-over`
  (no white flash); a saturated red core is rotated to violet.
- **Public API** (`@/lib/jelly/arcs`) — `dischargeAt(x, y)` and `strike(a, b)`; both pass
  every gate and the ledger and return `false` while arcs are off.

### 4.1 Charge, breakdown and Coulomb (#989)

Every body carries a charge `q` in 0..1 that decays with `CHARGE.decayMs` (1.5 s).

- **Click charge.** A click deposits `CHARGE.clickCharge` on its body. The charge rings
  through the gel as a pulse (`charge:pulse { el, x, y, q }` on the bus → the engine draws
  a ring travelling at `CHARGE.pulseSpeedPxS`, `--pulse-speed`, decaying with
  `CHARGE.pulseTauMs`, `--pulse-tau`) and **hops** to the nearest neighbour in reach with
  `CHARGE.hopFraction` (half) of it, and on from there while the hop charge is at least
  `CHARGE.minHopCharge`. Each hop is an arc, so hops pass the flash ledger like every other
  arc: the number of hop arcs drawn is never more than the ledger admitted.
- **Breakdown.** A gap between two bodies smaller than `CHARGE.breakdownGapPx` × (1 +
  `CHARGE.breakdownChargeGain` · q) — 12 px × (1 + 1.5q), `--arc-breakdown-gap` — breaks
  down: after the formative lag (`CHARGE.formativeLagMs`, 120 ms, `--arc-formative-lag`)
  with the condition still holding, it strikes. A charged body therefore reaches further.
  The 16 px layout gap (§10) keeps uncharged bodies below breakdown.
- **Coulomb attraction.** Charged neighbours within `CHARGE.attractReachPx` attract,
  force ∝ q₁q₂/r² scaled by `CHARGE.attractGain`, equal and opposite on the pair
  (`charge:attract { el, nx, ny, force }` → physics). Physics turns it into a translate
  that never exceeds the nudge bound (`MOTION_BOUNDS`, ≤ 1.5 px); a body at rest passes it
  to its support rather than drifting.
- **Where it lives.** The laws are pure functions in `lib/jelly/arcs/charge.ts` (decay,
  breakdown gap, hop carry, Coulomb force; its `ELECTRIC` table holds the field's cadence:
  a 100 ms re-read of charged pairs, Coulomb impulses at most 10 Hz per pair, a 400 ms
  refractory after a pair breaks down, a ledger-refused hop waiting ≤ 1 s). The field
  controller `lib/jelly/arcs/field.ts` runs them on `setTimeout`, never a frame: a hop
  waits for the ring to reach the departure rim, then strikes through the ledger; a
  breakdown strikes after the formative lag; attraction is emitted to physics.
- **Ambient arcs** still strike more often the closer two surfaces are (the pair rate
  above); charge raises the rate only through the breakdown gap, never past the viewport
  cap or the ledger.

## 5. Budgets per tier (R6)

From `JELLY_BUDGETS` in `lib/jelly/tiers.ts` (the tests read the constants, never this
table):

| Tier                                   | Rims | Haze slots | Carriers | Clock / idle | Bodies    | Lattices | Ambient arcs | Click bolts |
| -------------------------------------- | ---- | ---------- | -------- | ------------ | --------- | -------- | ------------ | ----------- |
| `full` (fine pointer)                  | 24   | 8          | 24       | 60 / 30 Hz   | 12        | 8        | ≥ 2 s apart  | 3           |
| `coarse`                               | 16   | 6          | 16       | 60 / 30 Hz   | 8         | 6        | ≥ 2 s apart  | 2           |
| `handheld` (coarse, ≤ 1024 px)         | 10   | 4          | 8        | 30 / 15 Hz   | 6         | 4        | ≥ 4 s apart  | 1           |
| `lite` (`perf-lite`)                   | 0    | 0          | 0        | 0            | 3 (press) | 0        | off          | 0           |
| `off` (degraded)                       | 0    | 0          | 0        | 0            | 3 (press) | 0        | off          | 0           |
| game playing (`html[data-game-state]`) | 2    | 0          | 0        | 0            | 0         | 0        | off          | 0           |

Animated area (haze + carriers) is also capped at 1.5 / 1.25 / 1 viewports. Ambient
bounds (`AMBIENT_BOUNDS`): drift ≤ 12 px/s, feature size ≥ 120 px, luminance period ≥ 6 s,
no luminance modulation above 3 Hz; ambient motion never moves a host's position.

## 6. Degradation matrix

`jellyMode()` in `tiers.ts` folds the tier, the off predicate, both preferences and game
state into `{ambient, arcs, deform}` so the four services cannot disagree.

| Condition                                                           | Ambient haze   | Soft body  | Arcs               | Rim slabs   | CSS                   |
| ------------------------------------------------------------------- | -------------- | ---------- | ------------------ | ----------- | --------------------- |
| `lively` (default)                                                  | yes            | full       | per `electricArcs` | yes         | haze floor            |
| `calm`                                                              | × 0.4, ≤ 12 Hz | full       | clicks (or off)    | yes         | haze floor            |
| `still`                                                             | no             | press only | off (forced)       | yes         | haze floor            |
| `perf-lite`                                                         | no             | press only | off                | no          | haze floor + CSS rim  |
| reduced transparency (OS or account) · high contrast (site or app)  | no             | press only | off                | no          | opaque surfaces       |
| forced colours · print                                              | no             | none       | off                | no          | system colours / flat |
| hidden tab                                                          | clock 0        | none       | off, layer cleared | frames stop | —                     |
| game playing                                                        | no             | none       | off                | ≤ 2         | —                     |
| `[data-jelly-zone="playfield"]`, `[data-jelly-scope="off"]` subtree | no             | none       | none               | no          | —                     |
| no WebGL2 / context loss / past the rim budget                      | carrier        | unchanged  | unchanged          | no          | haze floor            |

Per-element opt-outs (`OPT_OUT_SELECTOR`): `data-jelly="off"` and the accepted aliases
`data-liquid-material="off"`, `data-liquid-glass="off"`, `data-liquid-motion="off"`,
`data-fluid-press="off|none"`. Do not branch on any of these conditions in a component.

## 7. Preferences and WCAG 2.2.2 (R8, R9)

Ambient haze starts automatically, lasts longer than 5 s and sits beside content, so
WCAG 2.2.2 (Pause, Stop, Hide) needs a mechanism on every page:

- **`jellyMotion`: `lively` | `calm` | `still`** (default `lively`) in Settings →
  Appearance, stamped pre-paint as `html[data-jelly-motion]` (absent = `lively`).
- **"Pause ambient motion"** (`QuickPanelMotionToggle`, `components/radial/QuickPanel.tsx`),
  a one-tap toggle that cycles to `still` and back to the previous level. A signed-in
  visitor finds it in the top-bar profile panel; a **signed-out** visitor, who has no
  profile panel and no Settings page, gets a **Display** panel (`DisplayPanel` in
  `components/radial/TopBarPanels.tsx`) holding the same control, because 2.2.2's pause
  has to reach everyone the motion reaches. Signed out, the choice lives on the device.
- **`electricArcs`: `full` | `clicks` | `off`** (default `full`), stamped as
  `html[data-electric-arcs]`. `still` forces arcs off whatever this says.

Both are account fields (one Prisma migration) with a localStorage cache for signed-out
visitors. Neither reads the OS `prefers-reduced-motion`: the retired site-wide motion
setting stays retired (CLAUDE.md §7); these are **material** controls. `still` also
satisfies WCAG 2.3.3 at no extra cost. Every jelly layer is `aria-hidden`,
`pointer-events: none`, never focusable and never announced. Tab order and hit areas
never change, and the focus ring is drawn by the host, so the envelope carries it along.
The ring is `--focus-ring`: solid, 2 px, never the plasma glow (a focused body's plasma
brightens, but that is decoration, not the focus signal). Plasma, haze, arcs and the lens
are decoration and never the only carrier of state; text holds 4.5:1 on gel, over haze
and over woken plasma in every theme (`jelly-legibility.test.ts`).

## 8. Ownership

| File                                                                                                 | Owns                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `lib/jelly/tiers.ts`                                                                                 | the single shared policy: tiers, budgets, `jellyMode`, off predicate, selectors, bounds, flash ledger, `DENT`, `PLASMA`, `CHARGE`, `JELLY_LAYOUT`                                                     |
| `lib/jelly/frame.ts`                                                                                 | **the one `requestAnimationFrame`**: every service registers a driver with `drive(fn, { order })`                                                                                                     |
| `lib/jelly/pointer.ts`                                                                               | **the one window pointer listener set**, fanned out with `onJellyPointer(type, fn)`                                                                                                                   |
| `lib/jelly/lens.ts`                                                                                  | the press lens: the only code that sets a filter on a jelly body, only while it is dented                                                                                                             |
| `lib/jelly/bus.ts`                                                                                   | the typed event bus (`arc:strike`, `body:release`, `drag:*`, `haze:change`, `plasma:level`, `charge:pulse`, `charge:attract`)                                                                         |
| `lib/jelly/registry.ts`                                                                              | one IntersectionObserver + ResizeObserver + MutationObserver over every jelly host; cached rects; no rAF                                                                                              |
| `lib/jelly/governor.ts`                                                                              | downscale-only frame-cost governor (pure)                                                                                                                                                             |
| `lib/jelly/flow-carriers.ts`                                                                         | which hosts carry a CSS `.jelly-flow`; no rAF                                                                                                                                                         |
| `lib/jelly/{physics,compose,envelope,lattice,lattice-inputs,soft-policy}.ts`                         | the soft body and the dent (`setDent` / `dentOf`); `physics.ts` is a frame driver (order 10)                                                                                                          |
| `lib/jelly/arcs/*`                                                                                   | arcs, charge, hops, breakdown, Coulomb; `renderer.ts` is a frame driver (order 30)                                                                                                                    |
| `lib/liquid/glass/{engine,shader,jelly-glsl,haze-shader,renderer,policy,scene,scene-store,color}.ts` | rims, RGB edge, plasma, dent glow and light dot, pulse rings, haze canvases, the ambient clock, lattice stepping, snapshots; `engine.ts` is a frame driver (order 20) with pointer input from the hub |
| `lib/liquid/runtime.ts`                                                                              | fallback cursor light on hosts the engine does not draw; a frame driver (order 25)                                                                                                                    |
| `hooks/useLiquidInteractions.ts`                                                                     | mounts the registry and physics at once (press feedback never waits), then carriers, arcs and the engine after `load` + idle; one teardown                                                            |
| `app/jelly-material.css` · `app/jelly-arcs.css` · `app/jelly-coverage.css`                           | CSS tier, arc layer, coverage adapters; `app/liquid-glass.css` keeps the role base                                                                                                                    |
| `components/shared/app-theme.css`                                                                    | the `--app-jelly-*` adapter for `.app-glass`                                                                                                                                                          |
| `app/routes/jelly.tsx`                                                                               | the `/jelly` material lab (`/liquid-glass` redirects there)                                                                                                                                           |

Exactly **one** jelly frame owner exists, `lib/jelly/frame.ts`; the engine, physics,
arcs and the fallback light are drivers on it (§8.1). **Components never import the physics or arc services** (the lab is
the one exception) and never add their own pointer loop, deformation or arc code; they
take jelly through role classes and `data-jelly*` attributes. The globe keeps its name,
its dough simulation (`lib/dough.ts`) and its own coat (`components/radial/jelly-glass.ts`,
"the globe's jelly coat" — unrelated to `lib/jelly/`); it shares the plasma palette only
through tokens (R15). That coat draws the material's layers itself — haze, dormant plasma, the RGB-led rim and
Fresnel edge — clipped to the sphere, so no globe element may ever be a rectangular host: `GLOBE_SELECTOR` in
`lib/jelly/tiers.ts` is part of `OPT_OUT_SELECTOR` and of the engine's and registry's excludes, and click arcs never
take a press on the globe (`lib/jelly/__tests__/globe-exclusion.test.ts`). The coat's private "drawn" flag is
`data-globe-coat`, never `data-jelly` (a `data-jelly` stage was the square plasma outline of 2026-10-23).

Retained from the liquid-glass contract, unchanged: the snapshot lifecycle
(`scene.ts`: 260 ms coalescing, ≥ 1.5 s spacing, idle-time capture, 1.6 s mutation
settle, no capture while scrolling/hidden/under the open globe, three failures stop
until the next route), the N-BK7 optics in `lib/liquid/optics.ts`, the rim admission
order overlay → chrome → pane → fill → control, the 16 px / 640,000 px² size limits and
the bevel geometry. See [`liquid-glass-system.md`](liquid-glass-system.md) for that
history.

### 8.1 One frame driver, one pointer hub

**`lib/jelly/frame.ts`** owns the only `requestAnimationFrame` under `lib/jelly/` and
`lib/liquid/`. A service registers once — `const d = drive((now, dt) => …, { order })` —
and calls `d.wake()` when something starts to move. A driver runs on the next frame only
while it is awake; returning `true` keeps it awake, anything else lets it sleep. **When no
driver is awake no frame is requested at all**, so the page at rest pays nothing beyond
what the ambient clock asks for, and the clock asks by waking from a timer, never by
spinning. Drivers run in ascending `order` (`useFluidDrag` 5 → physics 10 → engine 20 → fallback light 25 → arcs 30), so a
producer's state (the dent, the lattice drive, the charge) is drawn the same frame it is
written. `stop()` unregisters and cancels a pending frame nobody else needs; one driver
throwing is reported asynchronously and never stops the others.

**`lib/jelly/pointer.ts`** owns the only window/document `pointer*` listeners under
`lib/jelly/` and `lib/liquid/`: one capture-phase, passive listener per type, installed
with the first subscriber (`onJellyPointer(type, fn)`) and removed with the last
(refcounted). A throwing handler is isolated from the rest. Handlers never read layout
(rects come from the registry, refreshed on scroll/resize/activation) and never call
`preventDefault`.

Both are gated by `jelly-ownership.test.ts` (N2 b) and `raf-loop-allowlist.test.ts`, and
unit-tested in `lib/jelly/__tests__/{frame,pointer}.test.ts`.

## 9. Validation

| Proves                                   | Where                                                                                                                                                                                            |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| tiers, budgets, `jellyMode`, bounds      | `lib/jelly/__tests__/tiers.test.ts`, `governor.test.ts`                                                                                                                                          |
| tokens mirror the constants (§10)        | `lib/__tests__/jelly-tokens.test.ts`                                                                                                                                                             |
| one frame, one pointer hub (§8.1)        | `lib/jelly/__tests__/{frame,pointer}.test.ts`, `lib/liquid/__tests__/frame-owners.test.ts`, `lib/__tests__/jelly-ownership.test.ts` (N2 b); the press lens in `lib/jelly/__tests__/lens.test.ts` |
| never fake a law (§10)                   | `lib/__tests__/jelly-contract.test.ts` (no transform transitions, no keyframes but `.jelly-flow`, no `filter:` in jelly CSS)                                                                     |
| dent, lens, plasma level, click charge   | `testing/e2e/jelly-interaction.mjs`                                                                                                                                                              |
| soft body                                | `lib/jelly/__tests__/{envelope,lattice,lattice-inputs,soft-policy,physics}.test.ts`, `testing/e2e/jelly-soft-body.mjs`                                                                           |
| arcs and the ledger                      | `lib/jelly/arcs/__tests__/*` (`ledger`, `rate`, `scheduler`, `renderer` scans for blur)                                                                                                          |
| carriers and registry                    | `lib/jelly/__tests__/{flow-carriers,registry,bus}.test.ts`                                                                                                                                       |
| rims, haze, clock                        | `lib/liquid/glass/__tests__/*`, `testing/e2e/glass-slab.mjs`, `liquid-glass-engine.mjs`                                                                                                          |
| legibility over haze                     | `lib/__tests__/jelly-legibility.test.ts`                                                                                                                                                         |
| preferences pipeline                     | `lib/__tests__/appearance-jelly-motion.test.ts`, `appearance-electric-arcs.test.ts`, `fouc-contract.test.ts`                                                                                     |
| frame loops, filters, stacking, backdrop | `lib/__tests__/{raf-loop-allowlist,filter-cost-budget,stacking-consistency,static-backdrop,handheld-tier}.test.ts` and the jelly gates listed in `scripts/check-consistency.sh`                  |
| rest and engaged frame rates             | `testing/e2e/frame-budget.mjs` (clock ≤ 13 fps after the idle threshold, ambient arcs isolated)                                                                                                  |

Browser review (the part no script checks): `/`, a feed page, settings, an app and a
game; Daylight, Midnight and high contrast; phone and desktop width; `jellyMotion`
lively, calm and still; `electricArcs` off. Confirm nothing changed **layout**, nothing
moved more than the nudge bound, and the page drops to the idle floor after 20 s.

## 10. Layout, identity and tokens (#989)

**Layout.** Bodies sit at least `--space-4` (16 px, `JELLY_LAYOUT.minGapPx`) apart, which
keeps uncharged neighbours outside the breakdown gap. Leave `--jelly-margin` (16 px,
`JELLY_LAYOUT.marginPx`) **unclipped** round every body — the squash, the bulge opposite a
dent and the rubber band need it — so there is no `overflow: hidden` directly around one.
Cards use `--site-radius`, controls `--site-radius-sm`. Game play-fields are
`data-jelly-zone="playfield"` (excluded); ambient motion and arcs stop while a game is
playing.

**Identity.** Silent, sleek, frontier AI: calm, never busy. One electric accent
(`--site-accent`), which is also the plasma colour; no gradients on the ground, no neon or
glowing type, no sci-fi illustration. Text is Geist, eyebrows and data Geist Mono, through
the `--site-font-*` tokens (status 2026-10-23: Geist and Geist Mono are live, self-hosted, and
lead the default stacks; the system face, Inter and JetBrains Mono stay after them as the
non-Latin and fallback faces). **One signal action per view:** the primary action is
`<Button variant="signal">`, ink gel (`--gel-ink` with `--on-ink` text); everything else
on that view is a quieter variant.

**Never fake a law.** No keyframe wobble, `@keyframes` glow, `transition: transform` on a
body, untriggered flicker, ripple, or a second spring formula. The only sanctioned
keyframes in the jelly sheets are the `.jelly-flow` haze drift; the only filter on a body
is the lens, set from `lib/jelly/lens.ts` while it is dented. A new behaviour is a new
force in the services with a constant for every number. `jelly-contract.test.ts` scans
the jelly sheets for all three.

**Tokens.** The CSS tokens mirror the constants in `lib/jelly/tiers.ts`;
`lib/__tests__/jelly-tokens.test.ts` keeps each pair equal. Change the constant and the
token together.

| Token                     | Constant (`lib/jelly/tiers.ts`) | Value                       | Used by                       |
| ------------------------- | ------------------------------- | --------------------------- | ----------------------------- |
| `--jelly-dent-depth`      | `DENT.depthPx`                  | 6 px                        | dent bowl depth               |
| `--jelly-dent-damping`    | `DENT.damping`                  | 0.9                         | dent depth spring             |
| `--jelly-lens-strength`   | `DENT.lensStrength`             | 0.6                         | lens refraction               |
| `--jelly-lens-dispersion` | `DENT.lensDispersionPx`         | 1.5 px                      | lens R/G/B split              |
| `--jelly-content-strain`  | `DENT.contentStrain`            | 0.04                        | content following the gel     |
| `--plasma-wake`           | `PLASMA.wake`                   | 0.35                        | plasma level on hover         |
| `--arc-breakdown-gap`     | `CHARGE.breakdownGapPx`         | 12 px                       | breakdown gap at q = 0        |
| `--arc-formative-lag`     | `CHARGE.formativeLagMs`         | 120 ms                      | breakdown delay               |
| `--pulse-speed`           | `CHARGE.pulseSpeedPxS`          | 900 (px/s; unitless in CSS) | charge ring speed             |
| `--pulse-tau`             | `CHARGE.pulseTauMs`             | 260 ms                      | charge ring decay             |
| `--space-4`               | `JELLY_LAYOUT.minGapPx`         | 16 px                       | minimum gap between bodies    |
| `--jelly-margin`          | `JELLY_LAYOUT.marginPx`         | 16 px                       | unclipped margin round a body |
| `--jelly-body-budget`     | `JELLY_LAYOUT.bodyBudget`       | 24                          | absolute body cap, every tier |
| `--sim-hz`                | `JELLY_LAYOUT.simHz`            | 120                         | fixed physics step            |

Colour and material tokens with no numeric constant are per theme in `app/globals.css`
and zeroed or made opaque by high contrast: `--gel-body`, `--gel-depth`, `--gel-ink`,
`--on-ink`, `--gel-bevel`, `--gel-disperse-r`, `--gel-disperse-g`, `--gel-disperse-b`,
`--gel-fresnel`, `--gel-specular` and `--focus-ring`. The RGB split colours are
`--gel-edge-r/-g/-b` (CSS may not use raw colours), composed with the Fresnel line into
`--gel-edge` (three inset shadows plus the 1 px Fresnel). Tailwind exposes
`--color-gel-ink`, `--color-on-ink` and `--color-focus-ring` (`bg-gel-ink`,
`text-on-ink`, …). Inside `.app-theme` the app tier maps `--gel-*` and `--focus-ring` to
`--app-gel-*` / `--app-focus-ring`. The gel body is a vertical `--gel-body` →
`--gel-depth` gradient (the old broad diagonal coats are gone), and the fallback
`.liquid-light` is masked to an edge band, so no gloss crosses the face.
