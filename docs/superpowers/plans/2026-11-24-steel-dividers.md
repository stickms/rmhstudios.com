# Steel Dividers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace bordered group boxes on `_site` pages with thin 1px horizontal and vertical rules, through five shared primitives, new plan rules S7 to S11 and a ratcheting gate.

**Architecture:** One stylesheet (`app/styles/steel-rules.css`) defines `.rule-section`, `.rule-cols`, `.rule-cells`, `.rule-notice`, `.rule-defs`; thin React wrappers in `components/ui/rules.tsx` emit those classes. A source-scan test (`lib/__tests__/steel-rules.test.ts`) bans bordered group boxes on site-tier files, with a frozen allowlist that pages leave as they are converted in waves.

**Tech Stack:** TanStack Start, React 19, Tailwind v4, vitest, existing `eslint-local-rules/design-scope.js` (`isSiteTier`).

**Spec:** `docs/superpowers/specs/2026-11-24-steel-dividers-design.md`

## Global Constraints

- Rule colour `--site-border`, width 1px. Exception: S10 notice uses a 2px inline-start rule in `--site-danger` or `--site-success`; the gate exempts `.rule-notice` and nothing else.
- Logical properties only (`border-s`, `border-e`, `ps-`, `pe-`) so `ar` (RTL) mirrors.
- Vertical rules appear by container query (`@container`, threshold `@3xl` for columns, `@xl` for definition rows), never by viewport breakpoint.
- No new colour, no fill, no shadow, no gradient, no motion (R1, R5). Content that arrives late still uses `components/ui/arrive.tsx`.
- Full-screen games and apps (L8) are out of scope. `Card` stays unchanged for the app tier. Scope is `isSiteTier(file)`; imports are not followed.
- Every commit passes `pnpm check:consistency`; allowlists only shrink. `docs/` paths quoted in a gate must exist (`doc-pointers.test.ts`).
- Wave 1 must pass `pnpm -s exec tsx scripts/check-bundle-budget.ts`; if it cannot, the same commit deletes the dead `surface-card` / `surface-panel` rules from the site sheet. Add a row to the ledger in plan section 17.
- Strings through `t()`; new tokens or colours are not allowed. Test Day and Night, 390px and 1280px, and once in `ar`.

## Review Focus

- A `Section` rendered first on a page, or after a `Columns`, must not show a double rule (rule-above only between siblings).
- `Columns` with one child, or with an empty child, renders no stray vertical rule.
- `Cells` with an item count that does not fill the last row leaves no rule on the outer edge and no orphan vertical rule.
- RTL: the vertical rule in `Columns` and `Definitions`, and the `Notice` start rule, sit on the correct side under `dir="rtl"`.
- Scripting off: all five primitives render complete server-side with no hydration dependency.

---

### Task 1: Primitives and stylesheet

**Files:**
- Create: `app/styles/steel-rules.css`
- Create: `components/ui/rules.tsx`
- Create: `components/ui/__tests__/rules.test.tsx`
- Modify: `app/globals.css` (add `@import './styles/steel-rules.css';` after the `steel-surfaces.css` import)

**Interfaces:**
- Produces, all exported from `components/ui/rules.tsx`:
  - `Section(props: { title?: React.ReactNode; id?: string; className?: string; children: React.ReactNode }): JSX.Element` renders `<section class="rule-section">`; when `title` is set, an `<h2 class="t-heading">` and `aria-labelledby`.
  - `Columns(props: { ratio?: '1-1' | '3-2' | '1-1-1'; className?: string; children: React.ReactNode }): JSX.Element` renders `<div class="rule-cols" data-ratio=…>` as an `@container`.
  - `Cells(props: { columns?: 2 | 3 | 4; className?: string; children: React.ReactNode }): JSX.Element` renders `<ul class="rule-cells" data-columns=…>`; children are `<li>`.
  - `Notice(props: { tone: 'danger' | 'success'; children: React.ReactNode; className?: string }): JSX.Element` renders `<div class="rule-notice" data-tone=… role={tone === 'danger' ? 'alert' : 'status'}>`.
  - `Definitions(props: { className?: string; children: React.ReactNode }): JSX.Element` renders `<dl class="rule-defs">`; `Definition(props: { label: React.ReactNode; children: React.ReactNode }): JSX.Element` renders a `<div>` with `<dt class="t-label">` and `<dd class="t-body">`.

- [ ] **Step 1: Write the failing test** in `components/ui/__tests__/rules.test.tsx` using `renderToStaticMarkup`. Assertions: `Section` with a title renders an `h2` with class `t-heading` and `aria-labelledby` pointing at its id; `Columns` renders `class="rule-cols"` and `data-ratio="3-2"` for `ratio="3-2"`; `Cells columns={3}` renders `data-columns="3"` on a `ul`; `Notice tone="danger"` has `role="alert"` and `tone="success"` has `role="status"`; `Definition` renders `dt` before `dd`. Also pin the Review Focus cases: `Columns` with one child renders no `data-ratio` grid class beyond `rule-cols`; `rules.css` has a `:first-child` reset on `.rule-section` and no vertical rule rule outside an `@container` block; `Cells` items carry no `border` on the outer edge selectors; `renderToStaticMarkup` output of every primitive is complete HTML with no `use client` dependence. Also read `app/styles/steel-rules.css` and assert it contains no `gradient`, `shadow`, `blur`, `transition`, `animation` and no `border-left`, `border-right`, `margin-left`, `padding-right` (logical properties only).
- [ ] **Step 2: Run** `pnpm exec vitest run components/ui/__tests__/rules.test.tsx`. Expected: FAIL (module and stylesheet missing).
- [ ] **Step 3: Implement the stylesheet.** Values: `.rule-section` is `border-block-start: 1px solid var(--site-border)`, `padding-block-start: 1.5rem`, `margin-block-start: 1.5rem`, and `:first-child` drops all three; `.rule-cols` sets `container-type: inline-size`, stacks with a `border-block-start` rule between children, and at `@container (min-width: 48rem)` becomes a grid (`data-ratio` picks `3fr 2fr`, `1fr 1fr`, `1fr 1fr 1fr`) with `border-inline-start` + `padding-inline-start: 1.5rem` on every child but the first and no block rule; `.rule-cells` is a grid (`data-columns`, default 2, collapsing to 1 below `@container` 30rem) using an inner-edge technique so rules appear only between cells (a `border-block-end` on every item except the last row, a `border-inline-start` on items not first in their row; do it with `gap: 0` plus `:nth-child` selectors per column count or with `margin: -1px` overlap, whichever leaves no outer-edge rule); `.rule-notice` is `border-block-end: 1px solid var(--site-border)`, `border-inline-start: 2px solid var(--site-danger)` (or `--site-success` by `data-tone`), `padding: 0.75rem 0 0.75rem 0.75rem`; `.rule-defs > div` are rows with `border-block-end` and, at `@container (min-width: 36rem)`, a two-column grid with a `border-inline-start` rule before the value. Every colour is an existing `--site-*` token. Then implement `components/ui/rules.tsx` to the signatures above using `cn` from `@/lib/utils` and `React.useId` for the heading id.
- [ ] **Step 4: Run** the same vitest command. Expected: PASS.
- [ ] **Step 5: Verify budget.** Run `pnpm -s exec tsx scripts/check-bundle-budget.ts`. Expected: pass. If it fails, delete the dead `.surface-card`/`.surface-panel` rules in `app/styles/steel-surfaces.css` only where no site-tier file uses them (`grep -rn "surface-card\|surface-panel" app/routes/_site components` excluding app-tier directories) and re-run.
- [ ] **Step 6: Commit** `feat(ui): divider primitives (Section, Columns, Cells, Notice, Definitions)`.

### Task 2: The gate

**Files:**
- Create: `lib/__tests__/steel-rules.test.ts`
- Create: `lib/__tests__/steel-rules-baseline.ts` (the frozen allowlist, one `'path': 'wave N'` per line, sorted)

**Interfaces:**
- Consumes: `isSiteTier` from `eslint-local-rules/design-scope.js`.
- Produces: `export const STEEL_RULES_BASELINE: Record<string, string>` in `steel-rules-baseline.ts`; the value names the wave that removes the entry.

- [ ] **Step 1: Write the test.** Walk `components`, `features` and `app/routes` `.tsx` files (reuse the walk shape from `design-consistency.test.ts`), keep `isSiteTier(file)`. For each string literal containing class tokens, flag a class string that has an all-sides `border` token (`\bborder\b` not followed by `-`) together with `rounded-site` (not `rounded-site-sm` alone), unless it also has a control, picture or overlay marker: `bg-site-surface`, `bg-site-bg-subtle` (S4 picture), `surface-field`, `surface-overlay`, `aspect-`, `size-N`, `h-N w-N`, or the enclosing tag is `Button`, `Input`, `Select`, `Textarea`, `button`, `input`, `select`, `textarea`, `img`, `Dialog*`, `Popover*`, `Menu*`. Also flag a `Card` or `surface-card` / `surface-panel` import or class in a site-tier file. Tests: (a) the scanner finds site-tier files at all; (b) every violation is in `STEEL_RULES_BASELINE` (message: file:line plus the pointer "use Section / Columns / Cells / Notice / Definitions from components/ui/rules.tsx, plan S7-S11"); (c) every baseline entry still violates (so entries are removed as pages convert); (d) `.rule-notice` is the only selector in `steel-rules.css` with a `2px` border. Include a unit test of the scanner function on three inline strings (a bordered group box flagged, a bordered `Button` not, a `bg-site-bg-subtle` picture not).
- [ ] **Step 2: Generate the baseline.** Run the test once with `STEEL_RULES_UPDATE=1` set; have the test, under that variable only, print the violating file list; paste it into `steel-rules-baseline.ts` with the wave assigned by directory (`settings`, `account`, `lists`, `saves`, `history`, `drafts` = `wave 2`; `arcade`, `store`, `shop`, `library`, `homes`, `membership`, `wallet` = `wave 3`; `profile`, `feed`, `groups`, `messages`, `communities`, `news` = `wave 4`; `admin`, `analytics`, `developer`, `create`, `rmhladder`, `rmh-datacenter`, `rmh-medschool` = `wave 5`; files whose violation is an error or warning box = `wave 6`; anything else = `wave 4`).
- [ ] **Step 3: Run** `pnpm exec vitest run lib/__tests__/steel-rules.test.ts`. Expected: PASS.
- [ ] **Step 4: Prove it bites.** Temporarily add `className="border rounded-site p-4"` to a site-tier component not in the baseline; the test must FAIL naming that file; revert.
- [ ] **Step 5: Commit** `test: gate bordered group boxes on the site tier (steel-rules)`.

### Task 3: The rules text

**Files:**
- Modify: `docs/plans/2026-11-11-steel-design-implementation.md` (section 5 add S7 to S11 with the spec's wording; section 10 recipes note which primitive each page type uses; section 18 mark D7 and D8 decided 2026-11-24, owner; section 17 ledger row)
- Modify: `design.md` (R3 gains one sentence naming the primitives; section 4 lists them)
- Modify: `docs/design-language.md` §0, `docs/page-consistency.md` (the "Rows on rules, not boxes" checklist item gains the primitives), `components/CLAUDE.md`, `CLAUDE.md` (design system paragraph), `AGENTS.md` if it mirrors `CLAUDE.md`
- Modify: `components/ui/card.tsx` doc comment: "site pages use `rules.tsx`; Card remains for the app tier"

- [ ] **Step 1:** Write S7 to S11 into plan section 5 using the spec text verbatim for values (S7 section rule above with `space-6`; S8 `@3xl`; S9 cells; S10 2px notice; S11 `@xl` definition rows). Mark D7 and D8 decided.
- [ ] **Step 2:** Update the other docs listed; keep changes to the sentences that mention rows on rules or boxes.
- [ ] **Step 3: Run** `pnpm exec vitest run lib/__tests__/doc-pointers.test.ts lib/__tests__/steel-tokens.test.ts`. Expected: PASS.
- [ ] **Step 4: Commit** `docs(steel): S7-S11 divider rules; D7 and D8 decided`.

### Task 4: Wave 2, settings, account, lists, saves, history, drafts

**Files:** every file in `STEEL_RULES_BASELINE` with value `wave 2`; their `locales` are unchanged.

**Interfaces:** Consumes `Section`, `Definitions`/`Definition`, `Notice` from Task 1.

- [ ] **Step 1:** For each wave-2 file: replace the bordered group box with `Section` (a titled group), `Definitions` (label and value or setting rows), or plain rows on `border-b border-site-border`; a clickable box becomes a `row-hover` row. Keep headings, copy and `t()` keys unchanged (changing wording means a new key, rule 5a).
- [ ] **Step 2:** Remove the converted files from `STEEL_RULES_BASELINE`.
- [ ] **Step 3: Run** `pnpm exec vitest run lib/__tests__/steel-rules.test.ts && pnpm check:consistency`. Expected: PASS.
- [ ] **Step 4: Verify visually.** Run `pnpm dev`; screenshot `/settings`, one list page and one account page in Day and Night at 390px and 1280px and once in `ar` (Playwright, `deviceScaleFactor: 2`); check no double rules and that the vertical rule mirrors in `ar`.
- [ ] **Step 5: Commit** `feat(steel): wave 2, settings and lists on rules`.

### Task 5: Wave 3, games and apps index, shop, library, plans, homes

**Files:** baseline entries with value `wave 3`. **Consumes:** `Cells`, `Section`.

- [ ] **Step 1:** Tile grids (Games and apps, Shop, Library shelves, membership plans, RMHHomes listings) become `Cells`; the picture inside a tile keeps S4 (`bg-site-bg-subtle`, 1px border, 8px radius) and loses any box around the whole tile (D7: rows or cells on rules).
- [ ] **Step 2:** Remove converted files from the baseline. **Step 3:** run the Task 4 Step 3 commands. **Step 4:** screenshots as in Task 4 for `/arcade` (or the games index), `/store`, `/library`. **Step 5: Commit** `feat(steel): wave 3, catalogues on cell rules`.

### Task 6: Wave 4, profile, game page, feed columns, groups, messages, news

**Files:** baseline entries with value `wave 4`. **Consumes:** `Columns`, `Section`.

- [ ] **Step 1:** Peer groups side by side (profile stats and activity, game page leaderboard and changelog) become `Columns`; `components/news/NewsFront.tsx` keeps its own markup unless a primitive replaces it with no visual change (if so, replace it and compare screenshots before and after). Stations such as "Playing now" and "Leaderboard" become `Section`s.
- [ ] **Step 2:** Remove converted files from the baseline. **Step 3:** run the Task 4 Step 3 commands. **Step 4:** screenshots for a profile, a game page and `/news`. **Step 5: Commit** `feat(steel): wave 4, profile and game pages on column rules`.

### Task 7: Wave 5, dashboards and data tables

**Files:** baseline entries with value `wave 5`.

- [ ] **Step 1:** Convert group boxes to `Section` and `Definitions` only. Any file that renders a chart component keeps its chart and figure markup untouched (D10 stays open); change only its section headings and surrounding group boxes.
- [ ] **Step 2:** Remove converted files from the baseline. **Step 3:** run the Task 4 Step 3 commands. **Step 4:** screenshots of the admin dashboard, analytics and the ladder page. **Step 5: Commit** `feat(steel): wave 5, dashboards on section rules`.

### Task 8: Wave 6, inline notices

**Files:** baseline entries with value `wave 6` (the tinted `bg-site-danger/10` and `bg-site-success/10` boxes on about 15 forms).

- [ ] **Step 1:** Replace each with `<Notice tone="danger">` or `tone="success"`, keeping the message and its `role`.
- [ ] **Step 2:** The baseline should now be empty. Delete `steel-rules-baseline.ts` and its import, and change the gate to forbid any violation outright; keep the scanner unit tests.
- [ ] **Step 3: Run** `pnpm check:consistency:full`, `pnpm typecheck`, `pnpm lint` (no new warnings) and `pnpm audit:pages`. Expected: PASS.
- [ ] **Step 4: Verify** `pnpm -s exec tsx scripts/check-bundle-budget.ts` passes and record the final ledger row in plan section 17.
- [ ] **Step 5: Commit** `feat(steel): wave 6, inline notices on a rule; gate has no baseline`.

---

## Self-review notes

- Spec coverage: S7 to S11 and primitives (Tasks 1, 3), gate (2), Card left alone (global constraint; Task 3 comment), waves 2 to 6 (Tasks 4 to 8), verification and budget (Tasks 1, 4 to 8), D7 and D8 (Task 3), L8 scope (constraints, gate scope).
- Names consistent: `Section`, `Columns`, `Cells`, `Notice`, `Definitions`, `Definition`, `STEEL_RULES_BASELINE`, `rule-*` classes.
- Review Focus tests: Section first-child and after-Columns, empty and single-child Columns, ragged Cells, RTL and server render are covered in Task 1's test (add one assertion each) and the screenshot steps.
