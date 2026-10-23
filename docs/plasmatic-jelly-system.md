# Plasmatic jelly: implementation contract

Current as of 2026-10-23. This contract **supersedes**
[`liquid-glass-system.md`](liquid-glass-system.md) as the implementation authority for
the site's material, and supersedes `design-language.md` §5.1.1 ("cursor reactivity is
retired") and the "idle at rest" wording of its §7 for the jelly services. The decisions
behind it are R1–R16 in
[`plans/plasmatic-jelly/00-master-plan.md`](plans/plasmatic-jelly/00-master-plan.md);
the five section plans beside it hold the derivations. Where this file and the code
disagree, the code (and its tests) win and this file is the bug.

Every surface is a slab of slightly hazy, translucent plasma-jelly. The 3D refracting,
lit, rounded rim of liquid glass stays. Inside, a low-contrast haze is always drifting,
calm behind text and livelier at the rim. The jelly is soft: hover plumps and leans it,
press squashes it toward the contact, release wobbles it back, drag stretches it. It is
charged: nearby surfaces occasionally throw an electric arc across the gap, and a click
discharges 1–3 arcs to its nearest neighbours. **Text, hit areas and layout never move
beyond the bounded squash.**

## 1. Material and roles

The `glass-*` classes keep their names (R1): "glass" names the **elevation role**,
"jelly" names the **material** that renders every role. There are no `jelly-*` alias
classes and no `data-material` flag (R5).

| Role                                    | Rim (shader slab)                          | Haze                                          | Soft body                         | Arcs                              |
| --------------------------------------- | ------------------------------------------ | --------------------------------------------- | --------------------------------- | --------------------------------- |
| `glass-overlay` (L4)                    | admitted first; refracts settled snapshot  | canvas slot or carrier; quietest interior     | lattice rim only, host never moves | endpoints yes; never across its text |
| `glass-chrome` (L3)                     | admitted second; refracts snapshot         | canvas slot or carrier                        | lattice rim only                  | yes                               |
| `glass-pane` (L2), `app-glass`          | admitted third; lit, refract by opt-in     | canvas slot or carrier                        | lattice rim only                  | yes                               |
| `glass-fill` (L1), cards                | within budget                              | carrier, else static haze floor               | envelope + lattice when admitted  | yes                               |
| `glass-inset`, fields                   | within budget                              | rim-only carrier on the wrapper               | rim only; never moves while focused | **never** an endpoint            |
| solid buttons (`[data-slot=button]`)    | admitted last                              | static haze floor (never a canvas slot)       | envelope (press / hover dent)     | yes                               |
| toasts (`[data-sonner-toast]`)          | —                                          | static haze floor                             | envelope                          | **never** struck                  |

What draws what:

- **Rim** — `lib/liquid/glass/engine.ts` + `shader.ts` + `jelly-glsl.ts`: the existing
  refracting, Fresnel-lit slab, with a haze veil, a plasma inner edge line, a plasma
  cursor bloom and the `uJelly[8]` lattice warp of the SDF edge. One shared WebGL2
  context (`renderer.ts`) copies into a canvas that is the host's **last** child at a
  negative z-index inside an isolated stacking context.
- **Haze (shader tier)** — `haze-shader.ts`: a low-resolution `.jelly-haze-canvas`
  (≤ 256 px long side) with curl-noise flow, one domain-warp level and plasma only at the
  crests. The host gets `data-jelly-haze="on"` after the first draw and the bus hears
  `haze:change`.
- **Haze (CSS tier)** — `lib/jelly/flow-carriers.ts` injects a clipped, `aria-hidden`
  `.jelly-flow` span as the host's **first** child; its two inner spans animate
  `transform` only (`jelly-drift` / `jelly-current` in `app/jelly-material.css`). Hosts
  with text-only children never get one (React's `textContent` path would delete it).
- **Static haze floor** — every role's background stack in `app/jelly-material.css`
  (milky gradient + `public/jelly/haze-tile.webp` grain), so a surface reads as jelly
  with no JavaScript or WebGL. It is the complete fallback tier.
- **Charge** — `pulse(el, k)` raises a rim's plasma for ~300 ms on an arc strike or a
  strong release.

Tokens: `--site-jelly-*` (haze per role, plasma A/B, strength, flow speed, quiet),
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

## 2. The ambient clock and the idle policy (R7)

The owner's brief is that jelly **always** has underlying motion. The engine's ambient
clock therefore never freezes while someone could be looking:

| State                                              | Clock                                   |
| -------------------------------------------------- | --------------------------------------- |
| engaged (input within the last 20 s)               | tier clock: 30 Hz (15 Hz handheld)      |
| idle (`IDLE_AFTER_MS` = 20 s without input)        | floor: 12 Hz (8 Hz handheld) — **no freeze** |
| `jellyMotion = calm`                               | ≤ 12 Hz, amplitude × 0.4, slots halved  |
| hidden tab · unfocused window · scroll in flight · nothing hazy on screen · degraded tier · `still` · game playing | **0** — no loop at all |

Between ticks the engine sleeps on a timer, not on a spinning rAF; each tick draws at
most six due surfaces with one shared `uTime`.

**Audit reversal, recorded deliberately.** The 2026-10-08 performance audit set the
"page at rest" frame limit to 2 fps and the backdrop went fully still because of it.
R7 reverses that limit for the jelly material: the rest limit in `frame-budget.mjs`
becomes **13 fps** (the 12 Hz floor + 1). The CPU target at rest stays **≤ 250 ms/s** on
`/` (desktop; ≤ 200 ms/s handheld; the 2026-10-08 failure was 1020 ms/s). What did
**not** change: the backdrop (aurora, ring field) stays completely still
(`static-backdrop.test.ts`) — jelly moves, the room does not — and no site CSS may add a
free-standing `infinite` animation outside `.jelly-flow`.

**The governor** (`lib/jelly/governor.ts`) is the battery and thermal answer. The engine
feeds it each tick's cost and interval; after a 30-tick warm-up, a 2 s window whose p90
cost exceeds 2 ms (3 ms handheld) or whose p90 interval exceeds 1.5× the period takes one
step down: clock 30 → 20 Hz · slots halved · carriers halved · ambient arcs off · haze at
0.125 scale · clock 0. Downscale only, one step per window, reset on route change. The
tier itself never flips on a frame-rate reading.

## 3. Soft body (R11, R12)

`lib/jelly/physics.ts` is the one soft-body service: one delegated, capture-phase,
passive listener set per document and one rAF that exists **only while a body is
moving**. It absorbed the old press layer; `hooks/useFluidPress.ts` is deleted and the
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
`will-change` and `data-jelly-body` removed).

## 4. Arcs and the photosensitivity ledger (R9, R10, R13)

`lib/jelly/arcs/` draws arcs on one Canvas2D `.jelly-arc-layer` appended to `<body>`
(never React-rendered, not the WebGL context): seeded midpoint-displacement bolts with
≤ 3 branches, a wide low-alpha glow stroke under the core (no blur filters, no shadows),
1–3 re-strikes and an afterglow. Its rAF runs only while an arc or afterglow is alive
(≤ ~410 ms).

- **Ambient** (`scheduler.ts`) — one `setTimeout`, never a frame. Pair rate
  `λ = 0.05·e^(−gap/48px)` s⁻¹ up to a 240 px gap; viewport cap 0.5 s⁻¹ (≤ 1 arc / 2 s;
  handheld ≤ 1 / 4 s, R10); ≥ 1.2 s between arcs; per-element charge drains on an arc and
  recharges over ~4 s. Paused while scrolling, typing, dragging, selecting text, with a
  modal or menu open, over a large playing video, or in fullscreen.
- **Click** (`clicks.ts`) — one capture `pointerdown` + one capture `click` on the
  document. A press discharges 1–3 bolts (3 fine / 2 coarse / 1 handheld) to the nearest
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

## 5. Budgets per tier (R6)

From `JELLY_BUDGETS` in `lib/jelly/tiers.ts` (the tests read the constants, never this
table):

| Tier                                  | Rims | Haze slots | Carriers | Clock / idle | Bodies | Lattices | Ambient arcs | Click bolts |
| ------------------------------------- | ---- | ---------- | -------- | ------------ | ------ | -------- | ------------ | ----------- |
| `full` (fine pointer)                 | 24   | 8          | 24       | 30 / 12 Hz   | 12     | 8        | ≥ 2 s apart  | 3           |
| `coarse`                              | 16   | 6          | 16       | 30 / 12 Hz   | 8      | 6        | ≥ 2 s apart  | 2           |
| `handheld` (coarse, ≤ 1024 px)        | 10   | 4          | 8        | 15 / 8 Hz    | 6      | 4        | ≥ 4 s apart  | 1           |
| `lite` (`perf-lite`)                  | 0    | 0          | 0        | 0            | 3 (press) | 0     | off          | 0           |
| `off` (degraded)                      | 0    | 0          | 0        | 0            | 3 (press) | 0     | off          | 0           |
| game playing (`html[data-game-state]`) | 2   | 0          | 0        | 0            | 0      | 0        | off          | 0           |

Animated area (haze + carriers) is also capped at 1.5 / 1.25 / 1 viewports. Ambient
bounds (`AMBIENT_BOUNDS`): drift ≤ 12 px/s, feature size ≥ 120 px, luminance period ≥ 6 s,
no luminance modulation above 3 Hz; ambient motion never moves a host's position.

## 6. Degradation matrix

`jellyMode()` in `tiers.ts` folds the tier, the off predicate, both preferences and game
state into `{ambient, arcs, deform}` so the four services cannot disagree.

| Condition                                                          | Ambient haze | Soft body       | Arcs                 | Rim slabs | CSS            |
| ------------------------------------------------------------------ | ------------ | --------------- | -------------------- | --------- | -------------- |
| `lively` (default)                                                 | yes          | full            | per `electricArcs`   | yes       | haze floor     |
| `calm`                                                             | × 0.4, ≤ 12 Hz | full          | clicks (or off)      | yes       | haze floor     |
| `still`                                                            | no           | press only      | off (forced)         | yes       | haze floor     |
| `perf-lite`                                                        | no           | press only      | off                  | no        | haze floor + CSS rim |
| reduced transparency (OS or account) · high contrast (site or app) | no           | press only      | off                  | no        | opaque surfaces |
| forced colours · print                                             | no           | none            | off                  | no        | system colours / flat |
| hidden tab                                                         | clock 0      | none            | off, layer cleared   | frames stop | —            |
| game playing                                                       | no           | none            | off                  | ≤ 2       | —              |
| `[data-jelly-zone="playfield"]`, `[data-jelly-scope="off"]` subtree | no          | none            | none                 | no        | —              |
| no WebGL2 / context loss / past the rim budget                     | carrier      | unchanged       | unchanged            | no        | haze floor     |

Per-element opt-outs (`OPT_OUT_SELECTOR`): `data-jelly="off"` and the accepted aliases
`data-liquid-material="off"`, `data-liquid-glass="off"`, `data-liquid-motion="off"`,
`data-fluid-press="off|none"`. Do not branch on any of these conditions in a component.

## 7. Preferences and WCAG 2.2.2 (R8, R9)

Ambient haze starts automatically, lasts longer than 5 s and sits beside content, so
WCAG 2.2.2 (Pause, Stop, Hide) needs a mechanism on every page:

- **`jellyMotion`: `lively` | `calm` | `still`** (default `lively`) in Settings →
  Appearance, stamped pre-paint as `html[data-jelly-motion]` (absent = `lively`).
- **"Pause ambient motion"**, a one-tap toggle in the radial quick panel that cycles to
  `still` and back.
- **`electricArcs`: `full` | `clicks` | `off`** (default `full`), stamped as
  `html[data-electric-arcs]`. `still` forces arcs off whatever this says.

Both are account fields (one Prisma migration) with a localStorage cache for signed-out
visitors. Neither reads the OS `prefers-reduced-motion`: the retired site-wide motion
setting stays retired (CLAUDE.md §7); these are **material** controls. `still` also
satisfies WCAG 2.3.3 at no extra cost. Every jelly layer is `aria-hidden`,
`pointer-events: none`, never focusable and never announced. Tab order and hit areas
never change, and the focus ring is drawn by the host, so the envelope carries it along.

## 8. Ownership

| File                                                         | Owns                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `lib/jelly/tiers.ts`                                         | the single shared policy: tiers, budgets, `jellyMode`, off predicate, selectors, bounds, flash ledger constants |
| `lib/jelly/bus.ts`                                           | the typed event bus (`arc:strike`, `body:release`, `drag:*`, `haze:change`)                            |
| `lib/jelly/registry.ts`                                      | one IntersectionObserver + ResizeObserver + MutationObserver over every jelly host; cached rects; no rAF |
| `lib/jelly/governor.ts`                                      | downscale-only frame-cost governor (pure)                                                              |
| `lib/jelly/flow-carriers.ts`                                 | which hosts carry a CSS `.jelly-flow`; no rAF                                                          |
| `lib/jelly/{physics,compose,envelope,lattice,lattice-inputs,soft-policy}.ts` | the soft body; `physics.ts` is the only rAF owner                                      |
| `lib/jelly/arcs/*`                                           | arcs; `renderer.ts` is the only rAF owner                                                              |
| `lib/liquid/glass/{engine,shader,jelly-glsl,haze-shader,renderer,policy,scene,scene-store,color}.ts` | rims, haze canvases, the ambient clock (the one standing loop), lattice stepping, snapshots |
| `lib/liquid/runtime.ts`                                      | fallback cursor light on hosts the engine does not draw                                                |
| `hooks/useLiquidInteractions.ts`                             | mounts registry, engine, carriers, physics and arcs in one idle callback with one teardown             |
| `app/jelly-material.css` · `app/jelly-arcs.css` · `app/jelly-coverage.css` | CSS tier, arc layer, coverage adapters; `app/liquid-glass.css` keeps the role base         |
| `components/shared/app-theme.css`                            | the `--app-jelly-*` adapter for `.app-glass`                                                           |
| `app/routes/jelly.tsx`                                       | the `/jelly` material lab (`/liquid-glass` redirects there)                                            |

Exactly three jelly frame owners exist: the engine's ambient clock, `physics.ts` and
`arcs/renderer.ts`. **Components never import the physics or arc services** (the lab is
the one exception) and never add their own pointer loop, deformation or arc code; they
take jelly through role classes and `data-jelly*` attributes. The globe keeps its name,
its dough simulation (`lib/dough.ts`) and its own coat (`components/radial/jelly-glass.ts`,
"the globe's jelly coat" — unrelated to `lib/jelly/`); it shares the plasma palette only
through tokens (R15).

Retained from the liquid-glass contract, unchanged: the snapshot lifecycle
(`scene.ts`: 260 ms coalescing, ≥ 1.5 s spacing, idle-time capture, 1.6 s mutation
settle, no capture while scrolling/hidden/under the open globe, three failures stop
until the next route), the N-BK7 optics in `lib/liquid/optics.ts`, the rim admission
order overlay → chrome → pane → fill → control, the 16 px / 640,000 px² size limits and
the bevel geometry. See [`liquid-glass-system.md`](liquid-glass-system.md) for that
history.

## 9. Validation

| Proves                                  | Where                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| tiers, budgets, `jellyMode`, bounds      | `lib/jelly/__tests__/tiers.test.ts`, `governor.test.ts`                                                |
| soft body                               | `lib/jelly/__tests__/{envelope,lattice,lattice-inputs,soft-policy,physics}.test.ts`, `testing/e2e/jelly-soft-body.mjs` |
| arcs and the ledger                     | `lib/jelly/arcs/__tests__/*` (`ledger`, `rate`, `scheduler`, `renderer` scans for blur)                |
| carriers and registry                   | `lib/jelly/__tests__/{flow-carriers,registry,bus}.test.ts`                                             |
| rims, haze, clock                       | `lib/liquid/glass/__tests__/*`, `testing/e2e/glass-slab.mjs`, `liquid-glass-engine.mjs`                 |
| legibility over haze                    | `lib/__tests__/jelly-legibility.test.ts`                                                               |
| preferences pipeline                    | `lib/__tests__/appearance-jelly-motion.test.ts`, `appearance-electric-arcs.test.ts`, `fouc-contract.test.ts` |
| frame loops, filters, stacking, backdrop | `lib/__tests__/{raf-loop-allowlist,filter-cost-budget,stacking-consistency,static-backdrop,handheld-tier}.test.ts` and the jelly gates listed in `scripts/check-consistency.sh` |
| rest and engaged frame rates            | `testing/e2e/frame-budget.mjs` (rest ≤ 13 fps after the idle threshold)                                |

Browser review (the part no script checks): `/`, a feed page, settings, an app and a
game; Daylight, Midnight and high contrast; phone and desktop width; `jellyMotion`
lively, calm and still; `electricArcs` off. Confirm nothing changed **layout**, nothing
moved more than the nudge bound, and the page drops to the idle floor after 20 s.
