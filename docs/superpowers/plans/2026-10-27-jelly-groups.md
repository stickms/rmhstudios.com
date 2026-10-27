# Jelly Groups Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On the main site and shared UI, clusters of related controls become one jelly parent with flat members (selected tab = flat feathered glow), and the audit of every such cluster is recorded.

**Architecture:** A new `JellyGroup` primitive (CSS + attributes only; members opt out of the per-control body with `data-jelly="off"`, so the parent takes the press). `LiquidTabs` swaps its raised thumb for a flat glow on the main site while the app tier keeps the thumb. No engine change (`lib/liquid/glass/*`, `lib/jelly/*` untouched).

**Tech Stack:** React 19, Tailwind v4 token utilities, CVA, framer-motion (`layoutId` morph already in `LiquidTabs`), vitest (`renderToStaticMarkup` for component output, file-reading contract tests for CSS).

**Spec:** `docs/superpowers/specs/2026-10-27-jelly-groups-design.md` (read its "Resolutions" section; it overrides the body where they differ).

## Global Constraints

- Scope is the main site + shared UI. Do not edit game/app dirs except to add `appearance="thumb"` to a `LiquidTabs` call (Task 4). The app tier keeps the raised thumb.
- No new CI gate, lint rule, or consistency-test rule. Existing tests must stay green; change a test only if it encodes the old thumb, and say so in the commit.
- No `backdrop-filter`, box-shadow, `infinite` keyframe, per-component pointer loop, or animated root custom property (CLAUDE.md §4). Glow = `radial-gradient` of `--site-accent` at `--row-glow-strength` fading to transparent, opacity transition only.
- Controls are jelly bodies by default; a flat member must carry `data-jelly="off"`.
- Radii concentric in 8px steps; a group keeps the outer size of the cluster it replaces (members shrink by the inset, default 4px); touch target stays `--site-touch-target` (44px coarse).
- Tokens only (`--site-*`), motion from `lib/motion.ts`, strings through `t()` + `pnpm i18n:extract`, `data-slot` on new primitives, lucide icons.
- High contrast / forced colors keep a filled-accent selected cue (existing `.style-high-contrast` and `forced-colors` rules).
- Commit trailers on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` and `Claude-Session: https://claude.ai/code/session_01TQ742wXop19eTBar4WikYy`. Run `pnpm check:consistency` before each commit; a failing gate is fixed, not bypassed.
- Work on branch `claude/jelly-groups`, created from `claude/jelly-groups-design`.

## Review Focus

- A group with one member, or a disabled member: no glow on a disabled member, no crash with one child.
- `JellyGroup.Item asChild` around a `<Link>`/Radix trigger still gets `data-jelly="off"` and shows selection from `aria-current`.
- RTL (`dir="rtl"`): tab glow morph and edge fades land on the logical sides; items order follows the document.
- High contrast and forced colors: a selected tab/item is still distinguishable (filled accent), with legible ink.
- Overflowing tab strip on a 320px viewport: still one scrolling row, active tab revealed, edge fade intact.

---

### Task 1: `JellyGroup` primitive

**Files:**
- Create: `components/ui/jelly-group.tsx`, `components/ui/jelly-group.css`
- Modify: the stylesheet that imports `components/ui/anchored-menu.css`/`dialog.css` (grep for `anchored-menu.css` imports) to import `jelly-group.css` the same way
- Test: `components/ui/__tests__/jelly-group.test.tsx`

**Interfaces:**
- Produces: `JellyGroup` (parent) and `JellyGroup.Item`, `JellyGroup.Divider`.
  - `JellyGroup(props: { surface?: 'chrome' | 'pane' | 'fill'; size?: 'sm' | 'default'; orientation?: 'horizontal' | 'vertical'; className?: string; children: React.ReactNode } & React.HTMLAttributes<HTMLDivElement>)`, renders `<div data-slot="jelly-group" data-size data-orientation className="glass-<role> ...">`; default `surface="fill"` (renamed from `role`: it collides with the HTML attribute and trips jsx-a11y/aria-role).
  - `JellyGroup.Item(props: { selected?: boolean; asChild?: boolean } & React.ButtonHTMLAttributes<HTMLButtonElement>)`, renders `<button type="button" data-slot="jelly-group-item" data-jelly="off" data-evert="" data-selected={selected || undefined} aria-pressed={selected}>`; with `asChild` uses Radix `Slot` and forwards the same attributes. `aria-pressed` is omitted when `asChild` (the child supplies `aria-current`/`aria-selected`).
  - `JellyGroup.Divider()`: `<span data-slot="jelly-group-divider" aria-hidden />`.
  - CSS contract: item radius `max(0px, calc(var(--site-control-radius) - var(--jelly-group-inset, 0.25rem)))`; hover/focus/selected paint the feathered glow on `::before` (`data-evert` layer), selected strength `calc(var(--row-glow-strength, 20%) * 1.6)`; `.style-high-contrast` and `@media (forced-colors: active)` selected = filled accent with `--site-accent-fg` / `HighlightText`.

- [ ] **Step 1: Write the failing test** in `components/ui/__tests__/jelly-group.test.tsx` using `renderToStaticMarkup`: (a) a group with two items renders `data-slot="jelly-group"` with class containing `glass-fill`; `role="chrome"` gives `glass-chrome`; (b) each item carries `data-jelly="off"` and `data-evert`; (c) `selected` item has `data-selected` and `aria-pressed="true"`, an unselected one `aria-pressed="false"`; (d) `asChild` around `<a href="/x" aria-current="page">` renders an `<a>` with `data-jelly="off"` and no `aria-pressed`; (e) a group with one child renders without throwing; (f) a `disabled` item has no `data-selected` even if `selected` is passed.
- [ ] **Step 2: Run it to verify it fails.** Run: `pnpm exec vitest run components/ui/__tests__/jelly-group.test.tsx`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** `jelly-group.tsx` and `jelly-group.css` to the interface above, using `cn()` and Radix `Slot` (already used by `button.tsx`). Selected glow reuses the row-glow recipe from `globals.css` §7.3 (`radial-gradient(ellipse closest-side at 50% 50%, color-mix(in srgb, var(--site-accent) <strength>, transparent), transparent)`).
- [ ] **Step 4: Run the test to verify it passes.** Same command. Expected: PASS.
- [ ] **Step 5: Add `JellyGroup` to the primitives table in `docs/design-language.md` (§5 table near `Badge`/`NotificationBadge`), run `pnpm check:consistency`, commit** (`Add JellyGroup: one jelly parent with flat members`).

### Task 2: Top bar members are flat

**Files:**
- Modify: `components/radial/RadialShell.tsx` (the `RadialTopBar` JSX), `components/radial/radial.css` (`.radial-topbar__btn`, `__signin`, `__avatar`, around lines 363-450)
- Test: `components/radial/__tests__/topbar-flat.test.ts` (file-reading contract test)

**Interfaces:**
- Consumes: the `data-jelly="off"` + `data-evert` member contract from Task 1 (the bar keeps `glass-chrome` and is the only body).
- Produces: none.

- [ ] **Step 1: Write the failing test** that reads `RadialShell.tsx` and asserts: no `data-fluid-press` attribute remains inside `RadialTopBar`; every `radial-topbar__btn`, `radial-topbar__signin` and `radial-topbar__avatar` element carries `data-jelly="off"`; the `<header>` still has `glass-chrome` and does not.
- [ ] **Step 2: Run it** (`pnpm exec vitest run components/radial/__tests__/topbar-flat.test.ts`). Expected: FAIL.
- [ ] **Step 3: Edit** `RadialTopBar`: replace each member's `data-fluid-press=""` with `data-jelly="off"`, keep `data-evert`. In `radial.css` make `.radial-topbar__btn` and `.radial-topbar__signin` flat (no border, transparent fill, hover = existing `data-evert` wash; selected/`aria-expanded` = the Task 1 glow, not `--site-surface-active`). The Sign in link keeps its accent hover. Height of the bar (`--rad-topbar-h`) and 44px targets do not change.
- [ ] **Step 5: Run the test** (PASS), then look at the bar in the dev app at 390px and 1280px in Daylight, `.style-graphite` and `.style-high-contrast` with Chromium screenshots (see Task 7 for how); confirm no per-button rim.
- [ ] **Step 6: `pnpm check:consistency`, commit** (`Top bar: buttons are flat members of the bar's jelly body`).

### Task 3: `LiquidTabs` selected tab is a flat glow (main site)

**Files:**
- Modify: `components/ui/liquid-tabs.tsx`, `app/globals.css` (the tab block around lines 6225-6360), `app/jelly-coverage.css` (§6 around line 329), `lib/__tests__/` only if an existing assertion encodes the raised thumb
- Test: `components/ui/__tests__/liquid-tabs.test.tsx`

**Interfaces:**
- Produces: new optional prop `appearance?: 'glow' | 'thumb'` on `LiquidTabs` (default `'glow'`), emitted as `data-tab-appearance` on the `data-slot="liquid-tabs"` strip. API otherwise unchanged (`tabs`, `value`, `onChange`, `renderTab`, `idBase`, `iconOnly`, `sheet`).
- CSS contract: glow rules are scoped `html:not(.app-route) [data-slot='liquid-tabs']:not([data-tab-appearance='thumb']) [data-tab-thumb]` → `border: 0; background-image: none; box-shadow: none; background: radial-gradient(...feathered accent glow...)`. The existing thumb rules (globals.css `[data-tab-thumb]`, jelly-coverage §6, `--tab-thumb-*` vars from `app-theme.css`/`slice-it.css`) remain untouched for `html.app-route` and `appearance="thumb"`. The `data-tab-capsule` / `data-tab-thumb` elements and the `layoutId` morph are kept, so ink logic and `jelly-coverage.test.ts` (`[data-tab-thumb]` has a rule) still hold. Tab items drop `data-fluid-press` (tablist and link mode) and use `data-jelly="off"` in glow mode; thumb mode is unchanged.

- [ ] **Step 1: Write the failing test** (`renderToStaticMarkup`): default `LiquidTabs` renders `data-tab-appearance="glow"` and its tab buttons have `data-jelly="off"` and no `data-fluid-press`; `appearance="thumb"` renders `data-tab-appearance="thumb"` and keeps `data-fluid-press`; the active tab has `aria-selected="true"`; link mode (`renderTab`) passes `aria-current="page"` to the active item; a file-reading assertion that `globals.css` still contains a `.style-high-contrast [data-slot='liquid-tabs']` rule setting `--tab-thumb-bg: var(--site-accent)`.
- [ ] **Step 2: Run** `pnpm exec vitest run components/ui/__tests__/liquid-tabs.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the prop, attribute, per-item attribute switch, and the scoped CSS. Sheet (`liquid-tabs-sheet`) is left as is. Glow text ink stays `--tab-thumb-ink` (full-strength text), 4.5:1 in all three themes.
- [ ] **Step 4: Run the test and the existing suites** `pnpm exec vitest run components/ui lib/__tests__/jelly-coverage.test.ts lib/__tests__/design-consistency.test.ts lib/__tests__/jelly-legibility.test.ts`. Expected: PASS.
- [ ] **Step 5: Screenshot `/apps` at 390px and 1280px in the three themes and with jelly motion `still`, plus `/jelly`; confirm the selected tab is a soft flat glow with no rim, and that `/slice-it` still shows its raised thumb. `pnpm check:consistency`, commit** (`LiquidTabs: flat glow for the selected tab on the main site; app tier keeps the thumb`).

### Task 4: App-tier `LiquidTabs` consumers keep the thumb

**Files:**
- Modify: only the game/app `LiquidTabs`/`PageTabs` call sites on routes that `html.app-route` does not reach.

- [ ] **Step 1: List consumers.** Run `grep -rln "LiquidTabs" components app --include=*.tsx` and keep the files under game/app dirs (known: `components/slice-it/{editor/DifficultyTabs,SongLibrary}.tsx`, `laundry-sort/hud/*`, `rmhtube/party/WatchPartyPanel.tsx`, `rmhtype/SoloSourcePicker.tsx`, `daily-puzzles/*`, `versecraft/SeedGallery.tsx`, `neon-driftway/LiveryEditor.tsx`, `app/routes/rmhcode/index.tsx`, `components/shared/EmojiPickerPanel.tsx`).
- [ ] **Step 2: For each, find the route(s) that render it** and check that route's path prefix is in `THEME_EXCLUDED_ROUTES` (read `lib/theme*`/the constant imported by `app/routes/__root.tsx`). `components/shared/EmojiPickerPanel.tsx` is also used on the main site, so it is classified by where it renders: leave default (glow) unless it is only reachable from app routes.
- [ ] **Step 3: Add `appearance="thumb"`** to each call site not covered by `html.app-route` (and none where it is). Record the checked list in the commit message.
- [ ] **Step 4: Screenshot one covered and one prop-fixed consumer** (e.g. `/slice-it` song library, `/rmhcode`) to confirm unchanged look. Run `pnpm exec tsc --noEmit`, `pnpm check:consistency`, commit (`Games/apps keep the raised tab thumb`).

### Task 5: Audit and convert shared-UI clusters

**Files:**
- Create: `docs/jelly-group-audit.md`
- Modify: files the audit classifies as "group", starting from the known candidates `components/ui/{pagination,selection-bar,horizontal-scroller,search-field,select,menu,anchored-menu}.tsx`, `components/feed/{RMHarkActions,ReactionChips?,ComposeBox,EngagementCount}.tsx`, `components/events/RsvpButton.tsx`, `components/homes/FiltersBar.tsx`, `components/news/NewsCategoryTabs.tsx`, `components/site/FriendsRail.tsx` (verify each exists; the list is a starting point, not the inventory)

**Interfaces:**
- Consumes: `JellyGroup`, `JellyGroup.Item`, `JellyGroup.Divider` (Task 1).

- [ ] **Step 1: Inventory.** Grep the site tier for adjacent pill-styled siblings: `rg -n "rounded-full|--site-control-radius|rounded-site-sm" components/{ui,radial,feed,site,home,profile,settings,messages,news,events,homes,search,lists,communities,spaces,calendar,onboarding} app/routes/_site -g '*.tsx'`, excluding game/app dirs (`components/shared/` is the app tier; leave it). Write every cluster of two or more related controls into `docs/jelly-group-audit.md` as a table: `file:line | cluster | verdict (group / standalone / n-a) | reason`.
- [ ] **Step 2: Apply the tiebreaker from the spec** (convert only if members sit on one row or scroll in one row, are the same kind of control, and are mutually related; wrapping or user-built chips, lone primary actions, avatars, badges and dots stay standalone). Menus/selects/search are verified against the "one slab, plain rows" rule; fix drift only.
- [ ] **Step 3: Convert the shared-UI "group" rows** (`components/ui/*`) to `JellyGroup`. For each conversion keep the original outer size and touch targets, keep keyboard behavior and `aria-*`, route items through `JellyGroup.Item asChild` when they are links.
- [ ] **Step 4: Run** `pnpm exec vitest run components/ui lib/__tests__/design-consistency.test.ts` and `pnpm exec tsc --noEmit`. Expected: PASS, no new type errors.
- [ ] **Step 5: Screenshot each converted component at 390px and 1280px (three themes), `pnpm check:consistency`, commit** (`Shared UI: related controls become jelly groups; add audit`).

### Task 6: Convert page-level clusters

**Files:**
- Modify: the "group" rows of `docs/jelly-group-audit.md` outside `components/ui` (feed, profile, settings, messages, news, events, homes, search, routes under `app/routes/_site`)

- [ ] **Step 1: For each remaining "group" row**, convert to `JellyGroup` (or to `LiquidTabs` if it is really a tab strip, as CLAUDE.md requires), one feature directory per commit. Update the row's verdict to `converted` with the commit short hash.
- [ ] **Step 2: Per feature commit,** run `pnpm exec tsc --noEmit`, `pnpm lint` (no new warnings), `pnpm exec vitest run lib/__tests__/design-consistency.test.ts`, screenshot the affected page at two widths, then `pnpm check:consistency`.
- [ ] **Step 3: Finish the audit doc:** no row left as "group" without `converted`, and every "standalone" row has a reason. Commit (`Pages: related controls become jelly groups`).

### Task 7: Docs and final verification

**Files:**
- Modify: `docs/design-language.md` (the corner-scale/controls paragraph around line 112-125 and §13 pill wording), `CLAUDE.md` and `AGENTS.md` (the identical "controls pills" lines in the Design system section), `docs/plasmatic-jelly-system.md` (a short "groups" note beside the nested-bodies paragraph near line 520)

- [ ] **Step 1: Rewrite the pill statements** to: a cluster of related controls is one jelly body with flat members; a lone control may still be a pill. Mention the app tier keeps its own thumb. Keep `CLAUDE.md` and `AGENTS.md` in sync.
- [ ] **Step 2: Full local pass:** `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm check:consistency --base main`.
- [ ] **Step 3: Visual pass.** Start `pnpm dev` (needs `DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`; run `pnpm db:push` first), then use the pre-installed Playwright Chromium (`require('playwright')`, no install) from a script in the scratchpad directory (not committed) to capture before/after-style shots of `/`, `/apps`, `/games`, `/settings`, `/jelly` at 390px and 1280px with `.style-graphite`/`.style-high-contrast` applied via the theme store, and `/slice-it` as the unchanged control. Save them in the scratchpad and attach them to the PR.
- [ ] **Step 4: Commit docs** (`Docs: groups, not pills`), push `claude/jelly-groups`, open the PR against `main` using `.github/pull_request_template.md` headings, and report what was and was not verified.
