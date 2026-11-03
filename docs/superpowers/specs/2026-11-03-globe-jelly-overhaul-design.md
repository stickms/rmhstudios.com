# Globe-style soft bodies across the main site — design

Status: draft for approval · 2026-11-03 · Scope: main-site tier (`_site/` shell, `PageLayout`, `components/ui/`)

## Intent

The liquid globe is the most alive thing on the site: a body that bulges toward the hand, sags under a press and
wobbles back. The rest of the site only twitches (a rim shader and ≤4px of squash). The owner wants every surface on
the main site to move and look like the globe — clearly bulging and sagging, still 3D, smooth everywhere: no outlines,
no hard borders, no sharp edges. Posts become long rounded slabs. Buttons and navigation sit flat on the background
like the mobile icon buttons under the open globe, and only grow a body when touched.

## Goals

1. Direction **C** (chosen from live mockups): **containers are slabs, controls are flat.**
   - Always-visible slabs: posts and cards, panels, text fields, dropdown/popover menus, dialogs and sheets, the one ink primary
     action per view.
   - Flat on the ground, body admitted only while hovered, pressed or dragged: buttons, icon buttons, nav items, tab
     strips, dropdown rows (hover = soft glow behind the text, as today), toggles.
2. Deformation is **clearly visible**: the silhouette bulges toward the pointer, sags under a press (a dent with a
   light dot on its far slope, far side swells), leans toward the hand, and wobbles to rest. Mockup magnitudes
   (the "Clear" setting): bulge ≈10px, press sag ≈18px, lean ≤9px on a 308px-wide card. **These are the designer's
   proposal, not agreed numbers**; they live in one constants block so they can be tuned in review.
3. The silhouette is **filled by the same material as the globe** (`lib/liquid/globe-material.ts` environment and
   specular, the lens/dispersion work already shared with it), so it reads as one family of object.
4. **Nothing is ever clipped** by a parent container, anywhere on the main site (see Clipping).
5. **Full main-site coverage**: every page under the radial shell, every `components/ui/` primitive, and every feature
   component that renders a surface or control on those pages.
6. **Smooth across aspect ratios and browsers** (phone portrait/landscape, tablet, desktop, ultrawide; Chromium,
   Firefox, Safari incl. iOS) and **maximal FPS**.

## Non-goals

- Games and the full-screen app tier (`--app-*`, `AppShell`) keep their own schemes — existing repo rule. *Assumption
  made by the designer; confirm on review.*
- No change to the globe itself, its dough simulation (`lib/dough.ts`) or its coat.
- No layout reflow from motion: hit areas never move and neighbours' layout never changes. Bodies bulge into reserved
  room; they do not push content.
- No new setting. The existing `jellyMotion` (Lively/Calm/Still) and `electricArcs` switches remain the controls; the
  retired reduced-motion setting does not return.

## Anti-goals (a failure even if it technically works)

- A bulge that is cut off by any ancestor, even rarely.
- Any visible outline, hairline, border or hard edge on a slab. (The molded-rim approach already forbids them; the
  1px Fresnel line stays only in the fallback tiers.)
- Busy, noisy or glowing UI: identity stays "silent, sleek, frontier AI"; one electric accent.
- Frame drops while scrolling or while several bodies move.
- Per-component pointer loops, `backdrop-filter` in any glass role, full-viewport fixed layers (iOS Safari bands),
  `infinite` keyframes, root custom-property writes per frame — all stay banned.

## Constraints (and which ones this work must change)

Stay: one frame driver (`lib/jelly/frame.ts`), one pointer fan-out, rim/haze drawn in a worker on `OffscreenCanvas`,
rect reads only on scroll/resize/activation, tier degradation (`perf-lite` etc.) handled centrally in
`lib/jelly/tiers.ts`, components take jelly only through role classes and `data-jelly*` attributes, `perf-lite` renders
opaque slabs with press feedback, text keeps 4.5:1 on gel in every theme (test Daylight and graphite).

**Must be rewritten in the same commits, with docs and tests** (repo rule: change the rule, say so):
- `MOTION_BOUNDS` (4px / 3% / nudge 1.5px) → new bounds sized for the bulge, still bounded and tokenised.
- Lattice outward/inward caps (2px / 10px) and the 8-node lattice → denser lattice; `LATTICE_GLSL` assumes exactly 8
  nodes.
- "Layout never changes: hosts squash within 4px/3%" in `CLAUDE.md`, `components/CLAUDE.md`,
  `docs/plasmatic-jelly-system.md`, `design.md`, and the tests that pin them (`jelly-contract`, `jelly-tokens`,
  `soft-policy`, `lattice`, `envelope`, `tiers`).
- `--jelly-margin` (16px) becomes the *guaranteed* unclipped room, not a hope.

## Approaches considered

1. **Evolve the current engine — chosen.** Raise and re-derive the bounds; replace the 8-node lattice with a denser
   dough-style perimeter lattice; draw the whole silhouette (fill, molded shading) in the existing rim shader instead
   of leaving the fill to CSS `background`; admit transient bodies for flat controls; reuse budgets, tiers, worker,
   policy and gates. Trade-off: the rim-slab budget stays (24 desktop, fewer on phones), so surplus surfaces fall back
   to the cheap carrier path, and the existing deformation tests must be redone.
2. **One site-wide GPU layer running the literal globe shader — rejected.** Uniform and frugal on paper, but it needs a
   full-viewport fixed layer (the iOS Safari edge-band problem the repo has already been bitten by), lags content
   during scroll, and is a near-total rewrite of the engine and its test contracts.
3. CSS/SVG `clip-path` morphing — dropped: no real 3D lighting, no shared material.

## Clipping — how "never clipped" is guaranteed

Measured: ~380 `overflow-hidden` uses in TSX and ~225 `overflow: hidden|clip` rules in CSS; scroll containers clip by
definition. Removing them is not an option (image rounding, truncation). Two layers, both required:

1. **Fix the layouts (owner decision).** Every place where a slab or an admitted-on-touch control sits within
   `--jelly-margin` (16px) of a clipping ancestor edge gets that room: padding on the clipping container, or the clip
   moved to an inner wrapper around the content that really needs clipping, or `overflow: clip` where the surface is
   not a scroller. Some layouts will shift by up to ~16px; this is accepted. Prefer one shared utility
   (`.jelly-room` or equivalent) over per-page numbers.
2. **Catch regressions.** (a) A static gate in `lib/__tests__/` that walks the DOM of rendered primitives/routes (or
   scans classes) for a jelly host with an ancestor that clips and less than the margin of room, with a
   one-directional allowlist like the other gates; (b) `pnpm audit:pages` gains a real-browser sweep that measures
   rim-canvas bounds against every clipping ancestor at several viewport sizes.

3. **Runtime room-cap — required, not optional.** At activation (never per frame, like `roomFor`) measure the room
   each host has on each side to its nearest clipping ancestor *and to the viewport edge*, and cap outward travel on a
   side that lacks it. A missed layout then shows a flat side, never a cut-off bulge. This is also what makes
   viewport-pinned surfaces legal (see below).

## Design details decided so far

- **Rim canvas** extends its overdraw margin to cover the bulge (≥16px) on all sides; it remains the host's last
  child at `z-index: -2` in an isolated stacking context, so no `fixed` inside hosts and no
  `:first-child/:last-child` rules (unchanged).
- **Flat controls**: at rest no canvas, no carrier, no budget cost; hover/press/drag admits a body from the shared
  budget (bodies ≤ 12 desktop, hard cap 24) and releases it a beat after the body sleeps. The ink primary is a
  permanent slab (counts against the budget).
- **Dropdowns**: one rounded slab, plain rows, soft glow behind the hovered row; the trigger is a flat control.
- **Content follows the gel** by a bounded fraction (token), hit areas never move.
- **Idle**: ambient clock 60 Hz engaged, 30 Hz floor, 0 hidden/unseen/Still — unchanged. Idle sag/swell is ambient
  haze-scale motion, not host movement.
- **Degradation**: `perf-lite`, print, and Jelly motion `Still` keep working through `tiers.ts`; the Still setting
  stops ambient motion but not direct hover/press response.

## Verification expected (builder to plan)

- `pnpm check:consistency` on every commit; `pnpm test`; updated jelly contract tests.
- `pnpm audit:pages` extended for clipping and for iOS edge contracts (unchanged invariants).
- Real-browser visual pass: Daylight + graphite, motion Lively and Still, widths 360 / 768 / 1280 / 2560 plus
  landscape phone, Chromium + Firefox + WebKit (Playwright Chromium is pre-installed; Firefox/WebKit availability in the
  build environment is unverified).
- Frame-time measurement: target ≥55 fps median / no frame >32 ms while scrolling the feed on desktop with the full
  slab budget; ≥30 fps handheld. *Targets are the designer's proposal.* The existing governor and `synthetic-perf`
  workflow are the measuring points.

## Left to the builder

Node count and exact spring constants; where exactly the silhouette fill moves between CSS and shader per role;
the `.jelly-room` mechanism and the order in which pages are fixed; the clipping gate's implementation; migration order (engine first, then primitives, then page sweeps); how the PR is split.

## Settled after the builder check (all designer calls — check these)

- **Magnitudes.** The mockup's "Clear" setting is the target (bulge ≈10px, press sag ≈18px, lean ≤9px on a 308px
  card), scaled by the smaller body dimension and tuned in review from one constants block. A *sag* moves the
  silhouette inward, so it needs no outside room. **Total outward travel on any side (bulge + lean + far-side swell)
  is capped at `--jelly-margin`.** The margin stays 16px unless tuning proves it must rise (then the token and the
  layout fix rise together, to at most 24px).
- **Content follows the gel** by the existing `--jelly-content-strain` (4%) only, so text barely moves and the 4.5:1
  contrast guarantees hold. **Hit areas stay the host's box**; gel drawn outside the box does not take events.
- **Neighbours.** Bodies never overlap: a host's outward travel toward a neighbour is capped at half the measured gap
  to it (same activation-time measure as `roomFor`; gap ≥16px so ≥8px each). Neighbour nudge stays tiny; no body
  draws over another.
- **Coverage acceptance.** Routes are enumerated from the route tree: every page under `_site/`, the radial shell and
  its chrome, every `components/ui/` primitive. The static clipping gate starts with an **empty** allowlist for
  `ui/` and the shell, and an allowlist for feature pages that shrinks to empty by the end of the work; a page can
  be deferred only by an allowlist entry that a failing test later forces out. The iOS edge-pinned layers and the
  sticky/fixed top bar are unchanged by this work (the iOS contract stays as is).
- **Budget.** Admission is by visibility (a phone shows a few posts at a time; off-screen surfaces cost nothing) with
  roles first, then proximity to the viewport centre. A surface over budget renders as the identical shaded slab
  without live deformation; **a surface the pointer touches is always promoted** into the body budget. Over-budget
  slabs must be visually indistinguishable at rest from budgeted ones.
- **Tiers.** Under Jelly motion `Still`, hover and press still bulge/sag (direct reaction), ambient motion stops.
  Under `perf-lite`/print the shader is off: opaque slabs with the old small squash only, no large sag.
- **Shared shading.** `lib/liquid/globe-material.ts` is already a GLSL string constant, so the rim shader imports it
  into the worker program; one copy of the math, no duplicate.
- **Viewport-pinned surfaces** (bottom sheets, edge dialogs): they float off the edge per the iOS contract where they
  can; where flush, the runtime room-cap gives them a flat edge side and full deformation on the others. No exemption
  from the rule — the cap enforces it.
- **Browsers.** Chromium is verified in this environment. Firefox and WebKit are not available here: the PR states
  that plainly and carries a manual checklist for the owner's devices (worker `OffscreenCanvas` WebGL2, the
  one-GPU-round-trip path, iOS edge bands) instead of claiming they were tested.
- **Scope and tuning.** Games and full-screen apps out of scope; dialogs/sheets are slabs; toggles and tab strips
  are flat controls; flat controls cost nothing at rest; FPS targets as above.
