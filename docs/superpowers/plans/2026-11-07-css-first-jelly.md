# CSS-first Plasmatic Jelly Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the site's Plasmatic Jelly material off WebGL and per-frame JS onto baked CSS plus event-woken effects, so a page at rest does no work.

**Architecture:** The CSS tier (`app/liquid-glass.css`, `app/jelly-material.css`) becomes the only material for site surfaces. The glass engine is replaced by a small snapshot-only "scene feed" that exists solely to feed the globe's page refraction. Soft body becomes CSS springs plus one pointer variable; arcs become click-only and lazily installed. Five PRs, each revertible, each merged to `main` by the executing agent.

**Tech Stack:** TanStack Start / React 19 / Vite 8, Tailwind v4 + hand CSS, TypeScript strict, Vitest (node env, fake DOM), pnpm, Node ≥ 24.18.

**Spec:** `docs/superpowers/specs/2026-11-07-css-first-jelly-design.md` (approved 2026-11-07). Read it first; this plan only records decisions the spec leaves open.

## Global Constraints

- Node ≥ 24.18, pnpm workspace. Every commit passes `pnpm check:consistency`; a failing gate is fixed, not bypassed. A rule that is genuinely wrong for the change is changed in the same commit and the message says so.
- No `backdrop-filter`, no SVG/`url()` filters on site surfaces; no per-component pointer loops; no `infinite` keyframes except the sanctioned haze (see Task 2).
- Hosts move at most 4 px / 3 % (`MOTION_BOUNDS`); hit areas and layout never move; text holds 4.5:1 on gel in `light` and `graphite`.
- Arc flash ledger: ≤ 3 onsets/s site-wide (`FLASH_LEDGER`, WCAG 2.3.1). `jellyMotion` (Lively/Calm/Still) and `electricArcs` (Full/Clicks/Off) keep working.
- Components keep using role classes and `data-jelly*` attributes unchanged.
- Kept for the globe (never delete): `lib/liquid/glass/{scene,scene-store,color,policy,jelly-glsl}.ts`, `lib/liquid/{optics,globe-material}.ts`, `lib/jelly/{tiers,ambient-tick,frame,pointer,soft-policy}.ts`, and `governedDprCap` from `lib/jelly/governor.ts`.
- Git: work on `claude/relaxed-hopper-t2hfa6`. After a PR merges, restart the branch from main: `git fetch origin main && git checkout -B claude/relaxed-hopper-t2hfa6 origin/main`. Commit messages end with the `Co-Authored-By` and `Claude-Session` trailers; PR bodies mirror `.github/pull_request_template.md` and end with the session line. **Merging deploys to production**: merge (squash) only when CI is green; PRs 1–3 are merged back-to-back in one session.
- Every PR body records `testing/e2e/frame-budget.mjs` before/after numbers, or says why they could not be taken.

## Review Focus

1. **Touch / no-hover device:** haze stays at the static floor, no pointer listener is attached, `:active` press still springs.
2. **`jellyMotion = still`:** no haze motion and no scroll-tied motion; hover and press still respond.
3. **Interrupted press:** `pointercancel`, leaving the window, or dragging off the host clears `--px`/`--py` and the pressed state; nothing stays dented.
4. **Rapid navigation with the globe docked:** the snapshot is re-requested per route but never captured while the hub is open, and never more often than its minimum interval.
5. **Theme switch (`light` ↔ `graphite`):** the snapshot refreshes once and the CSS rim tokens still hold the legibility gate.

---

### Task 0: Environment and baseline

**Files:** none (environment only).

- [ ] **Step 1: Get Node ≥ 24.18 and pnpm working** (`node -v` currently 22; try `corepack`, `n`, `nvm` or a downloaded Node 24 binary through the proxy). Record which route worked.
- [ ] **Step 2: `pnpm install`** (postinstall runs `prisma generate`). Expected: exits 0.
- [ ] **Step 3: Baseline** — `pnpm check:consistency --fast` and `pnpm test`. Expected: both pass on a clean `main`; save the output summary. If the environment cannot be fixed, write that in every PR and rely on CI, merging only on green.
- [ ] **Step 4: Merge the design PR** ([#1465](https://github.com/stickms/rmhstudios.com/pull/1465), docs only) once its CI is green, then restart the branch from main.
- [ ] **Step 5: Build the UI coverage inventory** (read-only audit, committed as `docs/superpowers/plans/2026-11-07-css-first-jelly-coverage.md`). One row per area of the UI, covering at least: `_site/` pages and the radial shell (top bar, hub, orb, globe dock, nav rail, veil); each glass role (`fill/pane/chrome/overlay/inset`), buttons, fields, `LiquidTabs`, `JellyGroup`, dropdowns, popovers, dialogs, sheets, tooltips, toasts, command palette; the `--app-*` tier apps (`.app-glass`, `app-theme.css`); every game's menu/pause/HUD chrome (play-fields stay excluded); eversion (`data-evert`); the other WebGL globes (elections, temple of joy, `GlobeCursor`); `liquid-morph` and the `GlassFilter` host; the `/jelly` lab; native-material routes (TF2 HUD editor, exempt); every `.style-*` theme; phone and desktop widths; RTL locales (`ar`, `ur`); print; `perf-lite`; `jellyMotion` Lively/Calm/Still; `electricArcs` Full/Clicks/Off. Columns: how the material reaches it today, every engine-owned selector or attribute it depends on (`data-liquid-canvas`, `data-jelly-gel`, `data-jelly-haze`, `data-jelly-flow`, `.jelly-flow`, `.jelly-haze-canvas`, `canvas[data-liquid-glass]` — found by `grep` across `*.css`, `*.ts`, `*.tsx`), which task changes it, and how it is verified. Any row whose CSS only works while the engine is installed is a defect to fix in the owning task.

### Task 1 (PR 1): Scene feed replaces the engine

**Files:**
- Create: `lib/liquid/glass/scene-feed.ts`
- Create: `lib/liquid/glass/__tests__/scene-feed.test.ts`
- Modify: `hooks/useLiquidInteractions.ts` (stop installing carriers, governor, arcs and engine)
- Modify: `components/radial/LiquidGlobe.tsx` (acquire/release the feed; request on route change)
- Modify: gate tests that assert those installs (`lib/__tests__/jelly-ownership.test.ts`, `jelly-contract.test.ts`, `lib/liquid/glass/__tests__/engine-layers.test.ts` stays untouched because the engine code stays in the tree)
- Modify (conditional): `app/jelly-material.css` §4, the static rim

**Interfaces:**
- Produces: `acquireSceneFeed(doc?: Document): SceneFeed` where `interface SceneFeed { request(reason: 'route' | 'theme' | 'resize' | 'visible' | 'activate'): void; release(): void }`. Refcounted per document: the first acquire creates one `SceneProvider` (`createSceneProvider` in `scene.ts`), the last release disposes it.
- Consumes: `createSceneProvider`, `SCENE_POLICY` (`scene.ts`), `publishScene`/`clearScene` (`scene-store.ts`), `jellyTier` (`lib/jelly/tiers.ts`).

- [ ] **Step 1: Write the failing test** `scene-feed.test.ts` (node env, mock `../scene` and `../scene-store` the way `engine-layers.test.ts` does). Assertions: `acquireSceneFeed` requests `'activate'` once; a second acquire reuses the provider (`createSceneProvider` called once); the provider is disposed and `clearScene` called only after both releases; the `onShot` callback calls `publishScene(shot.bitmap, { width, height, scrollX, scrollY })` and then `shot.bitmap.close()`; `request('route')` calls `provider.reset()` before `provider.request('route')`; no `scroll` listener is ever registered (`win.addEventListener` never receives `'scroll'`); a theme-attribute mutation on `<html>` (`class`, `style`, `data-theme`) triggers `request('theme')`; `canCapture` is false when `doc.hidden`, when `.radial-hub:not([data-phase="closed"])` exists, or under `print`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/liquid/glass/__tests__/scene-feed.test.ts`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `acquireSceneFeed`** in `scene-feed.ts` per the interface above. `policy: () => SCENE_POLICY[jellyTier({ doc })]` (lite/handheld/off return null, so nothing is captured there). Triggers are only: acquire, route (called by the caller), theme `MutationObserver` on `<html>`, `window` `resize`, and `visibilitychange` to visible. Reuse the gate wording from `engine.ts:585-587` minus `scrolling` and `lowEnd`.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Wire the globe.** In `LiquidGlobe.tsx`, inside the effect that already subscribes `onSceneChange(refreshScene)` (around line 1097), call `acquireSceneFeed()` and `release()` in the cleanup; call `feed.request('route')` when the router pathname changes (use the pathname source the file or `RadialShell` already has; add `useRouterState` only if none exists).
- [ ] **Step 6: Stop installing the heavy services.** In `useLiquidInteractions.ts` `start()`: keep `reconcileSoftRender()` and `data-jelly-ready`; delete the flow-carrier, governor, arcs and engine blocks and now-unused imports. The registry, physics and fallback light still install (they go in Tasks 3–5).
- [ ] **Step 7: Update the gates** that pin those installs. Run `pnpm exec vitest run lib/__tests__/jelly-ownership.test.ts lib/__tests__/jelly-contract.test.ts lib/jelly lib/liquid`; change only assertions that require the removed installs and say so in the commit message.
- [ ] **Step 8: Compare the static rim to the engine rim** in `light` and `graphite` (screenshots if the app runs). If the CSS rim lacks the red/blue split, add two inset shadows using `--gel-disperse-r` / `--gel-disperse-b` in the §4 rule; otherwise leave it.
- [ ] **Step 9: Verify** `pnpm exec tsc --noEmit && pnpm lint && pnpm check:consistency --base main`. Expected: pass, no new warnings.
- [ ] **Step 10: Commit, push, open PR** ("perf(jelly): replace the glass engine with a snapshot-only scene feed"). Note in the PR: the globe's adaptive DPR step is no longer fed (nothing publishes `publishGovernorStep`), so its DPR cap stays at its base value. Wait for green CI, squash-merge.

### Task 2 (PR 2): Woken haze

**Files:**
- Modify: `app/jelly-material.css` (§3 carrier, §6 paused states)
- Modify: `lib/__tests__/site-infinite-animation.test.ts` (N3, N12), `lib/__tests__/jelly-contract.test.ts` where it pins `.jelly-flow`
- Test: `lib/__tests__/jelly-woken-haze.test.ts` (CSS-text assertions, like the existing N3 gate)

**Interfaces:**
- Consumes: the `jelly-drift` / `jelly-current` keyframes and `--jelly-tempo`, `--jelly-amp`, `--jelly-phase` already in `jelly-material.css`.
- Produces: a `::before`/`::after` haze layer on the five role classes, no JS-injected nodes.

- [ ] **Step 1: Survey** which of `::before`/`::after` each of `.glass-fill/-pane/-chrome/-overlay/-inset` and `[data-slot='button']` already uses (`grep -rn` across `app/*.css`, `components/**/*.css`). Pick the free pseudo-element per role; if neither is free for a role, that role keeps the static haze floor only. Record the table in the PR.
- [ ] **Step 2: Write the failing test** `jelly-woken-haze.test.ts`: the haze animation selector sets `animation-play-state: paused` by default and `running` only under `:hover` and `:focus-within`; `html[data-jelly-motion='still']` removes the animation; the keyframes animate `transform` only; the layer has a negative `z-index`; a `@media (hover: none)` block disables it.
- [ ] **Step 3: Run it.** Expected: FAIL.
- [ ] **Step 4: Implement** the layer in `jelly-material.css` reusing the §3 gradients and keyframes against the pseudo-element, with `calm` slowing via `--jelly-tempo`. Add the scroll-tied variant inside `@supports (animation-timeline: view())` for `Lively` only.
- [ ] **Step 5: Amend N3/N12** to allow exactly this selector set, nothing broader; delete the `.jelly-flow` expectations that no longer apply. Re-run the test and `lib/__tests__/site-infinite-animation.test.ts`. Expected: PASS.
- [ ] **Step 6: Verify and ship** as in Task 1 Steps 9–10.

### Task 3 (PR 3): CSS springs and the pointer variable

**Files:**
- Create: `lib/jelly/spring-curves.ts`, `lib/jelly/pointer-vars.ts`, `lib/jelly/drag-report.ts`
- Create tests: `lib/jelly/__tests__/spring-curves.test.ts`, `pointer-vars.test.ts`, `lib/__tests__/jelly-spring-tokens.test.ts`
- Modify: `app/jelly-material.css` (press/hover/release rules, `--spring-*` tokens, dent light dot), `lib/liquid/hover-css.ts` and its test (it strips hand-written hover lifts; allow the jelly rules), `hooks/useFluidDrag.ts`, `hooks/useLiquidInteractions.ts`, `scripts/check-consistency.sh` (the N2 and scale/translate messages)

**Interfaces:**
- Produces: `dampedSpringLinear(opts: { stiffness: number; damping: number; mass?: number; samples?: number }): string` (a CSS `linear(...)` easing string); `installPointerVars(doc?: Document): () => void`; `reportJellyDrag(...)` moved to `drag-report.ts` with the same signature as `lib/jelly/physics.ts:311`, now writing `--px`/`--py` instead of driving a lattice.
- Consumes: `onJellyPointer` (`pointer.ts`), `JELLY_SELECTOR`, `jellyOptedOut`, `MOTION_BOUNDS`, `SOFT_BODY` constants.

- [ ] **Step 1: Failing tests.** `spring-curves.test.ts`: output starts at `0`, ends at `1`, overshoots by a bounded amount for `damping < critical`, never exceeds the `MOTION_BOUNDS` scale delta when mapped. `jelly-spring-tokens.test.ts`: each `--spring-*` literal in `jelly-material.css` equals `dampedSpringLinear` of the constants in `SOFT_BODY` (parity, like `jelly-tokens.test.ts`). `pointer-vars.test.ts`: on `pointermove` over a jelly host it writes `--px`/`--py` on that host only; reads the host rect once per host change, never per move; `pointercancel` / `pointerout` to the window clears both; opted-out hosts and `(hover: none)` pointers write nothing and attach no listener.
- [ ] **Step 2: Run them.** Expected: FAIL.
- [ ] **Step 3: Implement** the three modules; coalesce writes to one per animation frame, and only schedule that frame while the pointer is over a host.
- [ ] **Step 4: CSS.** `:hover` plumps (≤ 1.03 scale), `:active` squashes, release springs with the `--spring-*` transition on `scale`/`translate` only; the plasma wake and the dent's light dot use a radial gradient at `var(--px) var(--py)`. Amend `hover-css.ts` to permit these and rewrite its test expectations.
- [ ] **Step 5: Stop installing physics** (`installJellyPhysics`) and the registry in `useLiquidInteractions.ts`; install `installPointerVars` instead. Point `useFluidDrag` at `drag-report.ts`.
- [ ] **Step 6: Update the gates** (`jelly-ownership` N2 and the `check-consistency.sh` messages), run `pnpm test`, then verify and ship as in Task 1 Steps 9–10.

### Task 4 (PR 4): Click-only, lazily installed arcs

**Files:**
- Create: `lib/jelly/arc-lazy.ts`, `lib/jelly/__tests__/arc-lazy.test.ts`
- Modify: `lib/jelly/arcs/runtime.ts` (add `ambient?: boolean` to `ElectricArcsOptions` at line 91, default `true`; when `false` do not start the scheduler or field), `hooks/useLiquidInteractions.ts`, `lib/jelly/__tests__` / `lib/jelly/arcs/__tests__/runtime.test.ts`

**Interfaces:**
- Produces: `installLazyClickArcs(doc?: Document): () => void` — on the first `pointerdown` it dynamically imports `@/lib/jelly/arcs` and calls `installElectricArcs(doc, { ambient: false })`, then tears it down after 10 s without a click. `dischargeAt` and `strike` stay exported unchanged.

- [ ] **Step 1: Failing tests:** nothing is imported or installed before the first `pointerdown`; `electricArcs = 'off'` never installs; a second click within 10 s reuses the runtime; after 10 s idle the runtime is disposed and its canvas removed; the flash ledger still refuses a fourth onset within 1 s.
- [ ] **Step 2: Run, implement, run again.** Expected: FAIL then PASS.
- [ ] **Step 3: Swap the install** in `useLiquidInteractions.ts`; confirm `/jelly` (`app/routes/jelly.tsx`) still imports `strike` unchanged.
- [ ] **Step 4: Verify and ship** as in Task 1 Steps 9–10.

### Task 5 (PR 5): Delete dead code, rewrite the rules

**Files:**
- Delete (once `tsc` shows no importer): the engine's slab/haze/lattice code and worker (`lib/liquid/glass/{engine,renderer,shader,haze-shader,glass-worker,glass.worker}.ts` and their tests), `lib/jelly/{registry,flow-carriers,lattice,lattice-inputs,envelope,room,compose,physics}.ts`, `arcs/{scheduler,field,pairs,rate}.ts`, and `testing/e2e` scripts that exercise only removed services (keep `frame-budget.mjs`).
- Modify: `docs/plasmatic-jelly-system.md`, root `CLAUDE.md`, `lib/CLAUDE.md`, `components/CLAUDE.md`, `lib/perf-tier.ts` header (re-scope `perf-lite`), `lib/jelly/tiers.ts` (drop budget fields nothing reads), the affected gate tests.

- [ ] **Step 1: Delete in dependency order**, running `pnpm exec tsc --noEmit` after each group; a file the globe imports (Global Constraints) must survive.
- [ ] **Step 2: Remove the stale gate entries** (each backlog list is one-directional: delete the entry in the same commit) and run `pnpm test`.
- [ ] **Step 3: Rewrite the docs** to describe the CSS-first material, the scene feed, the amended spring rule ("one spring source, no per-component curves") and what was lost. Keep the identity and layout sections.
- [ ] **Step 4: Verify** `pnpm check:consistency:full`, entry-bundle budget (`scripts/check-bundle-budget.ts`) not exceeded, final `frame-budget.mjs` numbers recorded. Ship as in Task 1 Steps 9–10.

### Task 6: UI coverage sweep

**Files:**
- Create: `scripts/audit-ui-matrix.mjs` (Playwright, uses the pre-installed Chromium; route list comes from the coverage inventory)
- Modify: the coverage inventory (mark every row verified), plus whatever a failing row needs

- [ ] **Step 1: Write the sweep.** For each inventory route × theme (`light`, `graphite`, plus one other `.style-*`) × width (phone 390, desktop 1440) × `jellyMotion` (`lively`, `still`): load the page and assert there is no `canvas[data-liquid-glass]`, `.jelly-haze-canvas` or `.jelly-flow` in the DOM, that no `requestAnimationFrame` callback fires over 2 s of stillness (count with an init script, excluding the globe's own canvases), and save a screenshot. Also load one RTL locale (`ar`) and the print media emulation.
- [ ] **Step 2: Run it** against `pnpm dev` (or a production build) together with `pnpm audit:pages` and `pnpm audit:jelly-clip`. Expected: zero assertion failures; screenshots reviewed for broken fills, missing rims and clipped content. If the app cannot run in this environment, say so in the PR and rely on the inventory plus CI.
- [ ] **Step 3: Fix every failing row** in the task that owns it, re-run, and mark the inventory rows verified.
- [ ] **Step 4: Verify and ship** as in Task 1 Steps 9–10.
