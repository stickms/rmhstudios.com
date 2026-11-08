# Refractive glass and the end of perf-lite — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every main-site glass surface refracts the page behind its rim in Chromium, Firefox and WebKit, and `perf-lite` no longer exists as a material tier.

**Architecture:** Two PRs. PR A removes `perf-lite` (a capability signal survives for games, apps, RUM and the globe fallback) and is measured on its own. PR B adds a rim layer per host that shows the shared page snapshot through a cached SVG displacement filter, placed by scroll offset, budgeted to on-screen hosts, redrawn only when the snapshot or the host box changes.

**Tech Stack:** TanStack Start/React 19, plain TS services in `lib/jelly/`, CSS in `app/`, SVG filters (`feImage` + `feDisplacementMap`), Vitest, the perf harness at `.superpowers/sdd/2026-11-07-css-first-jelly/perf/perf-matrix.mjs`.

**Spec:** `docs/superpowers/specs/2026-11-08-refractive-glass-design.md` (approved 2026-11-08). Executors read it first; its "Calls made" section binds.

## Global Constraints

- No `backdrop-filter` in any glass role. No main-thread WebGL. No new `requestAnimationFrame` loop, no `infinite` keyframes, no animated root custom properties (`lib/__tests__/raf-loop-allowlist`, `site-infinite-animation`, `jelly-contract` gates stay green).
- Nothing runs at rest: zero rAF and no new compositor layers per surface beyond the budget cap.
- Layout never changes; squash stays within 4 px / 3% (`MOTION_BOUNDS`).
- Out of scope: the page background, `native-material` routes (`/games*`, `/tf2*`), the `--app-*` tier, `data-jelly-zone="playfield"`.
- Print and `.app-high-contrast` stay opaque.
- Photosensitivity (WCAG 2.3.1): refraction is static; layer fades are single CSS transitions ≤ 300 ms and never repeat.
- Performance bar (hard gate), production build, software GL, median of 5 interleaved runs, baseline = PR #1484 re-measured with `perf-lite` forced off: Firefox `/` and `/jelly` scroll p95 and WebKit theme switch, press p95, scroll p95 each within 10%; Chromium rest CPU and layers unchanged.
- `pnpm check:consistency` passes on every commit; never bypass it. i18n: no new user-facing strings expected.
- Implementer subagents commit and push but never open or merge PRs; the controller does, after review.

## Review Focus

1. A host with an unusual radius (pill taller than 48 px, `border-radius: 50%`, 0 radius): the displacement map must stay neutral outside the shape and not smear at corners. Test: `rimMap` for radius 0, radius ≥ half the short side, and a 1 × 1 host.
2. A host whose size changes with content (feed cards loading images, textareas): size-class churn must not create a filter per pixel of growth or thrash. Test: sweeping width 200→800 px in 1 px steps yields ≤ 12 distinct classes and ≤ 12 filter elements.
3. Fast scroll through a long feed: layers outside the budget or outside the snapshot's coverage fade to the lit rim, never to a wrong or flashing picture. Test: `coverage()` returns 0 when the displaced picture no longer covers the rim band, monotone between.
4. Theme switch with live layers: the old picture is the wrong colour. Layers fade out on `theme` until the next picture lands. Test: `onSceneChange` with a cleared scene drops every layer's opacity to 0.
5. RTL (`ar`, `ur`) and `position: fixed` / sticky hosts: light direction does not mirror (red stays toward the top-left), and fixed hosts use the scroll-displaced placement. Test: `rimMap` is identical under `dir="rtl"`; `placement()` for a fixed host moves 1:1 with scroll.

---

# PART A — remove `perf-lite` (PR A)

### Task 1: A capability signal that is not a tier

**Files:**
- Create: `lib/low-end.ts`, `lib/__tests__/low-end.test.ts`
- Modify: `lib/perf-tier.ts`, `lib/game-capabilities.ts`, `lib/rum.ts`, `lib/network-quality.ts`, `lib/slice-it/{store,presentation}.ts`, `components/slice-it/GameCanvas.tsx`, `components/void-breaker/VoidBreakerGame.tsx`, `lib/eversion/{gl/governor-tiers,prefetch,constants}.ts`, `components/radial/eversion/detect-tier.ts`, `lib/hearthworks/skins/model-loader.ts`, `components/radial/{globe-protocol,globe-worker-host,LiquidGlobe}.ts*`

**Interfaces:**
- Produces: `isLowEndCapability(): boolean` — the same reads as today's `isLowEndDevice()` (saveData / 2g, `deviceMemory < 4`, `hardwareConcurrency <= 2`, software renderer stamp); memoised; reads no DOM class and writes none. `markSoftRender(): void` / `softRenderDetected(): boolean` keep the localStorage stamp so the globe fallback still sees software rendering. No `html.perf-lite` is ever set.
- Consumes: `probeGpu()` from `lib/render/probe.ts`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/low-end.test.ts`: `isLowEndCapability()` is true for `deviceMemory: 2`, for `hardwareConcurrency: 2`, for `saveData: true`, for a swiftshader renderer, false for a capable machine, false when signals are absent; and `document.documentElement.classList.contains('perf-lite')` is false after calling it (the class is never written).
- [ ] **Step 2: Run** `pnpm exec vitest run lib/__tests__/low-end.test.ts` — expect FAIL (module missing).
- [ ] **Step 3: Implement** `lib/low-end.ts` by moving the capability logic out of `lib/perf-tier.ts` (keep thresholds verbatim); `perf-tier.ts` re-exports nothing and is deleted in Task 3.
- [ ] **Step 4: Repoint every non-material consumer** listed under Files from `isPerfLite()` / the class to `isLowEndCapability()`; the globe worker host/protocol keep their "no WebGL in worker or software render → CSS globe" decision using `softRenderDetected()`.
- [ ] **Step 5: Run** the touched suites (`pnpm exec vitest run lib/eversion components/radial lib/__tests__/low-end.test.ts`) — expect PASS.
- [ ] **Step 6: Commit** `refactor: a low-end capability signal that is not an html class`.

### Task 2: The jelly policy has no `lite` tier

**Files:**
- Modify: `lib/jelly/tiers.ts`, `lib/liquid/glass/scene.ts`, `lib/liquid/glass/scene-feed.ts`, `lib/liquid/glass/engine.ts`, `lib/liquid/runtime.ts`, `lib/jelly/{arc-lazy,physics,flow-carriers}.ts`, `lib/jelly/arcs/runtime.ts`, `hooks/useLiquidInteractions.ts`, `hooks/useLiquidBackground.ts`, `components/ui/{liquid-morph,search-field,overlay-panel}.tsx`, `lib/render/canvas2d-fx.ts`
- Test: `lib/jelly/__tests__/tiers.test.ts`, `lib/jelly/__tests__/arc-lazy.test.ts`, `lib/jelly/arcs/__tests__/runtime.test.ts`, `lib/__tests__/{jelly-soft-body,jelly-ownership,handheld-tier}.test.ts`

**Interfaces:**
- Produces: `JellyTier = 'full' | 'coarse' | 'handheld' | 'off'`; `DEGRADED_ROOT_SELECTOR` is removed (print and `.app-high-contrast` remain in `hardOff`); `SCENE_POLICY` has no `lite` key; `useLiquidInteractions` no longer calls `reconcileSoftRender` and still stamps `html[data-jelly-ready]` at idle.

- [ ] **Step 1: Update the tests first** to the new contract: `jellyTier()` never returns `'lite'`; a root with the (now meaningless) `.perf-lite` class is treated as `full`; `JELLY_BUDGETS` has exactly the four keys; `useLiquidInteractions` stamps `data-jelly-ready` without any soft-render probe. Run them — expect FAIL.
- [ ] **Step 2: Implement** the removals in the listed files; delete `JELLY_BUDGETS.lite`, `SCENE_POLICY.lite`, `perfLite()` in `tiers.ts`, and every `DEGRADED_ROOT_SELECTOR` use (replace with the print / app-high-contrast checks where the intent was "material off").
- [ ] **Step 3: Run** `pnpm exec vitest run lib/jelly lib/liquid lib/__tests__/jelly-soft-body.test.ts lib/__tests__/jelly-ownership.test.ts lib/__tests__/handheld-tier.test.ts hooks` — expect PASS.
- [ ] **Step 4: Commit** `refactor(jelly): remove the lite tier from the policy`.

### Task 3: Remove `perf-lite` from CSS, the document and the docs

**Files:**
- Modify: `app/{jelly-material,globals,liquid-glass,jelly-coverage,jelly-arcs}.css`, `components/radial/radial.css`, `components/radial/eversion/eversion.css`, `components/shared/app-theme.css`, `components/slice-it/slice-it.css`, `components/kaikai-debt/kaikai-debt.css`, `components/Providers.tsx`, `app/routes/__root.tsx`, `testing/e2e/*.mjs` (jelly-interaction, liquid-glass, liquid-glass-engine, jelly-theme-navigation), `CLAUDE.md`, `lib/CLAUDE.md`, `components/CLAUDE.md`, `docs/plasmatic-jelly-system.md`, `docs/design-language.md`
- Delete: `lib/perf-tier.ts`, `lib/performance-tier.ts`, `lib/__tests__/performance-tier.test.ts`, `lib/__tests__/perf-tier-script.test.ts`
- Test: `lib/__tests__/{site-infinite-animation,jelly-woken-haze,jelly-contract,fouc-contract,native-material-routes}.test.ts`, `lib/eversion/__tests__/eversion-css.test.ts`

**Interfaces:** Consumes Task 1 and 2. Produces: no `.perf-lite` selector and no `perf-lite` string in `app/`, `components/`, `lib/` outside tests that assert its absence.

- [ ] **Step 1: Add the guard test** `lib/__tests__/no-perf-lite.test.ts`: walks `app/**/*.css`, `components/**/*.css`, `lib/**/*.ts(x)`, `hooks/**`, `app/routes/__root.tsx` and fails on the string `perf-lite` (allowlist: this test file). Run — expect FAIL listing every file.
- [ ] **Step 2: Remove** the rules and the pre-paint stamping script; where a rule had a `:not(.perf-lite)` prefix, drop only the prefix; where a block existed only for `.perf-lite`, delete the block. Keep print and `.app-high-contrast` blocks. Update the four docs: the Plasmatic Jelly sections of `CLAUDE.md`/`lib/CLAUDE.md`/`components/CLAUDE.md`, the degradation tables in `docs/plasmatic-jelly-system.md` and `docs/design-language.md`.
- [ ] **Step 3: Run** `pnpm exec vitest run lib/__tests__ lib/eversion lib/jelly` and `pnpm check:consistency --base origin/main` — expect PASS.
- [ ] **Step 4: Commit** `refactor: remove perf-lite from the material, the document and the docs`.

### Task 4: Measure PR A and report

**Files:** `.superpowers/sdd/2026-11-08-refractive-glass/perf/` (report only; not committed to product paths)

- [ ] **Step 1:** Build main (before) and the branch (after) as production builds served together on a throwaway Postgres, as in `.superpowers/sdd/2026-11-07-css-first-jelly/task-11-report.md`. **Before** is main with `perf-lite` forced on for software renderers (what users get today); **baseline B** is main with it forced off (the bar for PR B).
- [ ] **Step 2:** Run `perf-matrix.mjs` for Chromium, Firefox (headed on Xvfb) and WebKit: median of 5 interleaved runs, scenarios scroll `/` and `/jelly`, theme switch, press, dialog, rest CPU/rAF/layers.
- [ ] **Step 3:** Write `task-4-report.md` with a table of before / baseline B / after. If after is more than 10% worse than baseline B on any bar metric, STOP and report to the controller with the numbers; do not re-add a downscale.
- [ ] **Step 4:** Controller opens PR A, merges on green CI.

---

# PART B — refraction (PR B, after PR A merges)

### Task 5: Pure refraction maths

**Files:**
- Create: `lib/jelly/refract/profile.ts`, `lib/jelly/refract/coverage.ts`, `lib/jelly/refract/__tests__/profile.test.ts`, `lib/jelly/refract/__tests__/coverage.test.ts`

**Interfaces:**
- Produces:
  - `sizeClass(w: number, h: number, r: number): { key: string; w: number; h: number; r: number }` — quantises to the next bucket (geometric, ≤ 12 buckets for widths 200–800).
  - `rimMap(c: { w: number; h: number; r: number }, band: number): Uint8ClampedArray` — RGBA, neutral (128,128,128,255) outside the rim band and in the interior, outward-normal displacement in R/G inside the band with a smooth lens falloff.
  - `DISPERSION = { r: number; g: number; b: number }` — per-channel displacement scales (red largest toward the top-left light, blue smallest), from the design language's `--gel-dispersion`.
  - `placement(scene: { width; height; scrollX; scrollY }, host: { left; top; width; height; fixed: boolean }, scroll: { x; y }, band: number): { offsetX: number; offsetY: number; cover: number }` — `cover` 1 where the displaced picture fully covers the rim band, 0 where it covers none, linear between; fixed/sticky hosts shift 1:1 with `scroll - sceneScroll`, in-flow hosts use their document position.

- [ ] **Step 1: Write the failing tests:** `rimMap` neutral at the centre and at the far outside of a 300×100 r=50 class; displacement points outward on every side and is symmetric left/right; radius 0, radius ≥ h/2 and a 1×1 host return a valid array (Review Focus 1); sweeping width 200→800 gives ≤ 12 `sizeClass` keys (Review Focus 2); `placement` cover is 1 when scroll equals scene scroll, falls to 0 once the shift exceeds the viewport, monotone (Review Focus 3); fixed host moves 1:1 with scroll; `rimMap` output is identical regardless of document direction (Review Focus 5).
- [ ] **Step 2: Run** `pnpm exec vitest run lib/jelly/refract` — expect FAIL.
- [ ] **Step 3: Implement** the four exports in the two files (pure, no DOM; a signed-distance falloff for the rim band).
- [ ] **Step 4: Run** the same command — expect PASS.
- [ ] **Step 5: Commit** `feat(refract): the pure rim map, size classes and snapshot placement`.

### Task 6: Shared filters and the snapshot as an image

**Files:**
- Create: `lib/jelly/refract/filters.ts`, `lib/jelly/refract/scene-image.ts`, `lib/jelly/refract/__tests__/filters.test.ts`, `lib/jelly/refract/__tests__/scene-image.test.ts`

**Interfaces:**
- Consumes: `sizeClass`, `rimMap`, `DISPERSION` (Task 5); `currentScene`, `onSceneChange` (`lib/liquid/glass/scene-store.ts`).
- Produces:
  - `acquireRefractFilter(doc: Document, c: { key; w; h; r }): { id: string; release(): void }` — one shared hidden `<svg>` in the document; one `<filter>` per class key (three `feDisplacementMap`s for R/G/B merged), created lazily, refcounted, removed at refcount 0.
  - `sceneImage(doc: Document): { url: string | null; version: number; width: number; height: number; scrollX: number; scrollY: number; onChange(fn: () => void): () => void; dispose(): void }` — encodes each new scene to one blob URL (revokes the previous), `url` is `null` after `clearScene()`.

- [ ] **Step 1: Write the failing tests:** acquiring two hosts of one class creates one `<filter>`; releasing both removes it; 12 classes at most for the width sweep (Review Focus 2); `sceneImage` revokes the previous URL when a new scene is published and sets `url` to `null` and notifies on `clearScene` (Review Focus 4).
- [ ] **Step 2: Run** `pnpm exec vitest run lib/jelly/refract` — expect FAIL.
- [ ] **Step 3: Implement** both files. The map for `feImage` is a data URL built once per class from `rimMap` on an `OffscreenCanvas` (or a plain canvas where unavailable); the snapshot encode uses `OffscreenCanvas.convertToBlob` (PNG), falling back to `canvas.toBlob`.
- [ ] **Step 4: Run** — expect PASS.
- [ ] **Step 5: Commit** `feat(refract): cached SVG displacement filters and the snapshot as an image`.

### Task 7: The rim layer on every host

**Files:**
- Create: `lib/jelly/refract/layer.ts`, `lib/jelly/refract/install.ts`, `app/jelly-refract.css`, `lib/jelly/refract/__tests__/install.test.ts`, `lib/__tests__/jelly-refract.test.ts`
- Modify: `lib/liquid/glass/scene.ts` (`SCENE_HIDE` gains `'.jelly-refract'`; handheld `ScenePolicy` per Spec call 3), `lib/liquid/glass/scene-feed.ts` (`SceneFeedReason` gains `'scroll-rest'`), `hooks/useLiquidInteractions.ts` (mount `installRefraction`), `lib/jelly/tiers.ts` (`JellyBudget.refractHosts`), `app/globals.css` or the entry sheet (import `jelly-refract.css`), `lib/jelly/flow-carriers.ts` if it lists host selectors

**Interfaces:**
- Consumes: Tasks 5–6; `acquireSceneFeed` (`lib/liquid/glass/scene-feed.ts`); `JELLY_SELECTOR`, `jellyOptedOut`, `jellyOff` (`lib/jelly/tiers.ts`).
- Produces: `installRefraction(doc?: Document): () => void` — idempotent; discovers hosts matching `.glass-fill,.glass-pane,.glass-chrome,.glass-overlay,.glass-inset` (not opted out, not in `native-material` routes, not inside `data-jelly-zone="playfield"`) with one `MutationObserver` on `body` batched through one idle callback and an `IntersectionObserver`; attaches one `<span class="jelly-refract" aria-hidden>` per on-screen host (up to `JELLY_BUDGETS[tier].refractHosts`, nearest the viewport centre first), sets its `filter: url(#id)`, background (the scene `url`, size and `placement()` offsets) and `--refract-cover`; updates on `sceneImage` change, host `ResizeObserver`, and scroll end (debounced to rest); requests a `'scroll-rest'` picture only while a visible sticky, fixed or overlay host holds a layer. On a cleared scene or `theme` change every layer's cover goes to 0 (CSS opacity transition ≤ 300 ms).

- [ ] **Step 1: Write the failing tests** (`install.test.ts` with fake observers and a fake scene): a host gets exactly one layer; an off-screen host gets none; over budget the farthest hosts get none; a resize to a new size class swaps the filter and releases the old one; a cleared scene sets cover 0 on all layers (Review Focus 4); a fixed host's offset follows scroll 1:1 (Review Focus 5); `installRefraction` returns a teardown that removes every layer, filter, observer and blob URL and leaves no rAF scheduled. `jelly-refract.test.ts` (source gate): `app/jelly-refract.css` contains no `backdrop-filter`, no `infinite`, no `@keyframes`; `install.ts` never calls `requestAnimationFrame`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/jelly/refract lib/__tests__/jelly-refract.test.ts` — expect FAIL.
- [ ] **Step 3: Implement** `layer.ts` (one layer's lifecycle) and `install.ts` (discovery, budget, scene/resize/scroll-rest wiring), and the CSS: the layer is `position:absolute; inset:0; border-radius:inherit; pointer-events:none; z-index:-2` (the rim slot), masked to the rim band with a `mask-image` ring so only the band shows, opacity driven by `--refract-cover`, a single opacity transition on `--ease-smooth`; print and `.app-high-contrast` hide it.
- [ ] **Step 4: Mount** it from `useLiquidInteractions` after the `data-jelly-ready` stamp (so first paint is unchanged); add `refractHosts` per tier in `JELLY_BUDGETS` (starting values: `full` 24, `coarse` 12, `handheld` 0 until Task 8 measures phones, `off` 0).
- [ ] **Step 5: Run** the same vitest command plus `pnpm exec vitest run lib/__tests__/raf-loop-allowlist.test.ts lib/__tests__/site-infinite-animation.test.ts lib/__tests__/jelly-contract.test.ts` — expect PASS.
- [ ] **Step 6: Commit** `feat(refract): every main-site glass surface refracts the page behind its rim`.

### Task 8: Measure, look, decide, document

**Files:** `.superpowers/sdd/2026-11-08-refractive-glass/` (reports and screenshots), `docs/plasmatic-jelly-system.md` (§1.2 now describes the SVG-filter rim), `CLAUDE.md` / `lib/CLAUDE.md` / `components/CLAUDE.md` Plasmatic Jelly sections, `lib/jelly/tiers.ts` (`refractHosts` values from measurement), `lib/liquid/glass/scene.ts` (handheld policy)

- [ ] **Step 1: Visual acceptance.** Playwright screenshots (deviceScaleFactor 2) in Chromium, Firefox, WebKit: top bar over a feed image, a menu over cards, a dialog, an overlapping-glass case, in Daylight and Midnight at 390 and 1280 px; confirm the RGB split and that a card's own edge does not double (Spec call 4; if it does, hide the host from the picture for that surface and note it).
- [ ] **Step 2: Performance bar.** Re-run Task 4's harness for PR B against baseline B; Firefox/WebKit/Chromium per the Global Constraints. Include a long-feed fast-scroll run.
- [ ] **Step 3: Decide.** If any bar metric is more than 10% worse: lower `refractHosts`, then try `chrome/overlay/pane` only (Approach 2) behind the same code path, and report. If handheld fits the WebKit bar, set its policy and cap; otherwise leave 0 and say so.
- [ ] **Step 4: Docs.** Rewrite the refraction/rim passages in the three CLAUDE.md files and `docs/plasmatic-jelly-system.md` to the shipped design; `pnpm check:consistency --base origin/main` passes.
- [ ] **Step 5: Commit** `docs+perf(refract): measured budget, handheld decision and the shipped contract`; controller opens PR B, merges on green CI.
