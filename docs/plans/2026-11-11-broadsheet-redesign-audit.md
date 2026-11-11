# Ground-up redesign audit, second pass: Broadsheet (2026-11-11)

> **What this is.** The brief for rebuilding rmhstudios.com from how it stands
> on 2026-11-11 (main at `6f378087`, after phase 32 of the first audit). The
> first audit (`2026-11-09-ground-up-redesign-audit.md`) kept the visual
> identity fixed and reorganised the code under it. This one does the opposite
> first: it **replaces the identity and the layout**, then uses the room that
> opens up to make the site load and navigate instantly, then finishes the
> structural work the first audit started.
>
> **Owner brief (2026-11-11).** A brand-new design scheme and layout, nothing
> carried over for the sake of looking familiar. Human-made is the philosophy:
> the site must not read as generated. Maximum optimisation, instant loading
> and navigation. No backwards compatibility to protect; anything may be
> deleted. The server host and VPS do not change. Everything is pre-approved,
> and each change ships as its own pull request.
>
> **Who it is for.** People planning the work and coding agents doing it. Every
> item has a stable ID, fixed fields, real paths and a "done when" a script can
> check. Take one ID and run with it.

---

## How to read an item

```yaml
id:        N1                     # stable; cite it in commits and PRs ("refs broadsheet N1")
title:     one line
gain:      appearance | perf | structure | practice
impact:    S | M | L | XL
effort:    S | M | L | XL        # S = a sitting, M = a day or two, L = a week, XL = longer
risk:      low | med | high
depends:   [ids]
evidence:  facts from the tree, with paths and counts
target:    what "after" looks like
steps:     ordered, each shippable on its own
stub:      code sketch (adapt names to what you find)
done-when: a check that is true only when finished
```

Item prefixes: **N** new identity and layout · **P** performance · **S**
structure · **B** backend, deploy and CI · **Q** quality and practice.
Numbers marked `≈` come from regex scans.

## Contents

- [0. The short version](#0-the-short-version)
- [1. Where the first audit left things](#1-where-the-first-audit-left-things)
- [2. Baseline on 2026-11-11](#2-baseline-on-2026-11-11)
- [3. Diagnosis](#3-diagnosis)
- [Part N: the new identity, Broadsheet](#part-n--the-new-identity-broadsheet)
- [Part P: performance](#part-p--performance)
- [Part S: structure](#part-s--structure)
- [Part B: backend, deploy, CI](#part-b--backend-deploy-ci)
- [Part Q: quality and practice](#part-q--quality-and-practice)
- [Part R: order of work](#part-r--order-of-work)
- [Appendix A: token map, old to new](#appendix-a--token-map-old-to-new)
- [Appendix B: class and attribute codemods](#appendix-b--class-and-attribute-codemods)
- [Appendix C: what gets deleted](#appendix-c--what-gets-deleted)
- [Appendix D: regenerate the numbers](#appendix-d--regenerate-the-numbers)
- [Appendix E: ledger](#appendix-e--ledger)

---

## 0. The short version

The site today is a dark glass interface navigated through a WebGL globe. It is
carefully built and expensive to carry: about **68,500 lines in 240 files**
exist to draw the material and the globe, a worker and a WebGL2 context start
on every page within 800 ms, and a DOM screenshot is taken on every route
change so the globe has something to refract. The look itself (Geist, near
black, translucent rounded slabs, one electric accent) is the house style of
every AI product launched since 2023. It is the opposite of "human made".

The replacement is **Broadsheet**: the site as a printed sheet. Warm paper,
near-black ink, one pen-blue for anything you can act on, a red pencil for
corrections and alerts. Headlines are set in a Clarendon (Besley), text in a
Franklin gothic (Libre Franklin), figures and metadata in a typewriter mono
(IBM Plex Mono). Structure comes from ruled lines and a column grid, not from
cards floating on a backdrop. Navigation is a numbered **index** down the left
edge and a running head across the top, the way a paper or a manual is
navigated. Nothing glows, blurs, wobbles or floats, so nothing needs a frame
loop, a canvas or a worker, and the page is finished the moment the HTML and
one stylesheet arrive.

| Rank | ID | Gain | Axis | Impact | Effort |
|---:|---|---|---|:-:|:-:|
| 1 | [N1–N4](#n1--tokens-paper-ink-pen) | New tokens, type, surfaces and shell: the whole site changes identity through the contract it already reads | appearance | XL | L |
| 2 | [P1](#p1--delete-the-material-runtime) | Delete the material runtime: jelly, liquid, eversion, the globe, the wasm kernels (≈68.5k lines, a worker and WebGL off every page) | perf | XL | M |
| 3 | [P2](#p2--a-shell-that-is-html-and-css) | A shell that is HTML and CSS: no post-load imports, 11 providers and 9 global mounts cut to what a page needs | perf | L | M |
| 4 | [P3](#p3--one-stylesheet-tier) | One stylesheet tier in place of the site/app split and its 80-line hand-kept skip list | perf/structure | L | M |
| 5 | [N5](#n5--primitives-in-the-new-language) | Primitives redrawn: button, tabs, card, field, dialog, menu, toast, badge, skeleton | appearance | L | M |
| 6 | [P5](#p5--navigation-that-is-already-there) | Navigation that is already there: viewport preload, loader data on every page, no pending flash | perf | L | M |
| 7 | [N6](#n6--front-page-and-section-fronts) | Front page and section fronts designed as pages, not as a feed with a header | appearance | L | M |
| 8 | [S2](#s2--delete-the---app--adapter) | Delete the `--app-*` adapter: 66 variables, 3,905 utility uses, one codemod | structure | L | M |
| 9 | [B1](#b1--deploys-in-under-two-minutes) | Deploys that do not hold a 5-minute lock; CI that does not run twice | practice | M | S |
| 10 | [Q1](#q1--gates-that-are-lint-rules) | 82 source-scanning tests and a 606-line bash gate become lint rules | practice | M | M |
| 11 | [P4](#p4--fonts-three-files-two-preloaded) | Fonts: three files, two preloaded, metric-matched fallbacks | perf | M | S |
| 12 | [P6](#p6--images-through-one-component) | ≈200 raw `<img>` through one component with sizes and lazy loading | perf | M | M |
| 13 | [B3](#b3--one-language-on-the-server) | Drop Bazel and the unrouted Go `assets` service | structure | M | S |
| 14 | [S4](#s4--docs-that-describe-this-site) | Docs that describe this site: ≈13k lines about glass and jelly archived | practice | M | S |
| 15 | [B4](#b4--csp-enforced) | Enforce the nonce CSP that already ships Report-Only | practice | M | S |

**If only three things happen:** N1–N4 together (the identity), P1 (the
runtime it makes unnecessary), P2 (the shell). After those three the site
looks new and every page is lighter than any page is today.

---

## 1. Where the first audit left things

Phases 1–32 landed these (ledger in the first audit, lines 2915–2960):

| Done | In progress | Not started or declined |
|---|---|---|
| A2 A5 A8 · B2 B3 B5 B6 · C1 C2 C4 · D3 D4 D7 · E5 E7 E8 · F4 F7 F8 | A1 (14 features moved) · A3 · A4 · A6 · A7 · B1 (4 islands) · B4 · B7 · C3 · D2 · D5 · E1 E2 E3 E4 E6 · F1 F2 F3 F5 | D1 (declined: no managed Postgres) · D6 (waits on a vendor) · F6 (no history rewrite) |

What that means for this pass:

- **C1 is finished.** Raw `fetch('/api…')` went 840 → 8. The API surface is
  typed. Nothing here reopens it.
- **Every E item is superseded.** E1–E6 tuned a design system this audit
  removes. E7 (one motion source) and E8 (font budget) carry over as P4 and N7.
- **A1/B1 continue** as S1 and P7, but they are no longer first. Moving a game
  into `features/` does not change what a visitor sees or how fast a page is.
- **D2, D5, F1, F2, F3, F5** carry over as B2, B1, Q1, Q2, B1, B4 with smaller
  scopes.

---

## 2. Baseline on 2026-11-11

### 2.1 Size

| Measure | Value |
|---|---|
| Route files | 1,382 (987 API, 395 page; 203 pages under `_site`) |
| `app/routeTree.gen.ts` | 1.26 MB |
| Component `.tsx` files | 1,480 |
| CSS | 122 files, 74,689 lines |
| Prisma | 493 models, 82 enums, 30 schema files, 12,902 lines; `User` is 603 lines |
| i18n | 132 namespaces × 16 shipped locales (32 directories on disk) |
| Tests | 1,143 files; 971 in the main suite; 82 in `lib/__tests__` read source from disk |
| Workflows | 20 (≈47 jobs) |
| Tracked weight | 19,811 files, 699 MB (`docs/indonesia-history` 231 MB, `public` 256 MB, `data` 123 MB) |

### 2.2 What every `_site` page runs

| Thing | State |
|---|---|
| Providers | 11 nested (`components/Providers.tsx`, 706 lines, 13 effects, 15 theme-store selectors) |
| Global mounts | 9 eager mounts (bodies lazy) plus toaster, progress bar, back-nav animation, eversion root, SVG filter host, aurora div |
| Globe | `RadialHub.tsx:389-419` imports the 3,545-line `LiquidGlobe` chunk within 800 ms on **every** page; under 1120px it stays mounted as the orb, at 1120px and up the docked globe mounts ambient. A mount starts `globe-worker.ts` (WebGL2 on OffscreenCanvas, 60/15 Hz) |
| Page snapshot | `RadialShell.tsx:377-416` loads `lib/liquid/glass/scene-feed` after load and screenshots the DOM (`modern-screenshot`, 100–300 ms of main thread) on load, route change, theme change and resize |
| Pointer | one delegated listener writes `--px`/`--py`; click arcs import on first press |
| Twemoji | `@twemoji/api` imported on every page with a `MutationObserver` over the outlet |
| Inline scripts | pre-paint data block + generated pre-paint script (8.3 KB source) + body-top script + JSON-LD + router dehydration |
| Non-English documents | 12 core namespaces inlined: ≈171 KB of JSON for `es`, ≈177 KB for `ja` |

### 2.3 Budgets (`scripts/check-bundle-budget.ts`)

| Metric | Budget | Last recorded |
|---|---:|---:|
| Entry, raw | 541,700 B | 537,952 B |
| Critical path, raw | 1,156,000 B | 1,116,833 B (76 chunks) |
| Critical path, brotli | 328,000 B | 316,849 B |
| Site CSS, brotli | 40,960 B | ≈38,700 B (≈315 KB raw) |
| App-tier CSS, raw | n/a | 461.9 KB |

### 2.4 The design system being replaced

| Measure | Value |
|---|---|
| `--site-*` names | 119 (22 glass, 14 jelly/arc) plus 16 `--gel-*`, 14 `--ease-*`, 21 `--z-*` |
| `--app-*` names | 66, adapted from `--site-*` by 34 `var()` references; 3,905 utility uses in 267 files |
| Role classes | `glass-fill` 800 uses / 422 files · `glass-pane` 297 / 168 · `glass-inset` 226 / 150 · `glass-overlay` 163 / 75 · `glass-chrome` 107 / 43 · `glass-interactive` 115 / 59 |
| Material attributes | `data-jelly*` 550 occurrences / 139 files · `data-fluid-press` 132 / 23 · `data-liquid*` 195 / 24 · `data-evert` in 20 files |
| Radius utilities | `rounded-site` 762 · `rounded-site-sm` 445 |
| Type utilities | `font-display` 393 / 150 files · `font-mono` 743 / 298 · `site-section-label` 250 / 137 |
| Site colour utilities | 6,502 uses in 706 files (these keep working: the names are roles) |
| Material code | `lib/jelly` 13,205 lines · `lib/eversion` 27,773 · `lib/liquid` 1,685 · `components/radial` 20,957 · material CSS 2,836 · wasm 564 · hooks 632 |
| Tests pinning the material | ≈45 files in `lib/__tests__` plus 30 in `lib/jelly`, 28 in `lib/eversion`, 8 in `lib/liquid`, 10 in `components/radial` |
| Docs describing it | ≈13,000 lines across `design.md`, `docs/design-language.md`, `docs/plasmatic-jelly-system.md`, plans and specs |
| Exempt from the system | 40 component directories, 29 route segments |

### 2.5 Backend, deploy, CI (unchanged by the redesign, listed for Part B)

- Compose: web, socket, rmhbox, rmhtube, ladder-worker, homes-worker, jobs,
  status, assets, redis. Postgres on the host.
- `deploy.sh` 1,572 lines; every deploy holds its lock through a **300 s bake**
  with the old container stopped, so no deploy is shorter than five minutes
  and pushes queue behind it.
- `deploy.yml` re-runs all of `ci-checks`, integration and Go tests on every
  push to main after `web-ci` ran them on the PR.
- Go: `status` (12.8k lines, in use) and `assets` (414 lines; Apache has no
  `ProxyPass` to it). Bazel exists only to run Go tests in CI.
- Enforced CSP still has `script-src 'unsafe-inline'`; a nonce policy ships
  Report-Only.
- Hubs keep ≈85 module-level `Map`/`Set` in memory and restart in place on
  each deploy. The Redis adapter and durable rmhbox lobbies exist and are off.

---

## 3. Diagnosis

1. **The identity is the cost centre.** Glass needs translucency, translucency
   needs something moving behind it, and "something moving" became a haze
   layer, a spring system, a click-arc canvas, a pointer service, a tier
   policy, a globe with a shader, a page-snapshot pipeline to feed the shader,
   and 45 tests to stop any of it regressing. Each step was reasonable. The
   sum is 68.5k lines whose job is to make rectangles look wet.
2. **The identity is also the least distinctive thing about the site.** The
   catalogue is odd and personal: a debt counter, a pathfinder calendar, a
   laundry-sorting game, an Indonesian history textbook. The chrome around it
   looks like a model launch page.
3. **Two token contracts.** `--app-*` is `--site-*` with different names and a
   34-line adapter. Every primitive that serves both tiers branches on it.
4. **Two stylesheet tiers.** `site-tier.css` is kept small by a hand-edited
   list of 80-odd `@source not` lines; `lib/style-tier.ts` patches
   `router.preloadRoute` and installs three capture listeners to guess which
   sheet the next page needs.
5. **Rules live in tests that read source files.** 82 of them. They run on
   every commit, they are slow, and they pin implementation details (class
   names, comment text) that a redesign has to delete one by one.
6. **Motion is treated as a feature.** Page entrances, a back-navigation
   animation, a navigation progress bar, view-transition recovery timers. Each
   one is latency a visitor waits through.

Principles for the rebuild:

- **Printed, not rendered.** A page at rest is static HTML and CSS. No
  `requestAnimationFrame`, canvas, worker, observer or timer exists for
  decoration. Anything that moves does so because the visitor did something.
- **Type and rules carry the structure.** A box is a decision, not a default.
- **Roles, not materials, in names.** `surface-card`, not `glass-fill`. The
  next redesign should not need a codemod.
- **Instant is the motion language.** State changes in ≤120 ms or does not
  animate.
- **Delete, don't deprecate.** No aliases for old class names, no "retired"
  constants, no compatibility shims.

---

## Part N — the new identity, Broadsheet

The statement of the language is `design.md` at the repo root (rewritten in
this pass). This part is the build plan for it.

### N1 — Tokens: paper, ink, pen

```yaml
id: N1
gain: appearance
impact: XL
effort: M
risk: med
depends: []
evidence: app/globals/tokens-themes.css is 1,327 lines; 119 --site-* names of which 36 are glass/jelly; two themes (.style-default light, .style-graphite dark, dark is the default)
target: one tokens file under 350 lines; colour roles keep their --site-* names so 6,502 utility uses keep working; material tokens gone
```

**Palette.** Named for what they are on a desk.

| Role | Token | Day edition (paper) | Night edition (carbon) |
|---|---|---|---|
| Page | `--site-bg` | `#f3eee4` | `#141310` |
| Shade (wells, hover) | `--site-bg-subtle` | `#e9e3d6` | `#1d1b17` |
| Card stock | `--site-surface` | `#f8f4ec` | `#1b1915` |
| Card stock, hover | `--site-surface-hover` | `#eee8db` | `#26231d` |
| Card stock, pressed | `--site-surface-active` | `#e4ddce` | `#302c25` |
| Opaque sheet (overlays) | `--site-surface-opaque` | `#fbf8f2` | `#211f1a` |
| Hairline | `--site-border` | ink at 22% | ink at 24% |
| Rule | `--site-border-bright` | `#1a1814` | `#ece5d6` |
| Ink | `--site-text` | `#1a1814` | `#ece5d6` |
| Ink, second | `--site-text-muted` | `#4a453c` | `#bdb6a6` |
| Ink, third | `--site-text-dim` | `#6b655a` | `#958e7f` |
| Pen | `--site-accent` | `#2340d6` | `#93a5ff` |
| On pen | `--site-accent-fg` | `#ffffff` | `#11132c` |
| Pen, hover | `--site-accent-hover` | `#1a31ad` | `#b0bdff` |
| Pen wash | `--site-accent-dim` | pen at 10% | pen at 16% |
| Red pencil | `--site-danger` | `#c2301a` | `#ff7a61` |
| Stamp green | `--site-success` | `#1c7a4c` | `#5cc48e` |
| Ochre | `--site-warning` | `#8a5a00` | `#e6b455` |
| Highlighter | `--site-highlight` | `#f6df3a` | `#f6df3a` |

New tokens: `--site-highlight` / `--site-highlight-fg`, `--site-rule-width`
(1px) and `--site-rule-heavy` (3px), `--site-halftone` (the dot screen used as
a hover and selected fill), `--site-paper-grain` (a 2 KB tiled texture).

**Radius.** `--site-radius: 3px` (sheets and cards), `--site-radius-sm: 2px`
(controls). Circles stay circles. The global squircle rule and its test go.

**Shadow.** `--site-shadow-sm: none`. `--site-shadow` is used only by overlays
(a sheet lying on a sheet): `0 1px 0 ink/12%, 0 14px 30px -12px rgb(0 0 0 / .3)`.

**Themes.** Two editions, `day` and `night`, plus `auto` (follows the OS) as
the default. Stored `default` reads as `day` and `graphite` as `night`.
Colour-vision modes keep working: they only move success/danger/warning.

```css
/* app/styles/tokens.css (sketch) */
:root, .style-day {
  --site-bg: #f3eee4;  --site-text: #1a1814;  --site-accent: #2340d6;
  --site-border: color-mix(in srgb, var(--site-text) 22%, transparent);
  --site-radius: 3px;  --site-radius-sm: 2px;  --site-control-radius: var(--site-radius-sm);
  --site-font-display: 'Besley Variable', 'Besley Fallback', Georgia, serif;
  --site-font-body: 'Libre Franklin Variable', 'Franklin Fallback', system-ui, sans-serif;
  --site-font-mono: 'IBM Plex Mono', ui-monospace, Menlo, monospace;
}
.style-night { --site-bg: #141310; --site-text: #ece5d6; --site-accent: #93a5ff; }
```

**Done when:** `grep -c -- '--site-glass\|--site-jelly\|--gel-' app/` is 0 and
every pair in `lib/__tests__/theme-contrast.test.ts` holds 4.5:1 in both
editions.

### N2 — Type: three faces with jobs

```yaml
id: N2
gain: appearance
impact: XL
effort: S
risk: low
depends: [N1]
evidence: Geist is display and body; Geist Mono is data; font-display used in 150 files, font-mono in 298
target: Besley (display), Libre Franklin (text and UI), IBM Plex Mono (figures, labels, metadata)
```

| Face | Job | Where |
|---|---|---|
| **Besley** 700–900 | Says what a page or a story is | page titles, story headlines, the wordmark, large numerals |
| **Libre Franklin** 400–700 | Everything you read or press | body, controls, navigation |
| **IBM Plex Mono** 400/500 | Everything you scan | timestamps, counts, section labels, keyboard hints, data tables |

Scale (rem, 16px root): 0.72 label · 0.8125 small · 0.9375 body · 1.0625 lede ·
1.25 h3 · 1.625 h2 · clamp(2, 3.6vw, 3) page title · clamp(2.75, 6vw, 4.5)
front-page headline. Headlines track at −0.02em, never uppercase. Labels are
mono, sentence case, no letterspacing (the "no eyebrows" decision stands).

Links in running text are underlined pen blue. Selection is highlighter yellow
with ink text.

**Done when:** `grep -rn "Geist" app/ components/ lib/ --include=*.css --include=*.ts --include=*.tsx | wc -l` is 0 outside game folders.

### N3 — Surfaces: five roles, no material

```yaml
id: N3
gain: appearance
impact: XL
effort: M
risk: med
depends: [N1]
evidence: glass-* roles used 1,231 times in 567 tsx files; material CSS is 2,836 lines in 6 files
target: app/styles/surfaces.css under 250 lines; classes renamed by role
```

| Old | New | What it is | Drawn as |
|---|---|---|---|
| `glass-fill` | `surface-card` | a repeated item | card stock, hairline border |
| `glass-pane` | `surface-panel` | a singular boxed section | card stock, full ink rule |
| `glass-chrome` | `surface-chrome` | sticky bars | page colour, ink rule on the open edge |
| `glass-overlay` | `surface-overlay` | anything floating | opaque sheet, ink border, the one shadow |
| `glass-inset` | `surface-field` | inputs and wells | lighter than the page, ink border |
| `glass-interactive` | `surface-press` | a pressable surface | hover: halftone screen; press: shade |
| `glass-scrim` | `surface-scrim` | behind a dialog | page colour at 70% |
| `glass-opaque` | (removed) | — | every surface is opaque |

Signature details, all static CSS:

- **Halftone as the hover.** A hovered row or secondary button fills with a
  fine dot screen (`--site-halftone`), the way a printer makes a tint from one
  ink. No colour change, no lift.
- **Ink block as selection.** The current index entry, the selected segment
  and the active day are reversed out: ink ground, paper type.
- **Rules.** `.rule` (hairline), `.rule-ink` (1px ink), `.rule-double`
  (3px double, under the masthead and above footers), `.rule-dotted` (leaders
  in tables of contents and stat rows).
- **Stamps.** `.stamp` is a small bordered mono label set 4° off level, for
  states that were granted by someone: Kept, Verified, Sold out, Staff pick.

**Done when:** `grep -rn "glass-\|data-jelly\|data-liquid\|data-fluid" app components features lib hooks | wc -l` is 0 and `app/jelly-*`, `app/glass-roles.css` do not exist.

### N4 — The shell: running head, index, margin

```yaml
id: N4
gain: appearance
impact: XL
effort: L
risk: med
depends: [N1, N2, N3]
evidence: components/radial is 59 files / 20,957 lines; navigation is a WebGL globe (RadialHub 959 lines, LiquidGlobe 3,545) plus a rail; the nav model is lib/sidebar-nav.ts
target: components/shell/ under 900 lines of tsx and 500 of css; no canvas, worker, observer or post-load import
```

```
┌──────────────────────────────────────────────────────────────────────────┐
│ No. 315  Wednesday 11 November 2026            Search /  Inbox  Notices  ◯ │  running head (mono, 40px)
├────────────┬───────────────────────────────────────────┬─────────────────┤
│ RMH        │                                           │                 │
│ Studios    │   page                                    │   margin        │
│            │                                           │   (a page's     │
│ 01 Front   │                                           │   own notes,    │
│ 02 Explore │                                           │   else "on the  │
│ 03 Inbox 3 │                                           │   floor" live   │
│ ───        │                                           │   counts)       │
│ 04 Games   │                                           │                 │
│ ...        │                                           │                 │
└────────────┴───────────────────────────────────────────┴─────────────────┘
```

- **Running head.** One 40px line across the top: issue number (day of the
  year) and date on the left, search, inbox, notifications and the account on
  the right. Sticky. On the front page a full **masthead** (the wordmark at
  display size between two ears of copy, a double rule under it) sits below it
  and scrolls away.
- **Index.** The left column, 208px, sticky. Every destination from
  `lib/sidebar-nav.ts`, numbered, grouped under mono labels. The current entry
  is an ink block. Badges are red-pencil counts. It replaces the globe, the
  wheel, the nav rail and the dock setting.
- **Margin.** The right column, 300px, from 1180px up. A page puts its own
  notes there through the existing rail slot; otherwise it shows live counts.
- **Columns are ruled.** 1px ink rules between index, page and margin. The
  frame is capped at 1320px.
- **Phones.** The running head becomes wordmark + search + account in a
  full-bleed bar (the existing iOS exception). The index becomes a **tab
  strip** of five (Front, Explore, Games, Inbox, Index) floating 8px off the
  bottom edge; "Index" opens the full contents as a sheet, set like a table of
  contents with dotted leaders.
- **Full-screen routes** (games, apps) keep no shell, as now.

```tsx
// components/shell/SiteShell.tsx (sketch)
export function SiteShell({ children, overlays }: Props) {
  return (
    <div className="shell">
      <a href="#main-content" className="shell-skip">{t('skip')}</a>
      <RunningHead />
      <div className="shell-frame">
        <IndexRail />
        <main id="main-content" tabIndex={-1} className="shell-main page-root">{children}</main>
        <MarginRail>{railSlot}</MarginRail>
      </div>
      <TabStrip />
      {overlays}
    </div>
  );
}
```

**Done when:** `components/radial/` does not exist; `grep -rn "getContext\|new Worker\|requestAnimationFrame" components/shell` is empty; the shell renders complete with JavaScript disabled.

### N5 — Primitives in the new language

```yaml
id: N5
gain: appearance
impact: L
effort: M
risk: med
depends: [N1, N3]
evidence: <Button 1,260 uses / 477 files; <Tabs 85 / 74; <Card 97 / 53; tabs.tsx is 528 lines with a framer layoutId capsule
target: every primitive is CSS state on native/Radix elements; no framer-motion in components/ui
```

| Primitive | New drawing |
|---|---|
| **Button** `signal` | solid ink, paper label. The one primary action per view |
| `accent` | solid pen |
| `outline` / `secondary` | 1px ink border; halftone on hover |
| `ghost` / `default` | label only; halftone on hover; `default` is pen-coloured |
| `link` | pen, underlined |
| `destructive` | solid red pencil |
| all | 2px radius, weight 600, press moves 1px down, focus is a 2px pen outline 2px off |
| **Tabs** | words on a rule; the current tab has a 3px ink bar under it. `appearance="segment"` (was `thumb`) is a bordered row with the current segment reversed out |
| **Card** | `surface-card`; `interactive` darkens the border to ink on hover |
| **Field** | `surface-field`; label above in Franklin 600; help and errors under it in mono |
| **Dialog / Sheet** | `surface-overlay`, title in Besley, a rule under the header |
| **Menu** | `surface-overlay`; rows are text, hover is halftone, current is reversed |
| **Toast** | a slip: ink border, mono status word, message |
| **Badge** | mono, bordered; `solid` reversed; counts are red pencil |
| **Skeleton** | diagonal hatch (a printer's "position only" block), no shimmer |
| **Switch** | a square knob in a bordered track; on = ink track |
| **Empty state** | a bordered box with a hatch corner and one sentence |
| **Loader** | three mono dots stepping, or nothing under 400 ms |

`JellyGroup` becomes `ControlGroup` (a bordered row of flat controls).

**Done when:** `grep -rln "framer-motion" components/ui | wc -l` is 0.

### N6 — Front page and section fronts

```yaml
id: N6
gain: appearance
impact: L
effort: M
risk: low
depends: [N4, N5]
evidence: home is RadialFeed (370 lines) rendering announcements as stacked cards above the timeline; /games is a separate Steam-style skin (components/steam/steam.css, 2,674 lines)
target: a front page with a lead story, briefs and the feed; a catalogue page for games and apps in the site's own language
```

- **Front page (`/`).** Masthead; then a lead block (the pinned announcement
  as a headline with a standfirst and one action, three briefs in a ruled
  column beside it); then the feed under word tabs. Posts are entries divided
  by hairlines, not cards: avatar, name in Franklin 700, handle and time in
  mono, text, a mono action row.
- **Catalogue (`/games`).** A printed catalogue: number, title in Besley, one
  line, players and kind in mono, cover image as a plate. Filter by kind with
  word tabs. The Steam skin is deleted.
- **Section fronts** (`/library`, `/communities`, `/store`, `/blog`, `/news`):
  title, standfirst, then a ruled grid.
- **Signed-out front page** leads with what the studio is, in two sentences,
  and three things to do.

**Done when:** `components/steam/` does not exist and `/` renders its lead
block in the server HTML.

### N7 — Motion: instant

```yaml
id: N7
gain: perf
impact: M
effort: S
risk: low
depends: [N3]
evidence: lib/motion.ts 287 lines; 14 --ease-* tokens; page-motion.css 1,122 lines; lib/page-transition.ts 240; lib/view-transition.ts 287; BackNavAnimation and a 700 ms recoverViewTransition timer on every navigation
target: two durations (90 ms, 160 ms), one ease; no page entrance, no back animation
```

- Colour and border changes: 90 ms. Overlays open in 160 ms with a 4px rise
  and close in 90 ms. Nothing else animates by default.
- A navigation swaps the page. No entrance, no progress bar under 400 ms.
- A drag follows the finger with no easing; on release it snaps in 160 ms.
- Stamps land with one 160 ms scale from 1.15 to 1 (the only flourish).

**Done when:** `--ease-*` tokens number 1 and `grep -c "@keyframes" app/styles/*.css` is ≤ 6.

### N8 — Assets drawn for this identity

```yaml
id: N8
gain: appearance
impact: M
effort: S
risk: low
depends: [N1]
evidence: app/icon.svg is an Inkscape export with editor metadata; public/jelly/haze-tile.webp is preloaded on every page; OG cards (lib/og) are drawn in the glass style
target: a wordmark, a monogram, a paper grain tile, a halftone tile, printer's marks, new OG card template
```

- `RmhWordmark` (Besley 900, set tight) and `RmhMonogram` (the three letters
  in an ink square, for the favicon and the phone bar).
- `public/print/grain.webp` (≤2 KB, 160px tile) and an inline SVG halftone.
- Printer's marks as components: registration target, colour bar, crop marks.
  Used sparingly: the foot of the index, the 404 page, empty states.
- OG cards: paper ground, Besley headline, a rule and the wordmark.
- Favicon, `manifest.webmanifest` colours and `theme-color` follow the paper.

**Done when:** `public/jelly/` does not exist and `/api/og/*` renders in the new template.

### N9 — Copy written by a person

```yaml
id: N9
gain: appearance
impact: M
effort: M
risk: low
depends: []
evidence: descriptions such as "The RMH Studios community feed."; empty states of the form "No X yet"; 132 namespaces
target: a short voice guide in design.md; shell, front page, empty and error states rewritten
```

Rules: say the specific thing ("3 lobbies open, 7 seats left", not "Join the
fun"). No exclamation marks, no "seamless", "powerful", "unleash", no emoji in
chrome. Errors say what happened and what to do next. Numbers are real or
absent. New wording always takes a **new i18n key** (a changed `defaultValue`
on a shipped key changes English only).

### N10 — Themes as editions and stock

```yaml
id: N10
gain: structure
impact: M
effort: M
risk: med
depends: [N1]
evidence: stores/themeStore.ts 451 lines; lib/themes/* 1,028 lines validating 30 --site-* keys for user-made themes; accent presets in lib/appearance.ts; Providers hand-syncs 10 appearance fields three ways
target: edition (day/night/auto) + pen colour + text size; user themes validate against the new 18-colour contract
```

Settings → Appearance becomes: **Edition** (Day, Night, Match my device),
**Pen** (six inks: blue, violet, teal, green, vermilion, black), **Text size**,
**Density**. `jellyMotion`, `electricArcs`, `eversionLevel`, `navTransition`,
`alwaysEvertGlobe` and the desktop-navigation choice are deleted with their
columns, store fields, prepaint slices and tests.

---

## Part P — performance

Targets, measured by `synthetic-perf.yml` on a mid phone profile:

| Metric | Now (budget) | Target |
|---|---:|---:|
| Critical-path JS, brotli | 316 KB (328) | ≤ 200 KB |
| Site CSS, brotli | 38.7 KB (40) | ≤ 28 KB |
| LCP, p75, `/` | (RUM) | ≤ 1.5 s |
| INP, p75 | (RUM) | ≤ 100 ms |
| Work at rest | globe worker 7–15 Hz | none |
| Requests after load on an idle page | globe chunk, scene feed, panels, twemoji | 0 until intent |
| In-site navigation to a preloaded page | pending at 400 ms | one frame |

### P1 — Delete the material runtime

```yaml
id: P1
gain: perf
impact: XL
effort: M
risk: med
depends: [N3, N4]
evidence: section 2.4; lib/wasm is used only by lib/dough.ts and lib/eversion/gl/core.ts; lib/dough.ts only by the globe and /jelly
target: none of it exists
steps:
  - delete lib/jelly, lib/liquid, lib/eversion, lib/dough.ts, lib/wasm, wasm/, components/radial, hooks/useJelly*, useLiquid*, useFluid*, useSpatialParallax
  - delete routes /jelly, /liquid-glass, /eversion-lab, /design and their components
  - delete their tests, the web-ci jobs eversion-changes, eversion-e2e, jelly-e2e, frame-budget, and the wasm build step
  - remove modern-screenshot and assemblyscript from package.json
done-when: "git ls-files lib/jelly lib/liquid lib/eversion wasm components/radial | wc -l" is 0 and pnpm build passes
```

### P2 — A shell that is HTML and CSS

```yaml
id: P2
gain: perf
impact: L
effort: M
risk: med
depends: [N4, P1]
evidence: section 2.2
target: providers ≤ 5; no eager import() in the shell; nothing observes the DOM
steps:
  - Providers.tsx splits into QueryProvider, SessionProvider, I18nProvider, ThemeEffect (one effect, one selector)
  - LazyMotion/MotionConfig leave the root; framer-motion is imported by the features that use it
  - Twemoji becomes opt-in per surface (post bodies), not a document-wide observer
  - the 9 global mounts become one <DeferredChrome> that imports on first intent (key press, pointer, visibility)
  - NavigationProgress, BackNavAnimation, EversionRoot, GlassFilter, the aurora div are deleted
  - unread counts keep their single EventSource; it connects on visibility, not on mount
done-when: a Playwright idle trace of / shows 0 network requests and 0 long tasks between load+1s and load+10s
```

### P3 — One stylesheet tier

```yaml
id: P3
gain: perf
impact: L
effort: M
risk: med
depends: [N3, S2]
evidence: app/site-tier.css 217 lines of @source not; lib/style-tier.ts 132 lines patches router.preloadRoute; app-tier sheet 461.9 KB raw
target: one global sheet (tokens, base, surfaces, primitives, utilities used by shared code); each game or app imports its own CSS from its route
steps:
  - games/apps that ship utilities move them to route-level CSS imports (islands already do)
  - delete lib/style-tier.ts, app-tier.css, the tier tests
done-when: lib/style-tier.ts does not exist; site CSS ≤ 28 KB brotli
```

### P4 — Fonts: three files, two preloaded

```yaml
id: P4
gain: perf
impact: M
effort: S
risk: low
depends: [N2]
evidence: Geist latin 29.4 KB preloaded; 14 @fontsource packages; per-route font sheets for games
target: preload Libre Franklin latin (29 KB) and Besley latin (37 KB); Plex Mono 400/500 (15 KB each) load with font-display: optional; metric-matched local fallbacks for both text faces from scripts/gen-font-metrics.ts
done-when: no layout shift on font swap (CLS 0 on / in synthetic-perf); geist packages removed
```

### P5 — Navigation that is already there

```yaml
id: P5
gain: perf
impact: L
effort: M
risk: low
depends: [P2]
evidence: defaultPreload 'intent' with 50 ms delay; 226 useEffect fetches (ratchet); RoutePending at 400 ms
target: the next page's code and data are in memory before the click lands
steps:
  - index and tab-strip links preload on render (they are always visible); in-page links preload on viewport entry on wifi, intent otherwise
  - preload delay 0; preloadStaleTime 60 s; loaders own page data (continue first-audit B4 for the top 30 pages by traffic)
  - keep the outgoing page until the incoming one is ready; no pending component under 600 ms
  - speculation rules for the 6 section fronts on browsers that support them
done-when: synthetic-perf "nav to preloaded route" ≤ 50 ms script time; useEffect-fetch ratchet ≤ 150
```

### P6 — Images through one component

```yaml
id: P6
gain: perf
impact: M
effort: M
risk: low
depends: []
evidence: raw <img: 166 in components (111 files), 15 in app, 26 in features; <OptimizedImage> used 17 times; 48 loading="lazy" lines repo-wide
target: site-tier images use <OptimizedImage> with width, height, sizes; lint rule forbids raw <img> outside games
done-when: eslint local/no-raw-img passes on the site tier
```

### P7 — Islands for everything full-screen

Continue first-audit B1: each remaining self-contained game builds as an
island so the site entry stops carrying its route. Order by weight: balatro,
hearthworks, slice-it, altair, kowloon-knockout, rmhbox.
**Done when:** `routeTree.gen.ts` < 700 KB.

### P8 — i18n payload

```yaml
id: P8
gain: perf
impact: M
effort: S
risk: low
evidence: non-English documents inline 12 namespaces, ≈171–177 KB raw JSON
target: inline only the keys the shell uses (a generated shell namespace, ≈6 KB); other namespaces load with the route that needs them
done-when: an es document's inlined i18n JSON is ≤ 15 KB
```

### P9 — Service worker: smaller, stricter

`public/sw.js` is 686 lines. Keep: asset cache-first, offline fallback, push.
Move the IndexedDB outbox to the two features that use it. Precache the shell
CSS and the two preloaded fonts so a repeat visit paints from cache.

### P10 — Budgets re-anchored down

After P1–P3 land, set the budgets to measured + 5% and make them blocking:
critical path ≤ 200 KB brotli, site CSS ≤ 28 KB, entry raw ≤ 380 KB.

---

## Part S — structure

### S1 — Finish `features/`

17 catalogued games and apps still live in `lib/<id>` + `components/<id>`
(rmhmusic 141/44 files, rmhladder 112/19, kowloon-knockout 86/42, rmhbox
35/96, dunesday 12/70, …). Move them with the phase-25 codemod, largest
first. **Done when:** `lib/` has < 90 top-level directories (182 today).

### S2 — Delete the `--app-*` adapter

```yaml
id: S2
gain: structure
impact: L
effort: M
risk: med
evidence: 66 --app-* variables; utilities used 3,905 times in 267 files; adapter of 34 var() references in components/shared/app-theme.css (967 lines)
target: apps read --site-* directly; an app that wants its own palette sets --site-* on its root
steps:
  - codemod bg-app-* → bg-site-*, rounded-app* → rounded-site*, var(--app-x) → var(--site-x) (map in Appendix A)
  - app-theme.css keeps only layout helpers (.app-viewport, .app-stage, …) and moves to app/styles/app-layout.css
done-when: grep -rn -- "--app-\|-app-" components features app --include=*.tsx --include=*.css | wc -l is 0
```

### S3 — Providers and the appearance store

`components/Providers.tsx` (706 lines) and `stores/themeStore.ts` (451) become
four small providers and a 120-line store after N10 removes eleven settings.

### S4 — Docs that describe this site

Archive to `docs/archive/2026/`: `docs/design-language.md`,
`docs/plasmatic-jelly-system.md`, `docs/liquid-glass-system.md`,
`docs/jelly-group-audit.md`, `docs/plans/plasmatic-jelly/`, the liquid-glass
and eversion plans and specs. Rewrite `design.md`, the design sections of
`CLAUDE.md`, `components/CLAUDE.md`, `app/CLAUDE.md`, and
`docs/page-consistency.md` (short: the checklist for a page in Broadsheet).

### S5 — Split the remaining god files

`components/library` reader (1,488-line CSS, BookReader/BookCanvas),
`RMHarkCard`, the library route. LiquidGlobe and RadialHub leave the list by
being deleted.

### S6 — Dead weight

- 16 unshipped locale directories (14 MB): delete or ship.
- `docs/indonesia-history` (231 MB): move to object storage, keep the manifest.
- `/api/internal/predictions-tick`: nothing calls it; delete.
- Stale constants named in the first audit's flags.

---

## Part B — backend, deploy, CI

The host and VPS stay. Everything here is inside that constraint.

### B1 — Deploys in under two minutes

```yaml
id: B1
gain: practice
impact: M
effort: S
risk: med
evidence: deploy/hotswap-web.sh bakes 300 s holding the deploy lock; deploy.yml re-runs ci-checks + integration + Go on main
target: bake watches health for 45 s and releases the lock; deploy.yml trusts the PR's required checks when the merge commit's tree equals the PR head's tree
done-when: median push-to-live ≤ 4 min in dora-metrics (build included)
```

### B2 — Hubs that survive a deploy

Turn on what exists: `REALTIME_REDIS_ADAPTER=1`, `RMHBOX_DURABLE_LOBBIES=1`,
the `redis-state` profile. Add drain-on-SIGTERM to socket-server and rmhtube.

### B3 — One language on the server

Delete the Go `assets` service (no Apache route reaches it) and Bazel (18
files; `go test ./...` in CI does the same job for `status`). Port `status`
only if someone wants to; it works.

### B4 — CSP enforced

Flip `lib/csp/policy.server.ts` from Report-Only to enforcing once a week of
reports is clean. The new shell has one inline script (pre-paint) with a nonce.

### B5 — Chromium out of the common image

Only `jobs` renders thumbnails. Give it the Chromium layer; web and hubs use
the slim base.

### B6 — CI: twelve workflows

Merge the two asset-sync workflows; fold `go-microservices` into `web-ci` as a
path-filtered job; drop the four material jobs (P1); make `senior-review`
manual (it spends tokens on every push).

### B7 — A thinner `User`

Continue first-audit C3: the 603-line `User` model keeps identity and auth;
339 back-relations stay on the owning models.

---

## Part Q — quality and practice

### Q1 — Gates that are lint rules

```yaml
id: Q1
gain: practice
impact: M
effort: M
risk: low
evidence: 82 lib/__tests__ files read source; scripts/check-consistency.sh is 606 lines and repeats rules the tests hold
target: design rules are 8 eslint rules + 1 stylelint config; the commit gate is eslint + tsc on changed files
rules:
  - local/surface-by-role        (no bg-site-surface + border without a surface-* class)
  - local/no-raw-palette-color   (kept)
  - local/no-hardcoded-radius    (kept)
  - local/no-raw-img             (new, P6)
  - local/no-decoration-loop     (no requestAnimationFrame / setInterval / infinite animation on the site tier)
  - local/one-tab-strip          (role="tablist" only in ui/tabs)
  - local/no-inline-motion       (kept)
  - local/route-needs-head       (kept)
done-when: scripts/check-consistency.sh < 120 lines; lib/__tests__ source-scanning files < 25
```

### Q2 — Flow tests in a browser

Sign up, post, tip coins, buy a membership (Stripe test mode), join an rmhbox
lobby. Five Playwright flows in `testing/flows/`, run on PRs that touch
`lib/auth`, `lib/economy`, `server/`.

### Q3 — Visual checks that a person would do

`pnpm audit:pages` already walks pages in a browser. Add a screenshot pass of
12 key pages × 2 editions × 2 widths stored as CI artifacts, so a reviewer
looks at pictures instead of reading class names.

### Q4 — Accessibility

Contrast is asserted from the token table (N1). Focus is a 2px pen outline on
every interactive element. The index is a `<nav>` with `aria-current`. The tab
strip is a `<nav>`, not a tablist. Text size and density settings stay.

---

## Part R — order of work

Each line is one pull request. Each leaves main shippable.

| # | PR | Items | Proves |
|---:|---|---|---|
| 1 | This audit | — | the plan is written down |
| 2 | Broadsheet foundation | N1 N2 N3 N5 N7 N8, P4 | every page changes identity; material CSS gone |
| 3 | The shell | N4, P1, P2 | globe, jelly and eversion deleted; index navigation |
| 4 | Front page and catalogue | N6, N9 | the two most-visited pages are designed, not themed |
| 5 | Appearance settings and themes | N10, S3 | eleven settings and their plumbing gone |
| 6 | One token contract, one sheet | S2, P3 | `--app-*` and the tier split gone |
| 7 | Navigation | P5, P8 | preloading and loader data |
| 8 | Images, service worker, budgets | P6, P9, P10 | budgets lowered and blocking |
| 9 | Gates and docs | Q1, S4 | lint rules replace scanners |
| 10 | Deploy and CI | B1, B3, B5, B6 | faster deploys |
| 11+ | Features and islands | S1, P7, S5 | the long tail |

---

## Appendix A — token map, old to new

| Old | New |
|---|---|
| `--site-glass-tint`, `--site-glass-tint-strong`, `--site-glass-pane-tint` | `--site-surface` |
| `--site-glass-chrome-tint`, `--site-glass-mobile-tint` | `--site-bg` |
| `--site-glass-overlay-tint`, `--site-glass-overlay-fill` | `--site-surface-opaque` |
| `--site-glass-rim`, `--site-glass-rim-soft` | `--site-border` |
| `--site-glass-light`, `--site-glass-ink`, `--site-glass-glint` | (delete the declaration) |
| `--gel-ink` / `--on-ink` | `--site-text` / `--site-bg` |
| `--gel-*` (others), `--site-jelly-*`, `--site-arc-*`, `--plasma-wake` | (delete) |
| `--jelly-margin`, `--space-4` | `1rem` |
| `--ease-smooth`, `--ease-glass`, `--ease-out-expo`, `--ease-reveal`, … | `--ease` |
| `--site-aurora-*`, `--site-glass-noise` | (delete) |
| `--app-bg` | `--site-bg` |
| `--app-surface`, `--app-surface-raised` | `--site-surface`, `--site-surface-opaque` |
| `--app-border`, `--app-border-strong` | `--site-border`, `--site-border-bright` |
| `--app-text`, `--app-text-muted`, `--app-text-dim` | `--site-text`, `--site-text-muted`, `--site-text-dim` |
| `--app-accent*`, `--app-success*`, `--app-danger*`, `--app-warning*` | `--site-*` of the same name |
| `--app-radius-lg`, `--app-radius`, `--app-radius-sm` | `--site-radius`, `--site-radius-sm`, `--site-radius-sm` |

## Appendix B — class and attribute codemods

```bash
# classes (word-boundary; run over app components features lib hooks, .ts/.tsx/.css)
glass-fill          → surface-card
glass-pane          → surface-panel
glass-chrome        → surface-chrome
glass-overlay       → surface-overlay
glass-inset         → surface-field
glass-interactive   → surface-press
glass-scrim         → surface-scrim
glass-opaque        → (remove)
glass-refract, glass-liquid, glass-bevel-sm, glass-cage, glass-goo, glass-edge, glass-lens → (remove)
site-kicker         → label
site-section-label  → label
site-display-3      → title
site-display-4      → heading
site-lede           → lede

# attributes (remove the attribute and its value)
data-jelly, data-jelly-*, data-liquid-*, data-fluid-press, data-fluid-press-scope, data-evert

# components
<JellyGroup> → <ControlGroup>
```

## Appendix C — what gets deleted

| Path | Lines |
|---|---:|
| `lib/eversion/` | 27,773 |
| `components/radial/` | 20,957 |
| `lib/jelly/` | 13,205 |
| `components/steam/steam.css` and the Steam-style hub components | ≈4,000 |
| `app/jelly-material/`, `jelly-*.css`, `glass-roles.css` | 2,836 |
| `lib/liquid/` | 1,685 |
| `app/globals/*.css` (rewritten as `app/styles/`, about a third the size) | 6,041 → ≈2,000 |
| `hooks/useJelly*`, `useLiquid*`, `useFluid*` | 632 |
| `lib/dough.ts`, `lib/wasm/`, `wasm/` | 1,173 |
| ≈45 material tests in `lib/__tests__` | ≈9,000 |
| Routes `/jelly`, `/liquid-glass`, `/eversion-lab`, `/design` and their components | ≈3,000 |
| Design docs, plans and specs for glass, jelly, eversion (archived, not deleted) | ≈13,000 |

## Appendix D — regenerate the numbers

```bash
pnpm facts:generate && cat docs/_generated/facts.json
git ls-files lib/jelly lib/liquid lib/eversion components/radial wasm lib/wasm | xargs wc -l | tail -1
grep -rEo "glass-(fill|pane|chrome|overlay|inset)" app components features lib --include=*.tsx | wc -l
grep -rEo "(bg|text|border|ring)-app-[a-z-]+" app components features --include=*.tsx | wc -l
grep -rn "<img" components app features --include=*.tsx | wc -l
pnpm build && pnpm exec tsx scripts/check-bundle-budget.ts
```

## Appendix E — ledger

Update one line per item when it ships: `ID: done (#PR)` or `ID: in progress (#PR): what is left`.

```
N1: pending
N2: pending
N3: pending
N4: pending
N5: pending
N6: pending
N7: pending
N8: pending
N9: pending
N10: pending
P1: pending
P2: pending
P3: pending
P4: pending
P5: pending
P6: pending
P7: pending
P8: pending
P9: pending
P10: pending
S1: pending
S2: pending
S3: pending
S4: pending
S5: pending
S6: pending
B1: pending
B2: pending
B3: pending
B4: pending
B5: pending
B6: pending
B7: pending
Q1: pending
Q2: pending
Q3: pending
Q4: pending
```
