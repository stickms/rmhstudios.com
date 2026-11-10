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

---

## Addendum (2026-11-08): work added after PR 3

Added at the owner's direction after PRs 1–3 reached production. Run order: Task 4 → Task 7 → Task 8 → Task 9 → Task 5 → Task 6.

### Task 7: The globe off the main thread (OffscreenCanvas worker, WASM kernel inside it)

Owner directive: "keep the webgl globe on a separate thread, separate from the website entirely, so any lag is isolated to the globe and not the website feel", and "consider WebAssembly for the globe for a speedup". Evidence (production probe 2026-11-08, headless Chromium, software GL, full tier): the main thread is ~99% busy at rest, 57 long tasks per 8 s, scroll frame gap p50 150 ms; a Chromium trace shows `GLES2::ReadPixels` ~640 ms/s on `CrRendererMain` (synchronous GPU readback), none of it JavaScript. Part of that readback is an artifact of this sandbox's software compositor, so the acceptance bar below is about moving ALL globe GL and readbacks off the main thread, not a specific millisecond figure.

**Files:**
- Create: `components/radial/globe-worker.ts` (worker entry: owns the WebGL2 context, the render loop and the dough simulation), `components/radial/globe-worker-host.ts` (main-thread host: creates the worker, transfers the canvas, forwards inputs, owns fallback), `components/radial/globe-protocol.ts` (typed message protocol shared by both)
- Modify: `components/radial/LiquidGlobe.tsx`, `components/radial/jelly-glass.ts` (render code moves into the worker; no DOM access), `components/radial/self-evert-skin.ts`, `components/globe-cursor/GlobeCursor.tsx` (if its canvas can go to the worker too), `lib/wasm/*` (worker loading of the dough kernel), `lib/dough.ts`
- Read first: `lib/liquid/glass/glass-worker.ts` and `glass.worker.ts` (the existing worker-host pattern in this repo, including `transferToImageBitmap` and fallbacks), `docs/frontend-webassembly.md`, `lib/wasm/`, `wasm/`, `lib/liquid/glass/scene-store.ts`
- Test: protocol and fallback tests under `components/radial/__tests__/` or `lib/__tests__/`

**Interfaces (decisions the implementer cannot make alone):**
- The worker owns EVERYTHING GPU: `OffscreenCanvas` via `canvas.transferControlToOffscreen()` (the browser then presents the worker's frames without main-thread involvement), the render loop (rAF in the worker where available, else a timer at the ambient clock rate from `lib/jelly/ambient-tick.ts`), the dough simulation, and, if useful, the WASM dough kernel loaded with the existing `lib/wasm` loader inside the worker.
- The main thread only forwards small messages: size/DPR changes (from the one ResizeObserver, never per frame), pointer position/press (coalesced to at most one message per animation frame, only while the globe is interactive), theme colour values (read ONCE per theme change with `getComputedStyle`, never by canvas readback), reduced-motion/jelly-motion state, visibility/focus, and the page snapshot (`ImageBitmap` from `scene-store`, transferred, then closed on the main thread).
- NO synchronous readback on the main thread anywhere in the globe path: no `getImageData`, `readPixels`, `toDataURL` or `drawImage(webglCanvas)` on the main thread. Anything that today samples a canvas (the colour sampling in `jelly-glass.ts`) moves into the worker or is replaced by values read once from CSS.
- Fallback: where a worker cannot own a WebGL2 context (no `OffscreenCanvas` WebGL2 in workers, context creation fails, worker error, repeated context loss) the globe uses the CSS glass globe that `perf-lite` already shows, NEVER GL on the main thread. The decision is made once per page load and logged to the dev console in development only.
- `perf-lite`, print, hidden tab, and `jellyMotion = still` keep their current globe behaviour.
- Back-pressure: the host drops stale input messages instead of queueing them; the worker drops frames when it cannot keep up. A slow GPU or software GL must slow the globe only.

**Acceptance (all measured with the production-probe scripts in the SDD workspace, `live-probe.cjs`/`live-trace.cjs`, against a local production build):**
- With the globe visible on `/` in the full tier, `CrRendererMain` shows no `GLES2::ReadPixels` and no `CommandBufferHelper::Finish`; main-thread TaskDuration at rest falls from ~990 ms/s to under 150 ms/s in the software-GL harness; hover and scroll frame gaps on the main thread no longer depend on the globe (verify by hiding the globe: the numbers must not improve further by more than noise).
- The globe still renders, responds to the pointer, refracts the page snapshot, follows theme changes, and survives route changes and the hub opening and closing (screenshots in both themes).
- Tests: the protocol (message shapes, coalescing, drop-stale), the fallback decision (each failure mode), and the host's teardown (worker terminated, canvas released, no listeners left).

### Task 8: Restore press-through squash ("squash everything")

Owner directive after PR 3: restore the old press feel. A `JellyGroup` squashes as one body when any member is pressed; a card whose content is a plain `<a>` squashes as a whole; the 4 px edge bound and the size-capped poses stay.

**Files:** `app/jelly-material.css` (§8 press rules: the `:not(:has(:is(<interactive>):active))` guard), `app/globals.css` (the legacy opacity press cue and its guard), `components/ui/jelly-group.tsx` and `components/radial/RadialShell.tsx`/`components/ui/selection-bar.tsx` (the `data-jelly-press-through` attribute semantics), `lib/__tests__/jelly-soft-body.test.ts`, `lib/__tests__/jelly-coverage.test.ts`.

**Decisions:** the guard that stops a container pressing when an inner control is pressed now has two exceptions: (a) a host whose inner pressed control is one of ITS OWN members (a `JellyGroup`, a `LiquidTabs` strip, the top bar, a selection bar) still squashes, and the member shows no separate cue (no double cue); (b) a plain `<a>` (no `data-slot`, no role) that fills a card does not stop the card squashing. A real control inside a card (a button in a post card) keeps the old rule: the button presses, the card does not. Express (a) with an explicit opt-in attribute on the group host, `data-jelly-press-body`, replacing the meaning of `data-jelly-press-through`; the three existing setters (`RadialShell.tsx`, `ui/jelly-group.tsx`, `ui/selection-bar.tsx`) move to it. Tests pin each case at the CSS level and the no-double-cue rule.

### Task 9: Plasma and lightning impact ("oomph"), lit and refracted

Owner directive: more oomph and impact in feel and lighting for the plasma and lightning effects, with lighting that is properly reflected and refracted. Constraints stay: canvas 2D and CSS only (no WebGL, no `backdrop-filter`, no SVG filters), nothing at rest, event-driven only, the flash ledger (≤ 3 onsets/s, WCAG 2.3.1) and a per-flash luminance cap, `jellyMotion = still` and `electricArcs = off` stay off, `perf-lite` stays off, nothing moves hit areas.

**Files:** `lib/jelly/arcs/renderer.ts`, `lib/jelly/arcs/bolt.ts`, `lib/jelly/arcs/clicks.ts`, `lib/jelly/arcs/geometry.ts`, new pure helpers under `lib/jelly/arcs/` (dispersion, refraction offset, impact timeline, glow profile), `app/jelly-arcs.css`, `hooks/useCelebration.ts` (call `ensureClickArcs` before `dischargeAt`), tests next to each helper.

**Design (decided; the implementer tunes the numbers against screenshots):**
1. Additive glow: bolts draw with `globalCompositeOperation = 'lighter'` in layered passes (wide soft bloom, mid glow, white-hot core), colours from the plasma tokens.
2. Chromatic dispersion: the bolt is drawn three times (red, green, blue) with small perpendicular offsets that grow with distance from the core, so the edge of the bolt splits like light through glass; the split is stronger where a bolt crosses a host's rim.
3. Refraction inside gel: the part of a bolt that lies inside a host's rounded rectangle is displaced a few pixels along the local edge normal with a stronger split, so the bolt appears to bend as it passes through the gel; outside the host it is straight.
4. Impact: at each end, a short radial flash (soft disc plus anisotropic specular streaks) and an expanding ring clipped to the host's rounded rectangle, with an ease-out timeline of 260–420 ms; the click point gets the same flash and ring.
5. Reflected light on the surface: a thin additive stroke along the nearest part of the host's outline (the rim "lit" by the bolt), fading with the bolt, drawn on the arc canvas, not by changing host styles.
6. Feel: the two struck hosts get a bounded CSS nudge (`translate` via the existing spring tokens, at most 1.5 px, capped by the 4 px edge bound), set as a custom property on at most the struck hosts and cleared after the settle; an optional `navigator.vibrate(8)` on devices that support it, only for fine-pointer-less presses and only when `jellyMotion` is not `still`.
7. Safety: total frame luminance change per flash is capped; the existing flash ledger decides whether a flash may occur; every effect scales with the arc intensity and the `calm` setting.

**Tests:** the pure helpers (dispersion offsets monotonic in distance, refraction displacement bounded and zero outside hosts, impact timeline monotonic and bounded, luminance cap), the ledger still refusing a fourth onset within 1 s, nothing scheduled at rest, teardown removes canvas and nudge properties.

### Task 10: Globe drift only when the globe is engaged, plus Task 7's deferred fixes

After Task 7 (PR #1480) the globe's WebGL and readbacks run in workers. What remains on the main thread is the docked globe's DOM pin drift and the 2D cage at the ENGAGED rate: `components/radial/LiquidGlobe.tsx` treats ANY `pointermove` / `pointerdown` / `keydown` / `wheel` in the window (`lastInputAt`, the `onInput` listeners near line 1278) as "someone is here", so for an active user the ambient tick runs at 60 Hz for `IDLE_AFTER_MS` (20 s) after every input, anywhere on the page. Measured in the software-GL harness: ~255 ms/s of main-thread time while engaged versus 85–158 ms/s at the 30 Hz idle floor. The reviewer's recommendation (accepted): cut the engaged drift first; only if that is not enough, move the dough sim and the cage into the worker.

**Files:** `components/radial/LiquidGlobe.tsx`, `lib/jelly/ambient-tick.ts` and `lib/jelly/tiers.ts` (read-only unless a constant belongs there), `components/radial/globe-worker.ts`, `globe-worker-host.ts`, `globe-protocol.ts`, `components/globe-cursor/*`, `lib/globe-cursor/*`, `lib/__tests__/globe-off-main-thread.test.ts`, `lib/__tests__/raf-loop-allowlist.test.ts`, `features/slice-it/engine/editor/lint.worker.ts` (stale comment), tests next to each.

**Decisions:**
1. **Engaged means engaged WITH THE GLOBE.** The 60 Hz engaged rate applies only while the pointer is over (or within a small margin of) the globe or its dock, while a press / drag / hold on it is active, while keyboard focus is inside the dock or open hub, and for a short settle (about 1.5 s, not 20 s) after any of those so a release can finish its spring. Input elsewhere on the page (moving over cards, scrolling, typing in a field) NO LONGER raises the globe's rate. Everything else runs at the existing idle floor (30 Hz on desktop, handheld as today). `still`, hidden, unfocused and the degraded tiers are unchanged (nothing scheduled).
2. The coat in the worker uses the same rule: the host posts the engaged state change (edge-triggered, de-duplicated by the existing slack logic), not window-wide input timestamps.
3. Keep the visual: pins and cage still drift (nothing freezes); only the rate while the user is elsewhere changes. State the rates you chose as named constants next to `IDLE_AFTER_MS` use, with the reasoning.
4. Do NOT move the dough sim or the cage into the worker in this task unless the measurement below still misses the target after the rate change; if it does, stop and report with numbers.

**Acceptance (measure with the harness scripts under `/tmp/claude-0/-home-user-rmhstudios-com/d7a40218-f807-5b6f-8aec-c3c3b43927c8/scratchpad/live-*.cjs`, adapted to a local production build, spoofed full tier, software GL, medians of at least 4 runs):** main-thread TaskDuration with the pointer moving over page cards (the globe NOT hovered) stays at or below the idle-floor figure (about 85–158 ms/s) instead of ~255; hovering the globe still reaches the 60 Hz interactive rate and the springs/dent look unchanged (screenshots); no long tasks at rest.

**Deferred minors from the Task 7 review to fix here (each with a test where it is testable):**
- The static guard in `lib/__tests__/globe-off-main-thread.test.ts` must also catch dynamic imports of the render modules: extend the regex to `import\(\s*['"][^'"]*(jelly-glass|self-evert-skin)`.
- The rAF-allowlist exemption (`usesRaf` in `lib/__tests__/raf-loop-allowlist.test.ts`) must not be keyed on the `/// <reference lib="webworker" />` directive alone: require that the file is the target of a `new Worker(new URL('./<name>', import.meta.url)` call somewhere in the repo AND contains no `document.` / `window.`.
- A skin-only WebGL context loss must reach the page: from the worker's skin `onLost` post `{ type: 'skin', ok: false }` (and handle it in the host) so the resting glass is not faded under a skin that draws nothing.
- Replace the unmount cleanup's call to `host.skinCanvas(...)` (it can start a skin) with a side-effect-free getter.
- Remove per-frame allocations on the freed thread: preallocate the 12-element array in `drawCoat` and the `Array.from(DM)` copy per skin frame, avoid `field.slice()` per dough version where a transfer or reuse is safe, and stop `coatClockState()` allocating and calling `document.hasFocus()` every busy frame.
- Close the worker's copy of the full-page scene bitmap right after `setScene` uploads it.
- Narrow inbound worker messages defensively (ignore null / non-object / unknown `type`).
- Fix the misleading comment near the "let the frame loop send this mount's first surface" line, and the stale comment in `features/slice-it/engine/editor/lint.worker.ts` lines 12–16 about the webworker lib reference.
- Cursor: release the shared remote GL (`acquireRemoteGlobeGl`) when switching to trail / sparkle modes, and add a protocol version field plus the shared `FrameCoalescer` instead of the duplicated in-flight logic if it is a small change; otherwise note it.
