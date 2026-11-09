# Plasmatic jelly: implementation contract

Current as of 2026-11-08 (CSS-first jelly, PR 5). This contract **supersedes**
[`liquid-glass-system.md`](liquid-glass-system.md) as the implementation authority for the
site's material, and supersedes `design-language.md` §5.1.1 ("cursor reactivity is
retired") for the jelly services. The design that produced it is
[`superpowers/specs/2026-11-07-css-first-jelly-design.md`](superpowers/specs/2026-11-07-css-first-jelly-design.md);
the decisions behind the older shape are R1–R16 in
[`plans/plasmatic-jelly/00-master-plan.md`](plans/plasmatic-jelly/00-master-plan.md). Where
this file and the code disagree, the code (and its tests) win and this file is the bug.

**The shape of it.** The material is **static CSS plus effects that wake on an event**.
A page at rest runs no `requestAnimationFrame` loop, no canvas, no worker and no snapshot
capture for site surfaces (the rim's refraction asks for a picture only at the moments above). Five things are not CSS (the fifth, the rim refraction service, ships dormant):

- the **click arc** (`lib/jelly/arcs/`), imported on the first press and removed 10 s after
  the last click;
- the **pointer variable** (`lib/jelly/pointer-vars.ts`), one delegated listener that writes
  `--px` / `--py` / `--jelly-s` on the hovered host;
- the **scene feed** (`lib/liquid/glass/scene-feed.ts`), the page picture the liquid globe and
  the rim layers refract, taken a few times per page (load, route change, theme change, resize,
  a reflow, and scroll REST while a fixed / sticky / overlay host holds a rim layer);
- the **rim refraction service** (`lib/jelly/refract/install.ts`, §1.2): which on-screen glass
  hosts hold a refracting layer, kept in place by observers, with no frame and nothing at rest;
- the **liquid globe**, its own WebGL scene, which draws in a worker
  (`components/radial/globe-worker.ts`). (The everting globe cursor that used to share this tier was removed 2026-11-08;
  the OS pointer shows everywhere.)

The short statement every agent reads is the "Design system: Plasmatic Jelly" section of
[`CLAUDE.md`](../CLAUDE.md); this file is the detail behind it. Every number is a named
constant in `lib/jelly/tiers.ts` (`JELLY_BUDGETS`, `MOTION_BOUNDS`, `AMBIENT_BOUNDS`,
`FLASH_LEDGER`, `PLASMA`, `CHARGE`, `JELLY_LAYOUT`) or `lib/jelly/soft-policy.ts`
(`SOFT_BODY`, `CSS_SPRINGS`, `CSS_SOFT_BODY`), mirrored as a CSS token where CSS needs it
(§10) — never restated in a component.

Every surface is a slab of slightly hazy, translucent plasma-jelly with a soft molded rim.
Under the hand it wakes: hover lights a dormant plasma and drifts the haze, press squashes
the slab on a spring and sinks a lit dot under the pointer, release wobbles it back. A click
throws an electric arc. **Text, hit areas and layout never move beyond the bounded squash.**

## 1. Material and roles

The `glass-*` classes keep their names (R1): "glass" names the **elevation role**,
"jelly" names the **material** that renders every role. There are no `jelly-*` alias
classes and no `data-material` flag (R5).

| Role                                 | Rim and body                                                 | Woken haze                     | Soft body                          | Click arcs                  |
| ------------------------------------ | ------------------------------------------------------------ | ------------------------------ | ---------------------------------- | --------------------------- |
| `glass-overlay` (L4)                 | static CSS rim (refraction dormant, §1.2), quietest interior | yes, on hover / keyboard focus | only as a press body               | endpoints no (text-bearing) |
| `glass-chrome` (L3)                  | static CSS rim (refraction dormant)                          | yes                            | only as a press body               | yes                         |
| `glass-pane` (L2), `app-glass`       | static CSS rim (refraction dormant)                          | yes                            | only as a press body; never plumps | yes                         |
| `glass-fill` (L1), cards             | static CSS rim (refraction dormant)                          | yes                            | plump / squash                     | yes                         |
| `glass-inset`, fields                | rim plus a well (refraction dormant)                         | **none** (no pseudo layer)     | never moves                        | **never** an endpoint       |
| solid buttons (`[data-slot=button]`) | static CSS rim                                               | yes (ghost / link: none)       | dent / squash                      | yes                         |
| toasts (`[data-sonner-toast]`)       | coverage-tier rim                                            | —                              | —                                  | **never** struck            |

What draws what:

- **Gel and rim** — `app/liquid-glass.css` (tint, vertical `--gel-body` → `--gel-depth`
  coat) and `app/jelly-material.css` §2b / §4: ONE soft inset glow, `--gel-glow`
  (the Fresnel colour carrying a red / blue tint, `--gel-bevel` × `--gel-shoulder` wide), a lit
  top hairline (`border-top-color`) and, on a field, a second shadow for the well. No hairline
  outline, no per-host canvas. Hosts the coverage tier owns (tab thumb, switch, slider,
  skeleton, toasts, bare `[data-jelly]`) still use the multi-inset `--gel-edge`.
- **Static haze floor** — every role's background stack carries the 192 px grain tile
  (`public/jelly/haze-tile.webp`, `--jelly-floor`): the surface reads as jelly with no JavaScript.
- **Woken haze** — `app/jelly-material.css` §3b. One transform-only layer on the host's own
  `::after`, with **no box at all at rest** (`display: none`). It gets a box, and the drift
  animation (`jelly-drift`, 22 s per leg, scaled by the role's `--jelly-flow-speed` and the motion
  level), only while the host is hovered or holds **keyboard** focus (`:hover`,
  `:has(:focus-visible)`), fading in from `@starting-style`. A page at rest therefore has no running
  animation and no extra compositor layer. It pauses while scrolling and while a game is in play,
  and is absent under `still`, print, the app high-contrast theme, native-material routes
  (`/games*`, `/tf2*`), fields, ghost / link buttons and every opt-out. Streaks, plasma blob and
  current are tokens (`--jelly-haze-a`, `--jelly-plasma-k`, `--site-jelly-*`), so a theme re-tints it.
- **Dormant plasma** — invisible at rest; the hover wake is a radial gradient at the pointer
  (`--px` / `--py`) at `--plasma-wake` strength, brighter on press and focus. It is the accent
  colour and is never an outline.
- **No gloss** — no broad gloss band or glint across a face. Shine lives at the edge and in the
  press dot (§3.1).

Tokens: `--site-jelly-*` (haze per role, plasma A/B, strength, flow speed, quiet),
`--site-arc-core` / `--site-arc-glow`, `--z-arcs` (45) / `--z-arcs-modal` (55), mirrored for the
app tier as `--app-jelly-*`. Role knobs (`--jelly-haze-a`, `--jelly-plasma-k`,
`--jelly-flow-speed`) are set on the host per role and read by the woken haze.

**No `backdrop-filter` in any role, ever.** "Hazy" is drawn by transform-only CSS layers;
frosted blur is the path back to the cost and engine disagreement liquid glass removed. Every
jelly paint layer sits at a **negative** z-index inside an isolated host (the woken-haze host
isolates itself); the arc layer is the one body-level exception and is `pointer-events: none`.

### 1.0 What the migration gave up

The CSS-first migration (PRs 1 to 5, 2026-11-07 / 08) traded the following for a page that costs
nothing at rest. They are not coming back without a new design:

- The **lens-refracted press dent**, and (still) the **rim's refraction of the page behind it**
  with the wavelength dispersion. 2026-11-09 rebuilt the rim's refraction as an SVG filter on the
  shared snapshot (§1.2), in all three engines, and shipped it **dormant** (`refractHosts` 0) because
  the filter fails the performance bar on a software renderer. The WebGL shader rim did not come
  back; the liquid globe still has its own shader.
- **The silhouette**: the gel no longer bulges up to 16 px past its host or sags under a press (the
  24-node lattice, `lib/jelly/lattice.ts`, is gone). Hosts move only within `MOTION_BOUNDS`.
- **Ambient arcs** between nearby surfaces, **Coulomb attraction** and **neighbour nudges**. The
  click arc stays; its runtime is installed with `ambient: false`.
- **Haze that moves at rest.** It moves under the hand.
- At rest, the **red-toward-the-light / blue-away offset split** of the rim, the plasma subsurface
  tint and the faint resting haze streaks (each at most 14 to 19 / 255 by pixel diff). The rim keeps
  its red / blue tint; the wake lights the plasma on hover.
- The hand-over cross-fades (`data-liquid-canvas`, `data-jelly-haze`, `data-jelly-gel`) and the CSS
  flow carriers (`.jelly-flow`). Nothing injects a node into a host any more but the rim's refraction layer (§1.2).

### 1.1 The physical layers (#989)

Read a surface from the inside out. Each layer is CSS (or, for the globe, its own shader); no
component paints one.

| #   | Layer        | What it is                                                                                                                                                                                                                                | Drawn by                                                          | Tokens                                                                                  |
| --- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 1   | **Gel**      | Hazy, translucent body that darkens slightly toward its base. The primary action is ink gel.                                                                                                                                              | CSS gel layers (`app/liquid-glass.css`, `jelly-material.css` §2b) | `--gel-body` → `--gel-depth`; `--gel-ink`, `--on-ink`                                   |
| 2   | **Haze**     | Low-contrast flow: currents, eddies, faint plasma at the crests, calm behind text (≤ 12 px/s, features ≥ 120 px). Moves while the host is woken.                                                                                          | woken-haze `::after` (§3b)                                        | `--site-jelly-*`, `--jelly-haze-a`, `--jelly-flow-speed`                                |
| 3   | **Plasma**   | A core and filaments **inside** the gel, invisible at rest. Hover wakes it to `--plasma-wake` (`PLASMA.wake`); press, focus and a click brighten it. Plasma never draws an outline.                                                       | radial gradient at `--px` / `--py`                                | `--plasma-wake`, `--jelly-plasma-k`                                                     |
| 4   | **Edge**     | A molded rim: the slab rises out of the ground over a widened shoulder (`--gel-shoulder`) with a feathered silhouette (`--gel-feather`), lit on the light side, no hairline. The 1 px Fresnel edge returns only where the feather is off. | `--gel-glow` (static)                                             | `--gel-bevel`, `--gel-shoulder`, `--gel-feather`, `--gel-fresnel`, `--gel-edge-r/-g/-b` |
| 5   | **No gloss** | No broad gloss band or glint across the face. Shine lives at the edges and in the press dot (§3.1).                                                                                                                                       | —                                                                 | —                                                                                       |

The plasma colour **is** the accent (`--site-accent`); the haze's second plasma hue only appears
inside the gel, never as UI colour. The liquid globe draws the same layers itself, round, in its
shader (`components/radial/jelly-glass.ts`): see §8.

### 1.2 Refraction at the rim (2026-11-09) — built, tested, and shipped dormant

**Status.** Everything below exists, is unit- and contract-tested and was looked at in Chromium, Firefox and WebKit, but
**`JELLY_BUDGETS[tier].refractHosts` is 0 on every tier**, so nothing is imported, captured or drawn and the site is as it was
before. It failed the performance bar in Firefox on a software renderer (the SVG filter costs about 50 ms a frame while the page
scrolls), and so did the spec's fallback of chrome, overlay and pane only; see "Measured" below. To switch it on, set `refractHosts`
(24 on `full`, 12 on `coarse` is what was measured) and, for the fallback, `REFRACT_ROLES = 'floating'`, both in
`lib/jelly/tiers.ts`; no other file changes. The next step this evidence points at is baking each rim into an image once per
picture instead of running a filter per frame (see "What to try next").

Every main-site glass host that is on screen bends the page behind its rim, in Chromium, Firefox and WebKit, with the
red / green / blue dispersion of §1.1 layer 4. Owner call, spec
[`2026-11-08-refractive-glass-design.md`](superpowers/specs/2026-11-08-refractive-glass-design.md): the same technique in
every browser, never `backdrop-filter` (it bends the backdrop in Chromium only).

**Anatomy.** A host that holds a layer carries `data-refract` and one `aria-hidden`
`<span class="jelly-refract">` as its **first** child (`lib/jelly/refract/layer.ts`; first, because a trailing child would take
a `:last-child` or `space-y` margin from the host's real last child, and a leading one only loses `:first-child`). The span has
no box (`display: contents`); it carries custom properties and its two pseudo-elements draw (`app/jelly-refract.css`):

- `::before` is the band. It reaches `--rf-pad` (10 px) past the host so a pixel pushed outward still has picture under it.
  Its background is the shared page snapshot (`--rf-img`, `--rf-size`, `--rf-pos`) over the page's ground colour
  (`--rf-ground`), and `filter: var(--rf-flt)` is `url(#jelly-rf-<class>)`. `opacity` is `--rf-cover`, through one 240 ms
  `--ease-smooth` transition.
- `::after` is the host's soft lip (`--gel-glow`). A negative-z child paints over its parent's inset shadow, so while a layer is
  live the lip is painted here, above the band, and the host's own shadow yields (`[data-refract]` rule).

**The filter** (`lib/jelly/refract/filters.ts`) is a plain SVG `<filter>`, one per **size class**, in one hidden `<svg>`,
refcounted and removed with its last user. An `feImage` map, stretched over the layer, is the rim profile: R and G are the
displacement (the outward normal of the rounded rectangle under a smoothstep falloff, 12 px wide, strongest at the rim), B is
the band's own opacity (full at the rim, easing to 0 at the inner side), so the refracted picture dissolves into the live
interior and the layer needs no mask. Three `feDisplacementMap`s at `8 px × 2 × DISPERSION.{r,g,b}` (1.1875 / 1 / 0.8125, derived
from `--gel-disperse-*` over `--gel-bevel`; red leans to the top-left light, in LTR and RTL alike), each reduced to its own
channel and screen-blended; a 0.6 px blur takes the staircase out of a 1.25x picture on a 2x screen; the map's blue channel
becomes alpha and the result is composited `in` it. Maps are built once per class at 2 map px per CSS px (`profile.ts`,
`rimMap`; only the ring is computed). `sizeClass` rounds width and height up to a geometric bucket (ratio 1.15 from 16 px) and
snaps the radius, so a sweep of widths from 200 to 800 px is 10 classes.

**Which way it bends.** A host the picture HIDES (chrome, overlay: `SCENE_HIDE`) bends **outward**, like a lens pulling in what
lies beyond the rim; the band shows real content under it. A host the picture HOLDS (cards, panes, fields) bends **inward**
(its own class, key suffix `i`): outward would sample the card's own edge and glow and show them a second time inside the band
(Spec call 4). A hidden host also paints its own tint over the picture (floor, gel coat, `background-color`, written as
`--rf-tint`), because the opaque band would otherwise replace it.

**Placement** (`lib/jelly/refract/coverage.ts`). The picture is viewport-sized and was taken at one scroll position. An in-flow
host scrolls with the content behind it, so its offset comes from its document position and does not change while the page
scrolls. A fixed or sticky host sits over content that moves: its offset moves 1:1 with `scroll − sceneScroll`, and its layer
**fades at the first scroll event and returns when the scroll rests** (the service re-places it first). The capture draws the page
from `<body>`'s own origin, so in-flow content sits `origin` px above its live place (12 px on the site shell: a first child's
margin collapses through the body live and not in the clone); the scene feed records that origin and the document's height when a
capture starts, and a layer adds the origin back. `cover` is the share of the host's on-screen part the picture still covers, so
a layer fades to the lit rim instead of showing a wrong picture.

**Stale means faded.** A layer's cover is 0 when there is no picture, the theme or the route changed since it (the stamp:
pathname, `<html>` class, `data-theme`, `style`), the document's height differs from the picture's, or its own host moved or
resized by more than 1.5 px (a fresh picture is asked for once the layout has been still for 1.2 s; typing in a textarea never
asks). A webfont arriving late also re-checks. The page's first picture is re-asked for 600 ms after the fonts settle.

**Budget and exclusions.** `JELLY_BUDGETS[tier].refractHosts` hosts at most, nearest the viewport centre first, only on-screen
ones (the jelly registry's observers; scrolling defers all work to scroll end). Never: `.glass-opaque`, `[data-jelly-refract="off"]`,
replaced elements (`input`, `textarea`, `select`, `img`, `video`, `canvas`, `iframe`), `contenteditable`, hosts under `.app-theme`,
`html.app-route`, `html.native-material`, `[data-jelly-scope="off"]` or `[data-jelly-zone="playfield"]`, static-position or
`display: contents` hosts, hosts under 24 × 16 px. Print and `.app-high-contrast` hide the layer and the service detaches
everything; `jellyTier()` `off` has a budget of 0.

**Cost rules.** Nothing runs at rest: no `requestAnimationFrame` (pinned by `jelly-refract.test.ts`), no `infinite` animation, no
animated root property. The layer is static CSS; the service reacts to observers (registry, scene image, scroll end, theme
mutation) through one idle callback. A picture costs what it always cost (100 to 300 ms of time-sliced work; see the limits
below) and is requested only at the moments listed in the shape of it above. Scroll REST asks for one only while a fixed, sticky
or overlay host holds a layer.

**Layout.** The layer never changes a box. Audited in Chromium on `/`, `/jelly`, `/library`, `/blog`, `/store` and `/about` (every
host holding a layer, the host and every element inside it measured with and without the span): 0 differences across about 30
hosts. The only structural cost is the span itself, as the host's first child (see above).

**Limits, stated plainly.**

- Over flat ground a rim shows nothing, because there is nothing behind it to bend (physically correct); the effect is in front of
  photos, other glass and bright content.
- The snapshot is the page's in-flow content. It does **not** hold the fixed aurora behind the page, so in Daylight a rim shows
  the white ground where the live page is faintly tinted: a slightly lighter rim over the aurora. (Fixing it means the capture
  drawing fixed backgrounds, which the eversion capture does not.)
- The picture is captured at most 1.25x and shown at the screen's scale, so a rim on a 3x screen is soft.
- **A capture that takes longer than 4 s is abandoned** (`CAPTURE_TIMEOUT_MS`, unchanged). In a software-rendered browser
  without a GPU that can mean no picture and so no refraction: on the 4-core sandbox used for the measurements, a capture at
  1280 × 800 took 4.3 s in Firefox (llvmpipe) and 8 to 15 s in WebKitGTK; both get no layers with the shipped timeout (Chromium,
  and Firefox at 390 px, do), and fall back to the lit rim. Real hardware takes 100 to 300 ms.

**Measured (production builds, software GL with no renderer spoof, median of 5 interleaved runs, BEFORE = `origin/main`
94e13a721).** "all" is every role with the measured budget (24 / 12); "floating" is chrome, overlay and pane only (emulated on
the same build by hiding the bands of cards and fields, their lit lip kept). Scenarios ran once a layer was live, so they measure the
steady state, not the first picture. The shipped capture timeout (4 s) is also reported: on this 4-core sandbox a 1280 × 800 picture
takes 4.3 s in Firefox (llvmpipe) and 8 to 15 s in WebKitGTK, so with the shipped timeout those two engines get no layers at all.

| Bar metric (hard gate)                 | BEFORE        | all, layers live    | floating, layers live           | Bar        |
| -------------------------------------- | ------------- | ------------------- | ------------------------------- | ---------- |
| Firefox `/jelly` scroll frame p95      | 17.3 ms       | **68.0 ms (+294%)** | **67.2 ms (+289%)**             | within 10% |
| Firefox `/` scroll frame p95           | 34.5 ms       | **85.3 ms (+147%)** | 34.5 ms (-32%, noise)           | within 10% |
| Chromium rest CPU, `/` and `/jelly`    | 2164 / 6 ms/s | 2282 / 6 (+5% / 0%) | 2214 / 4 (+4% / -20%)           | unchanged  |
| Chromium rest layers, `/` and `/jelly` | 34 / 11       | 34 / 11             | 34 / 11                         | unchanged  |
| WebKit theme switch p50 (`/`)          | 626 ms        | 658 ms (+5%)        | 620 ms (-1%)                    | within 10% |
| WebKit press down p95 (`/`)            | 1977 ms       | 1907 ms (-4%)       | 2567 ms (+30%, range 1933-2975) | within 10% |
| WebKit scroll frame p95 (`/`)          | 487 ms        | 397 ms (-18%)       | 503 ms (+3%)                    | within 10% |

WebKit's software numbers swing by 20 to 30% between runs on this machine (the min-max ranges are in the report), so its rows are
inside the noise either way; the layers were live in every WebKit run (30 of 30 awaited). Other metrics (not gates): Chromium scroll p95 is unchanged (`/` 16.8 ms both, after a fix that stopped asking for a picture
after every scroll; the first build was +250%); Chromium hover and press at `/` are worse with all roles (move p95 +173%, press
down p95 +131%) and mostly recover with floating (+10%, +19%); Firefox theme switch p50 31 ms both; rAF per second and rest CPU are
unchanged in every engine.

**Where the cost is.** One build, four ways (Firefox, scroll, layers live): hiding the layers' paint restores the baseline exactly
(`/jelly` 17.3 ms), removing only the filter restores it exactly (17.3 ms), removing only the picture (filter over nothing) changes
nothing (67.9 ms). So the filter graph (an `feImage` map, three `feDisplacementMap`s, channel matrices, two blends, a blur, a
composite) is what a software WebRender re-runs per frame over the whole layer box while content scrolls; the snapshot, the
capture and the service are not. The same ablation in Chromium puts the press cost there too: with the filter removed the press
long tasks go from 35 to 1.

**What to try next.** Bake instead of filter. Everything the filter computes depends only on the picture, the host's size class
and its radius, all of which change at the moments this service already reacts to (a new picture, a host resize), never per
frame. Compute each host's rim once at those moments, in JavaScript or a worker, from the snapshot bitmap (the same `rimMap`,
sampling the three channels at their own offsets, writing only the ring), and show it as a plain image background: no filter, no
transform-dependent raster, nothing for a software renderer to redo per frame. The maths (`profile.ts`), placement and coverage
(`coverage.ts`), the stale rules and the service (`install.ts`) carry over; `filters.ts` and `scene-image.ts` are what a bake
replaces. Re-measure the bar with it before the budget moves off 0.

Tests: `lib/jelly/refract/__tests__/` (maths, filters, scene image, the service with fakes), `lib/__tests__/jelly-refract.test.ts`
(sheet and source gates: no `backdrop-filter`, no `infinite`, no `@keyframes`, no rAF, the numbers CSS restates).

## 2. The ambient clock and the idle policy (R7)

Site surfaces have no clock. The only ambient clock left belongs to the **liquid globe**, which draws in a
worker and keeps the page's tick grid
(`lib/jelly/ambient-tick.ts`) so its main-thread and worker clocks at the same rate draw in the same frame:

| State                                                                                           | Globe clock                                  |
| ----------------------------------------------------------------------------------------------- | -------------------------------------------- |
| engaged (pointer over or near the globe or its dock, a hold on the ball, focus inside the dock) | tier clock: 60 Hz (30 Hz handheld)           |
| settle after the last engagement (`GLOBE_SETTLE_MS`, 1.5 s)                                     | engaged rate, so a release finishes          |
| anything else, visible                                                                          | floor: 15 Hz (7 Hz handheld) — **no freeze** |
| `jellyMotion = calm`                                                                            | ≤ 12 Hz, amplitude × 0.4                     |
| hidden tab · unfocused window · off screen · degraded tier · `still` · game playing             | **0**                                        |

"Engaged" is decided by `components/radial/globe-engagement.ts` (`GLOBE_NEAR_MARGIN_PX` = 24): input
elsewhere on the page does not raise the globe's rate. `IDLE_AFTER_MS` (20 s) remains the budget's
idle threshold for callers that ask. Between ticks the page-side loops sleep on a timer, not on a
spinning `requestAnimationFrame`.

**Audit reversal, recorded deliberately.** The 2026-10-08 audit set the "page at rest" frame limit to
2 fps. R7 reversed that for the globe's idle floor: the rest limit in `frame-budget.mjs` is the floor
**+ 1** frame (16 fps at 15 Hz). The CPU target at rest stays **≤ 250 ms/s** on `/`. What did **not**
change: the backdrop (aurora, ring field) stays completely still (`static-backdrop.test.ts`), and no
site CSS may add a free-standing `infinite` animation outside the woken haze (N3).

**Program compiles never block.** `lib/render/gl-program.ts` queues compile + link and reads
`LINK_STATUS` once the driver is done (`KHR_parallel_shader_compile`).

## 3. Soft body (R11, R12)

The soft body is **CSS**: `app/jelly-material.css` §8, with the numbers from
`lib/jelly/soft-policy.ts`. A host plumps under a hovering fine pointer (cards to
`--jelly-hover-plump`, controls dent to `--jelly-hover-dent`), squashes while pressed
(`--jelly-press-card` / `--jelly-press-control`) and springs back on release, by a transition on
**`scale` only**, eased by `linear(...)` curves sampled once from the soft body's own springs
(`CSS_SPRINGS`: `jellyPress`, critically damped and quick; `jellyRelease`, ζ 0.42, the let-go wobble)
and authored as the `--spring-*` tokens. `lib/__tests__/jelly-spring-tokens.test.ts` keeps every
literal equal to its generator; retune the TypeScript, then paste what the test expects.

- **One spring source, no per-component curves.** A host's `transition` list ends with the
  `--jelly-spring-t` hook (`scale <dur> <curve>`); the hook is set by the §8 state rules, defaulted
  to nothing, and restated for Tailwind transition utilities in §8b. A component never writes its own
  ease on a moving property (`jelly-contract.test.ts` N13).
- **Press-through.** `:active` matches every ancestor, so a card would squash with the button inside it.
  A host does not squash while a real control inside it is what is pressed; a plain `<a>` is not one, so a
  card wrapped in a link squashes as the card. A **press body** (`data-jelly-press-body`: `JellyGroup`,
  the top bar, the selection bar, a scroller's pill) squashes as ONE body when any member is pressed
  and its members add no cue of their own (a keyboard-activated member keeps its opacity cue).
  `LiquidTabs` strips are not bodies: the track is a field, which never moves.
- **The pointer variable.** `lib/jelly/pointer-vars.ts` writes `--px` / `--py` (pointer position as a
  percentage of the host) on the one hovered host, and `--jelly-s` (its larger side in px) on it and the
  soft-body hosts around it. On `(hover: none)` it attaches `pointerdown` only and takes one rect read for
  the pressed host. It runs on the shared frame driver and the shared pointer hub; it never writes `<html>`.
- **The bound is in CSS.** Each pose's delta is capped at `min(configured pose, edge reach / --jelly-s)`,
  so a host's edge never travels more than `MOTION_BOUNDS.maxEdgeTravelPx` (4 px) including the release
  overshoot, and the scale never changes more than `maxScaleDelta` (3 %). Until `--jelly-s` is written, hosts
  assume 1000 px (bodies 3840 px). `spring-curves.test.ts` sweeps the bound for sizes 100 to 3840.
- **Scope.** Off native-material routes and while a game is in play; the app tier's high
  contrast keeps the press, plain (critically damped both ways, no hover). A CSS transition does not carry
  velocity across an interruption; the design accepts that.

`MOTION_BOUNDS` (`tiers.ts`): an edge moves ≤ 4 px, a scale changes ≤ 3 %, a click arc nudges the struck
hosts ≤ `nudgePx` (1.5 px, `translate`, `lib/jelly/arcs/nudge.ts`). **Layout — box sizes and document flow —
never changes.** Hit areas never move.

### 3.1 Press is a lit dot (#989)

A press squashes the host on the press spring and shows a **light dot** (`--gel-specular`) and a plasma
brightening under the pointer, both radial gradients at `--px` / `--py`. This replaced the shader lens: there
is no displacement map, no SVG filter on the host and no refraction of content beneath the pointer. No stylesheet
sets a `filter:` on a jelly body (the one `filter` in the jelly sheets is the rim layer's own, on its own pseudo-element,
§1.2), and nothing under `lib/jelly` or `lib/liquid` writes `style.filter` (`jelly-contract.test.ts`).

### 3.2 Flat controls and room (2026-11-03)

**Flat controls** (`data-jelly-rest="flat"`, set by `<Button>` for every variant except `signal`, `destructive`,
`danger` and `warning`): at rest a flat control is its label on the ground (no fill, no border). In print
it gets a solid edge instead (`app/liquid-glass.css`).

**Room.** The silhouette that needed 16 px of unclipped room round every body is gone; the 16 px (`--jelly-margin`)
stays a layout rule (§10) so the squash, the arc nudge and the focus ring are never cut off.

## 4. Arcs and the photosensitivity ledger (R9, R10, R13)

`lib/jelly/arcs/` draws arcs on one Canvas2D `.jelly-arc-layer` appended to `<body>` (never React-rendered, not
WebGL): seeded midpoint-displacement bolts with ≤ 3 branches, a glow stroke under the core, an impact (a flash disc,
specular streaks, a clipped shock ring and rim light on each struck host), the bolt refracted a few px into each
gel with an R/G/B split (`dispersion.ts`, `refraction.ts`), 1–3 re-strikes and an afterglow. Its frame driver
(`ARC_FRAME_ORDER` = 30) is awake only while an arc or afterglow is alive (≤ ~420 ms).

- **Installed on a press.** `lib/jelly/arc-lazy.ts` adds one `pointerdown` subscription through the shared hub.
  The first press that passes the gates dynamically imports `@/lib/jelly/arcs`, installs the click-only runtime
  (`installElectricArcs(document, { ambient: false })`) and replays that press; the runtime and its registry are
  disposed `IDLE_MS` (10 s) after the last click. Nothing exists at rest and the chunk is not fetched until a press.
- **Click** (`clicks.ts`) — `pointerdown` from the pointer hub plus one capture `click` on the document (keyboard
  activation has no pointer event). A press discharges 1–3 bolts (3 fine / 2 coarse / 1 handheld, `clickBolts`) to the
  nearest neighbours within 180 px, or a rim fizz when nothing is in range; a keyboard activation strikes one dim arc;
  focus moves never arc. Disabled, editable and opted-out targets arc nothing.
- **Never**: an endpoint inside a field (`.glass-inset`, inputs), an overlay or a toast, a field with focus or the
  element under the caret; arcs while the radial hub is open or an eversion is running; on native-material routes.
- **Flash ledger** (`ledger.ts`, WCAG 2.3.1) — **one site-wide ledger**, ≤ 3 onsets in any 1000 ms window
  (`FLASH_LEDGER`), shared by click, fizz, discharge and API arcs. A 20-clicks-per-second storm still produces at
  most 3 flashes per second; callers degrade by dropping re-strikes, then extra bolts, then the bolt, and keep the
  press flare. On top of the ledger, `flash-budget.ts` caps the **combined** additive coverage at any pixel (the impact
  disc, streaks, ring, rim light, contact glow) and the per-frame lit area, so no stack of layers can exceed the
  `FLASH_LUMINANCE` bound. Light themes composite with `source-over` (no white flash).
- **Public API** (`@/lib/jelly/arcs`) — `dischargeAt(x, y)` and `strike(a, b)`; both pass every gate and the ledger
  and return `false` while arcs are off or not installed. `ensureClickArcs()` (`arc-lazy.ts`) installs the runtime
  for a caller with no press (the `/jelly` lab's button).

### 4.1 Charge and hops (#989)

Every body carries a charge `q` in 0..1 that decays with `CHARGE.decayMs` (1.5 s). A click deposits
`CHARGE.clickCharge` on its body (`charge:pulse` on the bus) and the charge **hops** to the nearest neighbour in reach
with `CHARGE.hopFraction` (half) of it, and on from there while the hop charge is at least `CHARGE.minHopCharge`. A hop
waits `ringDelayMs` (distance / `CHARGE.pulseSpeedPxS`) and then strikes through the ledger, so the number of hop arcs
drawn is never more than the ledger admitted. The laws are pure functions in `lib/jelly/arcs/charge.ts`; the controller
is `field.ts`, on `setTimeout`, never a frame.

The runtime and these modules still carry **breakdown strikes**, **Coulomb attraction** and an **ambient scheduler**
(`scheduler.ts`, the `breakdown` / `attract` paths of `field.ts`), switched on by `ambient: true`. Nothing installs
it that way; they are unreachable in production and are the next thing to cut, with `runtime.ts` and its tests.

## 5. Budgets per tier (R6)

From `JELLY_BUDGETS` in `lib/jelly/tiers.ts` (the tests read the constants, never this table). A budget now
carries only what something reads: the globe's clock, the click arcs, and `refractHosts` (§1.2).

| Tier                                   | Clock / idle | Ambient arcs (installer passes `ambient: false`) | Click bolts | Rim-refracting hosts |
| -------------------------------------- | ------------ | ------------------------------------------------ | ----------- | -------------------- |
| `full` (fine pointer)                  | 60 / 15 Hz   | ≥ 2 s apart                                      | 3           | 0 (measured: 24)     |
| `coarse`                               | 60 / 15 Hz   | ≥ 2 s apart                                      | 2           | 0 (measured: 12)     |
| `handheld` (coarse, ≤ 1024 px)         | 30 / 7 Hz    | ≥ 4 s apart                                      | 1           | 0                    |
| `off` (degraded)                       | 0            | off                                              | 0           | 0                    |
| game playing (`html[data-game-state]`) | 0            | off                                              | 0           | 0                    |

(The rim, haze-slot, carrier, animated-area, body and lattice budgets went with the glass engine, the CSS carriers
and the soft-body physics.) The scene feed has its own per-tier policy, `SCENE_POLICY` (`scene.ts`): handheld and
`off` take no picture, so a handheld has no rim layers (its `refractHosts` is 0 to match).

**There is no software-rendering tier (2026-11-08).** The `lite` tier and the `perf-lite` class it was stamped with
(2026-10-29) are gone: a browser with hardware acceleration off, a blocklisted GPU or a VM gets the same material as any
other (woken haze, soft body, click arcs). `jellyTier()` never returns `'lite'` and nothing sets a class on `<html>` for
device weakness; `lib/__tests__/no-perf-lite.test.ts` fails if the name comes back. What survives is a capability read
that the material never consults (`lib/low-end.ts`): games, the app tier, RUM and the eversion's mesh tier ask
`isLowEndCapability()`, and the liquid globe keeps its CSS glass (no second GL context) for a remembered software
renderer. `Providers` settles that finding once per load at idle, on every route (`hooks/useSoftRenderSettle.ts` →
`settleSoftRender()`: the throwaway-context probe the games use, `lib/render/probe.ts`, cached in `localStorage` as
`rmh-soft-render` for 12 h); the jelly mount hook never probes. The radial shell does not start the page snapshot feed
for it, since the CSS globe refracts nothing.

Ambient bounds (`AMBIENT_BOUNDS`): drift ≤ 12 px/s, feature size ≥ 120 px, luminance period ≥ 6 s, no luminance
modulation above 3 Hz; ambient motion never moves a host's position.

## 6. Degradation matrix

`jellyMode()` in `tiers.ts` folds the tier, the off predicate, both preferences and game state into
`{ambient, arcs}` for the globe and the arcs. The CSS material reads the same signals through selectors.

| Condition                                                           | Woken haze            | Soft body (CSS) | Click arcs         | Globe clock | CSS             |
| ------------------------------------------------------------------- | --------------------- | --------------- | ------------------ | ----------- | --------------- |
| `lively` (default)                                                  | on hover / focus      | full            | per `electricArcs` | 60 / 15 Hz  | floor + rim     |
| `calm`                                                              | 0.4× speed, 0.55× amp | full            | clicks (or off)    | ≤ 12 Hz     | floor + rim     |
| `still`                                                             | no                    | reactive        | off (forced)       | 0           | floor + rim     |
| app tier high contrast                                              | no                    | plain press     | off                | 0           | opaque surfaces |
| print                                                               | no                    | none            | off                | 0           | flat            |
| hidden tab                                                          | —                     | —               | off, layer cleared | 0           | —               |
| game playing                                                        | paused                | none            | off                | 0           | —               |
| `[data-jelly-zone="playfield"]`, `[data-jelly-scope="off"]` subtree | no                    | none            | none               | —           | —               |
| native-material route (`/games*`, `/tf2*`)                          | no                    | none            | none               | —           | own scheme      |

Per-element opt-outs (`OPT_OUT_SELECTOR`): `data-jelly="off"` and the accepted aliases `data-liquid-material="off"`,
`data-liquid-glass="off"`, `data-liquid-motion="off"`, `data-fluid-press="off|none"`; `data-jelly-flow="off"` also
removes the woken haze from one host. Do not branch on any of these conditions in a component.

## 7. Preferences and WCAG 2.2.2 (R8, R9)

Ambient animation is controlled separately from direct interaction:

- **`jellyMotion`: `lively` | `calm` | `still`** (default `lively`) in Settings → Appearance, stamped pre-paint as
  `html[data-jelly-motion]` (absent = `lively`). `still` removes the woken haze and the globe's clock; direct hover,
  press and scroll reactions stay (they are CSS springs).
- **`electricArcs`: `full` | `clicks` | `off`** (default `full`), stamped as `html[data-electric-arcs]`. `full` and
  `clicks` are the same thing now (ambient arcs no longer exist); `still` forces arcs off whatever this says.

Both are account fields with a localStorage cache for signed-out visitors. Neither reads the OS
`prefers-reduced-motion`: the retired site-wide motion setting stays retired (CLAUDE.md §7); these are **material**
controls. Every jelly layer is `aria-hidden`, `pointer-events: none`, never focusable and never announced. Tab order
and hit areas never change. The focus ring is `--focus-ring`: solid, 2 px, never the plasma glow. Plasma, haze, arcs
are decoration and never the only carrier of state; text holds 4.5:1 on gel, over haze and over woken plasma in every
theme (`jelly-legibility.test.ts`).

## 8. Ownership

| File                                                                        | Owns                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `app/jelly-material.css` · `app/liquid-glass.css`                           | the material: tint, gel coat, static rim, haze floor, woken haze (§3b), degradation, the CSS soft body (§8, §8b)                                                                                                                                                                   |
| `app/jelly-coverage.css` · `app/jelly-arcs.css`                             | coverage adapters (tab thumb, switch, slider, skeleton, toasts, bare `[data-jelly]`), the arc layer                                                                                                                                                                                |
| `components/shared/app-theme.css`                                           | the `--app-jelly-*` adapter for `.app-glass` and the app tier's cards                                                                                                                                                                                                              |
| `lib/jelly/tiers.ts`                                                        | the single shared policy: tiers, budgets, `jellyMode`, off predicate, selectors, bounds, flash ledger, `PLASMA`, `CHARGE`, `JELLY_LAYOUT`                                                                                                                                          |
| `lib/jelly/soft-policy.ts` · `spring-curves.ts`                             | the soft body's numbers (`SOFT_BODY`, `CSS_SPRINGS`, `CSS_SOFT_BODY`, the size cap) and the `linear()` sampler for the `--spring-*` tokens                                                                                                                                         |
| `lib/jelly/pointer-vars.ts`                                                 | the pointer variable: `--px`, `--py`, `--jelly-s`                                                                                                                                                                                                                                  |
| `lib/jelly/frame.ts`                                                        | **the one `requestAnimationFrame`** under `lib/jelly/`: every service registers a driver with `drive(fn, { order })`                                                                                                                                                               |
| `lib/jelly/pointer.ts`                                                      | **the one window pointer listener set**, fanned out with `onJellyPointer(type, fn)`                                                                                                                                                                                                |
| `lib/jelly/arc-lazy.ts` · `lib/jelly/arcs/*`                                | the lazy installer; arcs, charge, hops, impact, the ledger and flash caps; `renderer.ts` is a frame driver (order 30)                                                                                                                                                              |
| `lib/jelly/refract/*` · `app/jelly-refract.css`                             | refractive glass (§1.2): the rim map and size classes, snapshot placement, shared SVG filters, the snapshot as a blob URL, one host's layer, the service                                                                                                                           |
| `lib/jelly/registry.ts` · `bus.ts`                                          | the observers over every jelly host (installed by the arcs and by the refraction service, refcounted) · the typed event bus (`arc:strike`, `drag:*`, `charge:pulse`, `charge:attract`)                                                                                             |
| `lib/jelly/drag-report.ts` · `hooks/useFluidDrag.ts`                        | the drag owners' report on the bus; the hook owns the drag position and its settle spring                                                                                                                                                                                          |
| `lib/jelly/ambient-tick.ts`                                                 | the tick grid the globe and its worker share                                                                                                                                                                                                                                       |
| `lib/liquid/glass/scene.ts` · `scene-feed.ts` · `scene-store.ts`            | the page picture for the globe and the rim layers: capture, the refcounted feed, the store (a picture also records the document's height and where `<body>` sat); `RadialShell` holds the feed for the shell's life, and so does the refraction service while anything may refract |
| `lib/liquid/glass/{policy,color,jelly-glsl}.ts` · `lib/liquid/optics.ts`    | what the globe still imports: `innerRadius`, `PLASMA_LOOK`; the colour parser; the noise GLSL; the N-BK7 optics                                                                                                                                                                    |
| `components/radial/{LiquidGlobe,globe-worker,jelly-glass,globe-engagement}` | the liquid globe (its dough simulation `lib/dough.ts`, its own coat and shader, its worker)                                                                                                                                                                                        |
| `hooks/useLiquidInteractions.ts`                                            | mounts the pointer variable at once, then `installLazyClickArcs` and (a lazily imported chunk) `installRefraction` after `load` + idle; one teardown                                                                                                                               |
| `app/routes/jelly.tsx`                                                      | the `/jelly` material lab (`/liquid-glass` redirects there)                                                                                                                                                                                                                        |

Exactly **one** jelly frame owner exists, `lib/jelly/frame.ts`; the pointer variable, the arc renderer and the
drag-settle spring are drivers on it (§8.1). **Components never import the arc service** (the lab is the one
exception) and never add their own pointer loop, deformation or arc code; they take jelly through role classes and
`data-jelly*` attributes. The globe keeps its name, its dough simulation (`lib/dough.ts`) and its own coat
(`components/radial/jelly-glass.ts`, "the globe's jelly coat" — unrelated to `lib/jelly/`; drawn in the globe's worker
on a transferred `OffscreenCanvas`, with the CSS glass as the fallback); it shares the plasma palette only through
tokens (R15). That coat draws the material's layers itself — haze, dormant plasma, the RGB-led rim and Fresnel edge —
clipped to the sphere, so no globe element may ever be a rectangular host: `GLOBE_SELECTOR` in `lib/jelly/tiers.ts` is
part of `OPT_OUT_SELECTOR` and of the registry's excludes, and click arcs never take a press on the globe
(`lib/jelly/__tests__/globe-exclusion.test.ts`). The coat's private "drawn" flag is `data-globe-coat` (`entering` while
it fades in over the CSS glass, `on` once it has), never `data-jelly` (a `data-jelly` stage was the square plasma
outline of 2026-10-23).

Retained from the liquid-glass contract, unchanged: the snapshot lifecycle (`scene.ts`: 260 ms coalescing, ≥ 1.5 s
spacing, idle-time capture, no capture while scrolling / hidden / under the open globe), and the N-BK7 optics. See
[`liquid-glass-system.md`](liquid-glass-system.md) for that history.

### 8.1 One frame driver, one pointer hub

**`lib/jelly/frame.ts`** owns the only `requestAnimationFrame` under `lib/jelly/` and `lib/liquid/`. A service
registers once — `const d = drive((now, dt) => …, { order })` — and calls `d.wake()` when something starts to move. A
driver runs on the next frame only while it is awake; returning `true` keeps it awake, anything else lets it sleep.
**When no driver is awake no frame is requested at all**, so the page at rest pays nothing. Drivers run in ascending
`order` (`useFluidDrag` 5 → pointer variable 25 → arcs 30). `stop()` unregisters and cancels a pending frame nobody else
needs; one driver throwing is reported asynchronously and never stops the others.

**`lib/jelly/pointer.ts`** owns the only window/document `pointer*` listeners under `lib/jelly/` and `lib/liquid/`: one
capture-phase, passive listener per type, installed with the first subscriber (`onJellyPointer(type, fn)`) and removed
with the last (refcounted). A throwing handler is isolated from the rest. Handlers never read layout per event and never
call `preventDefault`.

Both are gated by `jelly-ownership.test.ts` (N2 b), `frame-owners.test.ts` and `raf-loop-allowlist.test.ts`, and
unit-tested in `lib/jelly/__tests__/{frame,pointer}.test.ts`.

## 9. Validation

| Proves                                   | Where                                                                                                                                                                           |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| tiers, budgets, `jellyMode`, bounds      | `lib/jelly/__tests__/tiers.test.ts`, `lib/__tests__/jelly-contract.test.ts`                                                                                                     |
| tokens mirror the constants (§10)        | `lib/__tests__/jelly-tokens.test.ts`; the spring literals in `jelly-spring-tokens.test.ts`                                                                                      |
| one frame, one pointer hub (§8.1)        | `lib/jelly/__tests__/{frame,pointer}.test.ts`, `lib/liquid/__tests__/frame-owners.test.ts`, `lib/__tests__/jelly-ownership.test.ts` (N2 b)                                      |
| never fake a law (§10)                   | `lib/__tests__/jelly-contract.test.ts` (springs only on `--spring-*`, no keyframes but the haze drift, no `filter:` in jelly CSS)                                               |
| the CSS soft body                        | `lib/__tests__/jelly-soft-body.test.ts`, `lib/jelly/__tests__/{spring-curves,pointer-vars}.test.ts`                                                                             |
| the woken haze                           | `lib/__tests__/jelly-woken-haze.test.ts`, `site-infinite-animation.test.ts` (N3, N12)                                                                                           |
| arcs, the ledger and the lazy installer  | `lib/jelly/arcs/__tests__/*`, `lib/jelly/__tests__/arc-lazy.test.ts`; in a browser, `testing/e2e/jelly-interaction.mjs` (the blocking `jelly-e2e` CI job)                       |
| the scene feed                           | `lib/liquid/glass/__tests__/{scene,scene-feed}.test.ts`                                                                                                                         |
| legibility over haze                     | `lib/__tests__/jelly-legibility.test.ts`                                                                                                                                        |
| preferences pipeline                     | `lib/__tests__/appearance-jelly-motion.test.ts`, `appearance-electric-arcs.test.ts`, `fouc-contract.test.ts`                                                                    |
| frame loops, filters, stacking, backdrop | `lib/__tests__/{raf-loop-allowlist,filter-cost-budget,stacking-consistency,static-backdrop,handheld-tier}.test.ts` and the jelly gates listed in `scripts/check-consistency.sh` |
| rest and engaged frame rates             | `testing/e2e/frame-budget.mjs` (rest ≤ the idle floor + 1 fps, no unsanctioned perpetual animation)                                                                             |

Browser review (the part no script checks): `/`, a feed page, settings, an app and a game; Daylight and Midnight; phone and
desktop width; `jellyMotion` lively, calm and still; `electricArcs` off. Confirm nothing changed **layout**, nothing moved
more than the bound, and the page at rest runs no animation.

## 10. Layout, identity and tokens (#989)

**Layout.** Bodies sit at least `--space-4` (16 px, `JELLY_LAYOUT.minGapPx`) apart. Leave `--jelly-margin` (16 px,
`JELLY_LAYOUT.marginPx`) **unclipped** round every body — the squash, the arc nudge and the focus ring need it — so
there is no `overflow: hidden` directly around one. Cards use `--site-radius`, controls `--site-radius-sm`. Game
play-fields are `data-jelly-zone="playfield"` (excluded); the woken haze and arcs stop while a game is playing.

**Identity.** Silent, sleek, frontier AI: calm, never busy. One electric accent (`--site-accent`), which is also the
plasma colour; no gradients on the ground, no neon or glowing type, no sci-fi illustration. Text is Geist, data Geist
Mono, through the `--site-font-*` tokens. **One signal action per view:** the primary action is
`<Button variant="signal">`, ink gel (`--gel-ink` with `--on-ink` text); everything else on that view is a quieter
variant.

**Never fake a law.** No keyframe wobble, `@keyframes` glow, ripple, untriggered flicker or second spring formula; a
moving property may transition only on a generated `--spring-*` curve (through the `--jelly-spring-*` hooks); the only
sanctioned keyframes in the jelly sheets is the haze drift (`jelly-drift`), run by the woken haze;
no stylesheet sets a `filter:` on a jelly body. `jelly-contract.test.ts` scans the jelly sheets for all of it.

**Tokens.** The CSS tokens mirror the constants; `lib/__tests__/jelly-tokens.test.ts` keeps each pair equal. Change the
constant and the token together.

| Token            | Constant (`lib/jelly/tiers.ts`) | Value | Used by                                     |
| ---------------- | ------------------------------- | ----- | ------------------------------------------- |
| `--plasma-wake`  | `PLASMA.wake`                   | 0.35  | the plasma wake on hover                    |
| `--space-4`      | `JELLY_LAYOUT.minGapPx`         | 16 px | minimum gap between bodies                  |
| `--jelly-margin` | `JELLY_LAYOUT.marginPx`         | 16 px | unclipped margin round a body (layout rule) |

The soft body's poses and springs are mirrored from `lib/jelly/soft-policy.ts` (`--jelly-hover-plump`,
`--jelly-hover-dent`, `--jelly-press-card`, `--jelly-press-control`, `--jelly-edge-reach`, the `--spring-*` curves and
durations) and pinned by `jelly-soft-body.test.ts` and `jelly-spring-tokens.test.ts`.

Colour and material tokens with no numeric constant are per theme in `app/globals.css` and zeroed or made opaque by the
app tier's high contrast: `--gel-body`, `--gel-depth`, `--gel-ink`, `--on-ink`, `--gel-bevel`, `--gel-disperse-r`,
`--gel-disperse-g`, `--gel-disperse-b`, `--gel-fresnel`, `--gel-specular` and `--focus-ring`. The RGB split colours are
`--gel-edge-r/-g/-b` (CSS may not use raw colours), composed with the Fresnel line into `--gel-edge` (three inset shadows
plus the 1 px Fresnel) for the coverage tier and into the single `--gel-glow` for the role classes. Tailwind exposes
`--color-gel-ink`, `--color-on-ink` and `--color-focus-ring` (`bg-gel-ink`, `text-on-ink`, …). Inside `.app-theme` the app
tier maps `--gel-*` and `--focus-ring` to `--app-gel-*` / `--app-focus-ring`. The gel body is a vertical `--gel-body` →
`--gel-depth` gradient, so no gloss crosses the face.
