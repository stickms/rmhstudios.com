# Globe-style soft bodies — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task.
> Steps use checkbox syntax. One PR per task group; merge each after CI is green.

**Goal:** Make main-site slabs bulge, sag and wobble like the liquid globe, with flat-until-touched controls, and never clip a bulge.

**Architecture:** Keep the jelly engine. Generalise the 8-node rim lattice to 24 nodes with per-node room caps; let the rim shader warp the *whole* signed-distance field and paint the gel fill itself (CSS background steps aside via `data-jelly-gel="on"`); flat controls are admitted as slabs only while touched; clipping is prevented by activation-time room measurement plus a layout sweep gated by a test.

**Tech Stack:** TypeScript, WebGL2 GLSL ES 3.00 (worker `OffscreenCanvas`), Vitest, Tailwind v4 + `app/*.css`, Playwright (pre-installed Chromium).

**Spec:** `docs/superpowers/specs/2026-11-03-globe-jelly-overhaul-design.md`

## Global Constraints

- Host affine stays within `MOTION_BOUNDS` (4px / 3%); content follows gel by `--jelly-content-strain` 4% only. The *silhouette* (canvas) is what bulges.
- Total outward silhouette travel on any side ≤ `JELLY_LAYOUT.marginPx` (16px, `--jelly-margin`); sag is inward and needs no room.
- Targets: bulge ≈10px, press sag ≈18px, lean ≤9px on a 308px card; scaled by the short side (`min(1, short/180)`), one constants block `JELLY_BODY` in `lib/jelly/tiers.ts`.
- No `backdrop-filter`, no full-viewport fixed layer, no per-component pointer loops, no `infinite` keyframes, no box-shadow, no outlines/hairlines on slabs.
- Rect/room reads at activation, scroll, resize only — never per frame. Budgets in `JELLY_BUDGETS` unchanged (24 rims, 12 bodies desktop).
- Games and full-screen apps (`--app-*`, `.app-glass`) unchanged.
- Every commit passes `pnpm check:consistency`; any rule changed is changed in the same commit with docs.

## Review Focus

1. A card flush against a scroll container or the viewport edge: bulge on that side is capped to the available room, other sides unchanged (Task 3 test).
2. Two bodies 16px apart both hovered: they never overlap (cap = half gap) (Task 3 test).
3. Jelly motion `Still` / `perf-lite` / print: no ambient motion, no shader body fill, opaque slab, no large sag (Task 2 + 4 tests).
4. A 4000×60 or 40×40 body: lattice stable, caps scale with short side, no NaN (Task 1 test).
5. Over-budget or WebGL-less browser: host still shows a complete, opaque-correct CSS slab (body fill attribute only set when the shader draws it) (Task 2 test).

---

### Task 1: Body constants and a 24-node lattice (PR 1)

**Files:** Modify `lib/jelly/tiers.ts`, `lib/jelly/soft-policy.ts`, `lib/jelly/lattice.ts`, `lib/jelly/lattice-inputs.ts`; Test `lib/jelly/__tests__/lattice.test.ts`, `lattice-inputs.test.ts`, `soft-policy.test.ts`, `lib/__tests__/jelly-tokens.test.ts`.

**Interfaces:**
- Produces `JELLY_BODY = { bulgePx: 10, sagPx: 18, leanPx: 9, refShortSidePx: 180, nodes: 24 } as const` in `tiers.ts`.
- `LATTICE_NODES = 24` (was 8). `createLattice(spec: LatticeSpec & { room?: Readonly<{ top: number; right: number; bottom: number; left: number }> })` — nodes spaced evenly by arc length around the rect (clockwise from top-left); `Lattice.cap: Float64Array` per-node outward cap.
- `latticeCaps(bevel, amplitude, short = 180)` returns `{ outward, inward }` with `outward = min(JELLY_BODY.bulgePx · k, JELLY_LAYOUT.marginPx)`, `inward = JELLY_BODY.sagPx · k`, `k = amplitude · min(1, short / refShortSidePx)`.
- `latticeUniform(l, out?)` fills `Float32Array(LATTICE_NODES * 2)`, per-node outward soft-cap uses `l.cap[i]`.

- [ ] Step 1: failing tests — `createLattice({w:308,h:176,bevel:16})` has 24 nodes with unit normals and strictly increasing `s`; a hover at the top edge raises the nearest node's normal offset above 6px and never above `cap[i]`; a lattice with `room.top = 3` caps top-edge nodes at 3; a press sags ≥12px inward on a 308×176 body; `latticeCaps(16, 1, 40)` scales to `40/180`; 4000×60 and 40×40 bodies stay finite after 2s of stepping; sleeps to exact zero.
- [ ] Step 2: run `pnpm exec vitest run lib/jelly` — fails.
- [ ] Step 3: implement as above. Raise `LATTICE.hoverPx` to `JELLY_BODY.bulgePx` and make the press drive reach `sagPx`; keep `ka`/`zeta` (wobble ~1.2s). `SOFT_BODY.latticeOutwardPx`/`dentMaxPx` derive from `JELLY_BODY`.
- [ ] Step 4: tests pass; update `jelly-tokens.test.ts` for any new CSS token (`--jelly-bulge`, `--jelly-sag`) mirrored in `app/globals.css`.
- [ ] Step 5: commit.

### Task 2: Shader silhouette + gel body fill (PR 1)

**Files:** Modify `lib/liquid/glass/jelly-glsl.ts`, `shader.ts`, `renderer.ts`, `engine.ts`, `policy.ts` (`overdrawMargin`), `app/jelly-material.css`, `app/liquid-glass.css`; Test `lib/liquid/glass/__tests__/policy.test.ts`, `engine-layers.test.ts`, `jelly-policy.test.ts`.

**Interfaces:**
- `LATTICE_GLSL` declares `uniform vec2 uJelly[24]` and Catmull-Rom over 24 nodes by arc-length parameter.
- New uniforms `uBodyOn: float`, `uBody: vec4` (gel top colour+alpha), `uBodyDepth: vec4` (bottom). When `uBodyOn > 0.5` the lattice push is applied to the *entire* distance field (`sd -= push`, not rim-only), and the interior fills with the gel gradient (cheap early-out branch emits the fill, skipping lighting).
- `overdrawMargin(role, latticesAllowed)` returns `JELLY_LAYOUT.marginPx` for `fill | pane | control | inset | overlay | chrome` hosts that deform; `0` when no lattice may run.
- Engine sets `data-jelly-gel="on"` on the host only while the shader draws the body; CSS rule `[data-jelly-gel='on']` makes the host's own background transparent. Cleared when the slab leaves the budget, the tier degrades, or WebGL is lost.

- [ ] Step 1: failing tests — `overdrawMargin('fill', true) === 16`, `0` when disallowed; `LATTICE_GLSL` string declares 24 nodes; engine unit test (existing harness) sets/clears `data-jelly-gel` with admission and tier degrade; CSS contract test: `[data-jelly-gel='on']` rule exists and every other background rule is untouched under `:not([data-jelly-gel='on'])`.
- [ ] Step 2–4: implement; run `pnpm exec vitest run lib/liquid lib/jelly lib/__tests__/jelly-*.test.ts`.
- [ ] Step 5: render check in Chromium (`/jelly` demo route + a feed screenshot, SwiftShader WebGL) — rim, fill and bulge visible, no outline; record findings in the PR.
- [ ] Step 6: commit.

### Task 3: Room measurement (PR 2)

**Files:** Create `lib/jelly/room.ts`; Modify `lib/liquid/glass/engine.ts`; Test `lib/jelly/__tests__/room.test.ts`.

**Interfaces:**
- `export interface Sides { top: number; right: number; bottom: number; left: number }`
- `export function roomFromRects(host: Rect, clips: readonly Rect[], viewport: Rect, neighbours: readonly Rect[], margin: number): Sides` — per side `min(margin, distance to each clip edge, distance to viewport edge, gap/2 to each neighbour overlapping that side's span)`, floored at 0.
- `export function clippingAncestors(el: Element): Element[]` — ancestors whose computed overflow-x/y is not `visible`, or `contain: paint`.
- Engine calls these at activation/scroll/resize (cached with the rect read) and passes `room` into `createLattice`.

- [ ] Step 1: failing tests for `roomFromRects`: free host → all 16; clip edge 3px away → that side 3; viewport edge flush → 0; neighbour 16px away on the right → right 8; host larger than clip → 0; NaN/negative inputs → 0.
- [ ] Step 2–4: implement, wire, run tests. Commit.

### Task 4: Flat controls and tiers (PR 3)

**Files:** Modify `components/ui/button.tsx`, `icon-button.tsx`, `liquid-tabs.tsx`, `jelly-group.tsx`/`.css`, `menu.tsx`, `anchored-menu.css`, `app/jelly-coverage.css`, `lib/jelly/soft-policy.ts`, `lib/liquid/glass/engine.ts`; Test `components/ui/__tests__`, `lib/jelly/__tests__/soft-policy.test.ts`.

**Interfaces:**
- Role `control` (non-primary) hosts carry `data-jelly-rest="flat"`: at rest no rim canvas, carrier, or background (the mobile-globe-menu look); hover/press/focus-visible calls `admitTransient(host)` (engine, shares the body budget, released ~400ms after the lattice sleeps). `variant="signal"` (ink) stays a permanent slab.
- `perf-lite`/`Still`/print: `rest=flat` controls keep the old small squash only (no shader).

- [ ] Steps: policy tests (flat host admitted on hover, released after sleep, never over the 12-body cap; signal never flat); implement; visual check in Chromium both themes; commit.

### Task 5: Container shapes (PR 3)

Post cards, panels, dialogs, sheets, fields, menus use `--site-radius` 32px→44px for long cards via the existing radius token scale (`rounded-site`); verify `.glass-fill` role carries the body fill. Test: `design-consistency` gate still green; no hardcoded radii added.

### Task 6: Clipping sweep and gate (PR 4+)

**Files:** Create `lib/__tests__/jelly-clip-room.test.ts`, `scripts/audit-jelly-clip.mjs` (Playwright sweep over routes from the route tree at 360/768/1280/2560), utility `.jelly-room` in `app/jelly-coverage.css`; fix pages by route group (feed, profile, settings, library, apps landing, admin…).

- [ ] Gate: static scan of `components/` + `app/routes/` for a clipping class (`overflow-hidden|auto|clip`) wrapping a glass role without `.jelly-room`/padding ≥ 16px, with a one-directional allowlist that fails when an entry no longer violates (repo convention). Audit script: for each route, each `[data-liquid-canvas='on']` canvas rect inside its nearest clipping ancestor rect.
- [ ] Sweep by group, shrinking the allowlist each PR; final PR leaves it empty for `ui/` and the shell.

### Task 7: Docs

Update `CLAUDE.md`, `components/CLAUDE.md`, `docs/plasmatic-jelly-system.md`, `design.md`, `docs/page-consistency.md` (silhouette vs host bounds, 24 nodes, flat controls, room guarantee, clipping gate). Commit with Task 6's final PR.

---

## Self-review

- **Spec coverage:** C hybrid → Tasks 4–5; globe material/fill → Task 2; clipping (layouts + room-cap + gate + audit) → Tasks 3, 6; coverage → Task 6 sweep; tiers → Tasks 2, 4; docs → Task 7; FPS → Task 2 early-out fill, no new per-frame reads; browsers → PR checklist (Chromium verified only).
- **Known limitation to carry to the PRs:** the globe's own lighting math (`globe-material.ts`) is applied to the shoulder in a follow-up if the Task 2 render check shows the existing mold reads differently from the globe; the existing shader already shares the globe's palette and optics.
