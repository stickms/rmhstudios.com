# Plasmatic Jelly completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the Plasmatic Jelly UI overhaul on `main`: dark Plasma look by default, Geist type, the last private animation loop moved onto the shared frame driver, and every remaining hand-rolled surface, dialog and switch converted, shipped as independent PRs that never need rebasing on each other.

**Architecture:** The material, physics and gates already exist (`lib/jelly/`, `lib/liquid/glass/`, `app/jelly-*.css`, `lib/__tests__/jelly-*.test.ts`). This plan only closes the gaps the contract names. PR 0 splits the coverage ratchet's single baseline JSON into one file per directory, so each later PR touches only its own shard and the PRs merge in any order. PRs A–C branch from `main`; PRs D1–D4 branch from PR 0's branch.

**Tech Stack:** TanStack Start, React 19, TypeScript strict, Tailwind v4, Vitest (node environment, no React testing library), pnpm 10, Node 24.21.0.

**Spec:** `CLAUDE.md` → "Design system: Plasmatic Jelly" and `docs/plasmatic-jelly-system.md` (the contract; it wins over older docs). Owner decisions of 2026-10-23: keep `main`'s jelly behaviour as merged (hover softness, moving haze, ambient arcs stay); make the dark theme the default.

## Global Constraints

- Node `24.21.0`, pnpm `10` (CI: `.github/actions/setup-deps/action.yml`). On this machine: `export PATH="$HOME/tools/node-v24.21.0-win-x64:$PATH"` and `corepack pnpm`.
- Every commit passes `pnpm check:consistency` (the commit gate; `.claude/hooks/commit-gate.sh` runs it on `git commit`). Never `--no-verify`, never `RMH_SKIP_COMMIT_GATE=1`.
- Before pushing a branch: `pnpm check:consistency --base main`, `pnpm exec tsc --noEmit`, `pnpm lint` (no new warnings), and the tests named in the task.
- One PR per section below, one branch each, pushed to `origin` (`stickms/rmhstudios.com`). Never push to `main`; a push to `main` deploys production. Implementers push their branch; "open the PR" below means the controller hands the owner a prefilled compare link (no `gh` CLI on this machine).
- Allowlists and baselines in `lib/__tests__/` are one-directional: entries come out in the same commit that fixes them; nothing is added.
- All colours, radii and fonts through tokens; surfaces through role classes (`.glass-fill` / `-pane` / `-chrome` / `-overlay` / `-inset`); dialogs through `components/ui/dialog.tsx`, switches through `components/ui/switch.tsx` (`Switch({ checked, onCheckedChange, disabled, id, className, aria-* })`).
- No new `requestAnimationFrame` or window pointer listener outside `lib/jelly/frame.ts` (`drive(fn, { order })`) and `lib/jelly/pointer.ts` (`onJellyPointer(type, handler)`).
- Strings through `t("key", { defaultValue })`; a PR commits only the `locales/en/<namespace>.json` files of the namespaces it touched (keeps PRs from conflicting in `locales/`).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`; PR bodies end with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.

## Review Focus

1. **Returning visitors keep their theme.** A stored `rmh-style=default` must still render Daylight after the default flips; only visitors with no (or an invalid) stored style get Midnight. Test in PR A.
2. **No white flash for new visitors.** The pre-paint script must paint `#000000` and add `style-graphite` before first paint on an empty `localStorage`. Test in PR A.
3. **Non-Latin locales still render.** `ar`, `ur`, `zh` and Cyrillic locales need glyphs Geist lacks; the font stacks must keep the system and Inter fallbacks after Geist. Test in PR B.
4. **A drag unmounted mid-settle leaks nothing.** `useFluidDrag` must stop its frame driver and pointer subscriptions on unmount, and two concurrent drag surfaces (a sheet and a swipe row) must not cancel each other. Test in PR C.
5. **Converted game dialogs keep their game semantics.** Pause and how-to-play menus must still pause, close on Escape, and return focus; a Radix dialog must not steal pointer lock or keyboard input from a running play-field. Checked by hand in PR D4; the conversion keeps each game's existing open/close state.

---

## PR 0: Shard the jelly coverage baseline (prerequisite for D1–D4)

Branch `jelly/coverage-shards` from `main`.

### Task 0.1: One baseline file per directory

**Files:**

- Modify: `lib/__tests__/jelly-coverage.test.ts` (baseline load, `lower`/`freeze` write)
- Delete: `lib/__tests__/jelly-coverage.baseline.json`
- Create: `lib/__tests__/jelly-coverage.baseline/<shard>.json` (generated)
- Modify: `scripts/codemods/jelly-roles.mjs` (header comment only, if it names the old path)
- Create: `docs/superpowers/plans/2026-10-23-plasmatic-jelly-completion.md` (this plan)

**Interfaces:**

- Produces: `shardOf(file: string): string` exported from `lib/__tests__/jelly-coverage.test.ts`'s sibling `lib/__tests__/jelly-coverage-shards.ts`:
  `app/routes/<x>/…` → `app-routes-<x>`; `app/<file>` → `app`; `components/<x>/…` → `components-<x>`. Each shard file has the same shape as today's JSON (`{ surfaces, dialogs, switches }`), each map sorted by key, files with no debts omitted, no empty shard files.
- Later PRs edit only their own shard files and lower them with `JELLY_COVERAGE_BASELINE=lower`.

- [ ] **Step 1: Write the failing test** in `lib/__tests__/jelly-coverage-shards.test.ts`:

```ts
import { shardOf } from './jelly-coverage-shards';
it.each([
  ['app/routes/rmhbox/index.tsx', 'app-routes-rmhbox'],
  ['app/routes/rmhbox/minigames/$minigameId/history.tsx', 'app-routes-rmhbox'],
  ['components/rmhbox/minigames/rhyme-time/RhymeTimeInput.tsx', 'components-rmhbox'],
  ['components/ui/slider.tsx', 'components-ui'],
])('%s → %s', (file, shard) => expect(shardOf(file)).toBe(shard));
it('the totals survive the split', () => {
  // 93 surfaces, 37 dialogs, 9 switches on main@9fd99f96 (lower if main has already lowered them)
});
```

The second test loads every shard and asserts the summed counts equal the counts the gate measures on the current tree.

- [ ] **Step 2: Run it.** `pnpm exec vitest run lib/__tests__/jelly-coverage-shards.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement `shardOf`** in `lib/__tests__/jelly-coverage-shards.ts`, and change `loadBaseline()` to merge every `*.json` under `lib/__tests__/jelly-coverage.baseline/`. The `lower`/`freeze` branch writes each shard separately (sorted keys, trailing newline, deleting a shard file that becomes empty).
- [ ] **Step 4: Generate the shards.** Run `JELLY_COVERAGE_BASELINE=freeze pnpm exec vitest run lib/__tests__/jelly-coverage.test.ts` once, `git rm` the old JSON, and diff the summed counts against the old file (they must match exactly).
- [ ] **Step 5: Run** `pnpm exec vitest run lib/__tests__/jelly-coverage.test.ts lib/__tests__/jelly-coverage-shards.test.ts` and `pnpm check:consistency`. Expected: PASS.
- [ ] **Step 6: Commit** `test(jelly): shard the coverage baseline per directory so area PRs never conflict`, push `jelly/coverage-shards`, open the PR (title the same; body says it must merge before D1–D4).

---

## PR A: Midnight is the default theme

Branch `jelly/dark-default` from `main`.

### Task A.1: Flip the default and pin both visitor paths

**Files:**

- Modify: `stores/themeStore.ts` (`DEFAULT_STYLE`, the comments that say Daylight is the default)
- Modify: `lib/__tests__/fouc-contract.test.ts` (new cases)
- Modify: `docs/design-language.md` §theme table (~line 391) and `components/CLAUDE.md` checklist wording if it calls Daylight the default

**Interfaces:**

- Consumes: `DEFAULT_STYLE`, `THEME_BG` from `stores/themeStore.ts`; `buildThemeScript(siteTier: boolean)` in `app/routes/__root.tsx` (unchanged).
- Produces: `DEFAULT_STYLE: SiteStyle = 'graphite'`.

- [ ] **Step 1: Write the failing tests** in `lib/__tests__/fouc-contract.test.ts`, executing the real `buildThemeScript` body the way the existing case does, but with the REAL `THEME_BG` and `DEFAULT_STYLE` imported from `@/stores/themeStore`:
  - `new visitor lands on Midnight with no flash`: empty storage → `classes.has('style-graphite')`, `html.style.backgroundColor === '#000000'`, `localStorage.setItem` not called.
  - `a stored Daylight choice survives`: `rmh-style=default` → no `style-*` class, background `#ffffff`.
  - `an invalid stored style heals to Midnight`: `rmh-style=sepia` → `rmh-style` rewritten to `graphite`, class `style-graphite`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/__tests__/fouc-contract.test.ts`. Expected: the first and third FAIL.
- [ ] **Step 3: Set `DEFAULT_STYLE = 'graphite'`** and rewrite the two comments in `stores/themeStore.ts` that call Daylight the default. Keep the existing `'default'` mock in the old test case untouched.
- [ ] **Step 4: Run** the fouc test, `pnpm exec vitest run lib/__tests__` filtered to `theme`, then `pnpm check:consistency`. Expected: PASS.
- [ ] **Step 5: Update the docs** (theme table row: Midnight is the site default for new visitors; Daylight stays the default for anyone who chose it) and commit `feat(theme): Midnight is the default for new visitors`. Push and open the PR.

---

## PR B: Geist and Geist Mono

Branch `jelly/geist` from `main`.

### Task B.1: Self-host Geist and lead the font tokens with it

**Files:**

- Modify: `package.json`, `pnpm-lock.yaml` (`@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `^5`)
- Modify: `app/globals.css` (`--font-geist`, `--font-geist-mono`; `--site-font-display`/`-body`/`-mono` on `:root`)
- Modify: `app/routes/__root.tsx` (preload the Latin Geist woff2, like `interLatinWoff2`)
- Modify: `scripts/gen-self-hosted-fonts.ts` (Geist Mono as a self-hosted face, `font-display: optional`), regenerate `app/fonts/*.css` with `pnpm fonts:generate`
- Modify: `docs/plasmatic-jelly-system.md` §10 status note (Geist is live)
- Create: `lib/__tests__/site-fonts.test.ts`

**Interfaces:**

- Produces: `--font-geist: 'Geist Variable', 'Geist', <metric fallback if added>, sans-serif;` `--font-geist-mono: 'Geist Mono', monospace;`
  `--site-font-display` and `--site-font-body` = `var(--font-geist), -apple-system, BlinkMacSystemFont, 'SF Pro Text', var(--font-inter), system-ui, sans-serif`;
  `--site-font-mono` = `var(--font-geist-mono), var(--font-jetbrains-mono), 'SF Mono', 'Cascadia Code', monospace`.
  Body Geist loads like Inter (`@import '@fontsource-variable/geist/wght.css'`, `swap`); Geist Mono is self-hosted with `optional`.

- [ ] **Step 1: Write the failing test** `lib/__tests__/site-fonts.test.ts`, reading `app/globals.css` as text and extracting the first `:root` declarations of the three tokens:
  - each of display/body starts with `var(--font-geist)` and still contains `system-ui` and `var(--font-inter)` (non-Latin fallback);
  - mono starts with `var(--font-geist-mono)` and still contains `var(--font-jetbrains-mono)`;
  - `app/routes/__root.tsx` imports a `geist-latin-wght-normal.woff2?url` and renders it as a `preload`.
- [ ] **Step 2: Run** `pnpm exec vitest run lib/__tests__/site-fonts.test.ts`. Expected: FAIL.
- [ ] **Step 3: Add the packages** (`corepack pnpm add @fontsource-variable/geist@^5 @fontsource-variable/geist-mono@^5`; confirm both resolve with `corepack pnpm view @fontsource-variable/geist version` first, and stop and report if either does not exist). Then the CSS tokens, the preload, the generator entry, and `pnpm fonts:generate`.
- [ ] **Step 4: Run** the font test, `pnpm fonts:check`, `pnpm exec vitest run lib/__tests__/fouc-contract.test.ts`, `pnpm check:consistency`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(type): Geist and Geist Mono lead the site font stacks`. Push and open the PR.

---

## PR C: useFluidDrag on the shared frame driver and pointer hub

Branch `jelly/fluid-drag-frame` from `main`.

### Task C.1: Replace the private rAF and window listeners

**Files:**

- Modify: `hooks/useFluidDrag.ts` (its settle loop and `pointermove/up/cancel` window listeners)
- Modify: `lib/__tests__/raf-loop-allowlist.test.ts` (remove `hooks/useFluidDrag.ts` from the allowlist and its comment block at ~line 158)
- Modify: `lib/__tests__/jelly-ownership.test.ts` only if a pointer-listener allowlist names `useFluidDrag` (the service-import entry at ~line 99 stays: it still calls `reportJellyDrag`)
- Create: `hooks/fluid-drag-settle.ts`, `hooks/__tests__/fluid-drag-settle.test.ts`

**Interfaces:**

- Consumes: `drive(fn: (now, dt) => boolean | void, { order })` → `FrameDriver { wake(), awake, stop() }` from `@/lib/jelly/frame`; `createFrameLoop(fakeWindow)` for tests; `onJellyPointer(type, handler): () => void` from `@/lib/jelly/pointer`.
- Produces: `createSettle(opts: { order?: number; drive?: typeof drive }): { start(from: number, velocity: number, to: number, onStep: (x: number) => void, onDone: () => void): void; cancel(): void; dispose(): void }` in `hooks/fluid-drag-settle.ts`, the spring maths taken unchanged from the current hook (same `lib/fluid.ts` spring), at `order: 15`.
  `useFluidDrag`'s public `FluidDragOptions` / `FluidDragHandle` are unchanged.

- [ ] **Step 1: Write the failing tests** in `hooks/__tests__/fluid-drag-settle.test.ts` with `createFrameLoop` over a fake window whose `requestAnimationFrame` queues callbacks you advance by hand:
  - `settles to the target and stops requesting frames`: after enough frames `onDone` fires once and the fake window has no pending callback;
  - `dispose mid-settle stops the driver`: after `dispose()` no further `onStep` and no pending frame;
  - `two settles run independently`: cancelling one does not stop the other.
- [ ] **Step 2: Run** `pnpm exec vitest run hooks/__tests__/fluid-drag-settle.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement `createSettle`**, then rewire `useFluidDrag` to use it and `onJellyPointer('pointermove' | 'pointerup' | 'pointercancel', …)` in place of `window.addEventListener`, disposing both on unmount. Remove the allowlist entry and its comment.
- [ ] **Step 4: Run** the new test, `pnpm exec vitest run lib/__tests__/raf-loop-allowlist.test.ts lib/__tests__/jelly-ownership.test.ts`, `pnpm check:consistency`. Expected: PASS. Then by hand in `pnpm dev`: drag a sheet (`components/ui/dialog.tsx` mobile sheet) and a swipe row, both still settle.
- [ ] **Step 5: Commit** `refactor(jelly): useFluidDrag drives the shared frame loop and pointer hub`. Push and open the PR.

---

## PRs D1–D4: Convert the remaining surfaces, dialogs and switches

Each branches from `jelly/coverage-shards` (PR 0) and touches only its own directories and shard files. Per PR, the same three-step loop runs for each directory in its list:

1. `node scripts/codemods/jelly-roles.mjs --write <dir>` (safe rewrites), then fix by hand every site it printed: raw `<button>` surfaces become `<Button>`, a lone panel becomes `.glass-pane`, floating UI `.glass-overlay`, fields `.glass-inset`. Raw `role="dialog"` becomes `Dialog`/`DialogContent` from `components/ui/dialog.tsx`, keeping the component's existing open state and close handlers; raw `role="switch"` becomes `Switch`.
2. `JELLY_COVERAGE_BASELINE=lower pnpm exec vitest run lib/__tests__/jelly-coverage.test.ts`; the PR's shard files must end at zero (deleted) or with each remaining entry explained in the PR body.
3. `pnpm exec vitest run lib/__tests__/jelly-coverage.test.ts lib/__tests__/design-consistency.test.ts`, `pnpm check:consistency`, and a manual look in Midnight, Daylight and high contrast at phone and desktop width.

The test for each PR is the ratchet itself: its shard counts go down and the gate passes.

### Task D1: RMHBox (branch `jelly/coverage-rmhbox`)

Directories: `components/rmhbox/**`, `app/routes/rmhbox/**`. Debts: about 60 surfaces and 4 switches (`GameSettingsForm.tsx`, `HostControls.tsx`). Shards: `components-rmhbox.json`, `app-routes-rmhbox.json`. Play-fields keep `data-jelly-zone="playfield"`; only chrome, results, inputs and lobbies convert.

### Task D2: Apps (branch `jelly/coverage-apps`)

Directories: `components/rmhtube/**`, `components/rmhtype/**`, `components/rmhstudy/**`, `components/rmhcoins/**`. Debts: about 15 surfaces, the RMHTube dialogs (`SettingsPanel`, `SyncStatus`, `party/WatchPartyPanel`) and switch (`SettingsPanel`). These use the `--app-*` tier: surfaces take `.app-glass` (the app adapter in `components/shared/app-theme.css`), not the site roles.

### Task D3: Site and shared (branch `jelly/coverage-site`)

Directories: `components/feed`, `components/calendar`, `components/daily-puzzles`, `components/reading`, `components/replays`, `components/shared`, `components/site`, `components/radial`, `components/library`, `components/call`, `components/ui` (`resizable.tsx`, `slider.tsx` only; primitives own their roles). Debts: the remaining site surfaces, dialogs in `feed/` (`AIImageButton`, `ComposeModal` ×2, `ImageCropModal`, `MusicGuessColumn`, `PostImageGrid`), `shared/` (`SaveConflictDialog`, `SignInRequiredDialog`), `site/` (`CookieConsent` ×2, `NotificationsPopover`), `radial/` (`QuickPanel`, `RadialHub`), `reading/` (`InlinePopover`, `ReadingRuler`), `library/` (four), `call/CallOverlay`, and the `radial/QuickPanel` switch. A popover that is not modal (`NotificationsPopover`, `InlinePopover`) moves to the existing `components/ui/menu.tsx` / `anchored-menu.tsx` primitive, not `Dialog`.

### Task D4: Games (branch `jelly/coverage-games`)

Directories: `components/bums-rush`, `components/cookgame`, `components/cursed-logic`, `components/dream-rift`, `components/dunesday`, `components/gabriels-horn`, `components/games`, `components/pf2ecal`, `components/temple-of-joy`, `components/massive-march`, `components/globe-cursor`. Debts: 17 dialogs and 6 switches. Full-screen tier: keep each game's palette (`--app-*`), keep pause/resume wiring in the game's own state, and verify Escape, focus return and pointer lock by hand (Review Focus 5). Where `Dialog` cannot host a window that is part of the game's fiction (`dunesday/os/Window.tsx`, `Taskbar.tsx`, `StartMenu7.tsx`), leave the entry in the shard and say why in the PR body; that is an explained debt, not a regression.

---

## Execution order

1. PR 0, A, B and C start in parallel (four Sonnet subagents, one worktree each).
2. D1–D4 start as soon as PR 0's branch is pushed (four more subagents), each branching from `jelly/coverage-shards`.
3. Merge order on GitHub: PR 0 first, then anything else in any order. No PR touches another's files, so none needs a rebase.
