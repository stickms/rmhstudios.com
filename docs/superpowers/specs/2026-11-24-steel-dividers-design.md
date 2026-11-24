# Steel dividers: rules in place of group boxes

Owner request, 2026-11-24. Status: design, awaiting approval.

## Intent

Steel pages read as one long stream of text because the only structural device the plan names is "a row on a
rule" (S2) and "a column divided by a vertical rule" (S3). Pages that needed to group things either invented their own
divider spacing or kept a bordered `rounded-site` box (about 145 files still draw one). The owner wants thin
horizontal and vertical line separators used as the site's structure, replacing group boxes and cards where they
exist, in the manner of the news front page (`components/news/NewsFront.tsx`): a lead beside neighbours split by a
1px vertical rule that appears only where the column is wide enough, then rows on rules.

This does **not** reverse S1 or R3. Boxes stay for controls and pictures. It names the divider vocabulary the plan
never wrote down, ships it as shared primitives, and moves pages onto it.

## Goals

- One written divider vocabulary in the plan, `design.md` and the page-consistency checklist.
- Shared primitives so a page never hand-writes a section rule, a column rule or a cell rule again.
- Existing group boxes on `_site` pages become rules; `_site` uses of `Card` move to the divider primitives.
- A gate that fails a new bordered group box on a `_site` page, so the inconsistency cannot return.

## Non-goals and anti-goals

- No cards, no fills, no shadow, no gradient (R1 holds). A group is never boxed.
- No change to controls, fields, overlays, pictures (S4/S5) or tokens.
- Full-screen games and apps (`--app-*`, L8) are out of scope and keep their panels.
- Not a failure: a page that gains rules but loses its reading order, breaks at 390px, or in `ar` (RTL).
- Do not resolve plan section 18 decisions by assumption. D7 (catalogues) and D8 (inline notices) are touched by this
  work; this design proposes the answer below and the owner approves it by approving this document.

## Constraints

- Rule colour is `--site-border`, width 1px, always. Logical properties only (`border-inline-start`, `inset-inline-start`, `ps-`, `pe-`) so
  RTL works. Vertical rules appear by container query (`@container`, as news does), never by viewport breakpoint,
  because the shell's margin column changes available width.
- Every value is an existing token; no new colour. No spine change.
- Both editions (Day, Night) at 390px and 1280px, and once in `ar`.
- No motion (R5). Content that arrives later still uses `arrive.tsx`.
- Every commit passes `pnpm check:consistency`; allowlists only shrink.

## Approaches considered

- **A. Shared primitives, then page waves (chosen by the owner).** Largest, and the only one that stops pages
  drifting apart.
- B. Per-file sweep with utilities: quick, but each page invents spacing and breakpoints.
- C. Primitives and a few showcase pages: cheap, leaves the site inconsistent.

## The divider vocabulary (new plan rules S7 to S11)

- **S7 Section.** A section is a heading (`t-heading`) with a full-width 1px rule above it and `space-6` above the
  rule. A `Section` that is the first child of its parent has no rule above (`:first-child`); a `Section` after a page
  title or any other sibling draws its rule. Sections stack with no box.
- **S8 Columns.** Two or three peer groups (the news lead beside its neighbours, a profile's stats beside its
  activity) sit side by side only where the container is at least `@3xl`: a 1px vertical rule centred in a 1.5rem gap
  between the columns. Below `@3xl` they stack, and a horizontal rule takes the vertical rule's place.
  *Ruling made during implementation:* the `3-2` ratio splits the columns exactly 3:2 by flex-grow, and the rule is a
  `::before` centred in the gap (not `border-s` with `ps-6`). This is reversible in one CSS rule (the `::before` block in
  `app/styles/steel-rules.css`).
- **S9 Cells.** A grid of tiles (Games and apps, Shop, Library shelves) puts 1px rules between cells, not boxes
  around them: a rule below every row but the last and a vertical rule between columns, never at the outer edge. The
  picture inside a tile keeps S4.
- **S10 Notice.** An inline error, warning or success is a row on a rule with a 2px inline-start rule in the danger or
  success colour and the words doing the work. This is the owner-approval of the proposal in D8.
- **S11 Definition rows.** Label and value pairs (settings, listing details, stats) are rows on rules with the label
  in `t-label` and the value in `t-body`, a vertical rule between them only at `@xl` and wider.

Rules never touch the page edge on a phone: they run the width of the content column (18px gutter, L1).

## Parts

1. **CSS and primitives.** `app/styles/steel-rules.css` (new, imported where `steel-surfaces.css` is) defines
   `.rule-section`, `.rule-cols`, `.rule-cells`, `.rule-notice`, `.rule-defs`. React wrappers in
   `components/ui/rules.tsx` (`Section`, `Columns`, `Cells`, `Notice`, `Definitions`) emit those classes and accept
   `className`. Server-rendered, no script, no observer.
2. **`Card` stays as it is.** `Card` is imported by app-tier folders too (`features/slice-it`, `components/rmhladder`,
   `components/rmh-datacenter`, `components/arcade`), so changing it would move the games and apps (L8). It stays the
   inert flex column it is today. Each `_site` call site moves to `Section` (or `Definitions`, `Cells`) in its wave;
   when the last `_site` use is gone, `Card` is documented as app-tier only. A clickable "interactive" card becomes a
   `row-hover` row (S2 hover fill), the affordance Steel already uses.
3. **Rules text.** Add S7 to S11 to plan section 5; mark D7 (catalogues become rows or cells on rules) and D8
   (S10) decided, 2026-11-24, owner; update section 10 recipes to say where each primitive sits; update `design.md`
   (R3 gains one sentence naming the primitives), `docs/design-language.md` §0, `docs/page-consistency.md` checklist
   and `components/CLAUDE.md`.
4. **Gate.** A new test `lib/__tests__/steel-rules.test.ts`: on every file `isSiteTier` accepts (the one scope list in
   `eslint-local-rules/design-scope.js`, shared with eslint; imports are not followed, so a component shared with the
   app tier is judged by where it lives), no
   element combines `border` (all four sides or `border` with `rounded-site`) with a content group role. Controls
   (`Button`, `Input`, `Select`, `surface-field`), pictures and overlays are exempt. A frozen, one-directional
   allowlist records the files not yet converted, and the test fails if an allowlisted file no longer violates.
5. **Page waves**, each a commit that passes the gate, in this order:
   1. Primitives, CSS, rules text, gate with the full baseline allowlist.
   2. Settings, account, lists, saves, history, drafts (definition rows, sections).
   3. Games and apps, Arcade, Store, Shop, Library, membership plans, RMHHomes listings (cells, D7).
   4. Profile, game page, communities, groups, messages (columns, sections).
   5. Dashboards and data tables: admin, analytics, ladder, developer, creator studio (D10 stays open; sections and
      definition rows only, no chart styling).
   6. Inline notices across about 15 forms (S10).
6. **Verification.** `pnpm check:consistency` per commit; `pnpm audit:pages` plus screenshots of one page per wave in
   Day and Night at 390px and 1280px and once in `ar`; the bundle budget script (B5): the new CSS must be paid for by
   the boxes it deletes.

## Calls made while checking this document (mine, not the owner's)

- Gate scope is by `isSiteTier`, not by following imports (above).
- `Card` is left alone for the app tier (above).
- Bundle budget: wave 1 adds a small stylesheet before any box is removed. The primitives are written to be a few
  hundred bytes, and wave 1 must still pass `scripts/check-bundle-budget.ts`; if it cannot, the first wave also removes
  the dead `surface-card` and `surface-panel` rules from the site sheet. The ledger in plan section 17 gets a row.
- S10's 2px inline-start rule is the one stated exception to "1px always" (it is the D8 proposal); the gate's exempt
  list names `.rule-notice` and nothing else.
- S10 applies to inline form notices (about 15 forms, wave 6). Toasts and overlays are untouched.
- Wave 5 line between tables and charts: any file that renders a chart component is left alone apart from its
  section headings; no chart or figure styling changes (D10 stays open).

## Left to the builder

Exact spacing within the 18px gutter and `space-*` scale; class and component names beyond those listed; the precise
test heuristic for "bordered group box" (start strict, fall back to the frozen allowlist); how each page is split
between waves if one grows; the `ar` mirror of every vertical rule.

## Open for the owner

None blocking. Proposed and approved by approving this document: S10 as the answer to D8, rows or cells on rules as
the answer to D7, and the games and apps staying out of scope.
