# CSS & JS Runtime Audit — Tiered Stylesheets, Dead CSS, a Leaner Entry — 2026-10-09

> The ask: speed the site up further with a full CSS and animated-JS audit —
> remove or consolidate classes that are unused or could be combined, enforce a
> more consistent scheme, and replace or update JS UI libraries where something
> lighter or faster exists (or another language would do better).
>
> Companions: [`performance-audit-2026-10-08.md`](./performance-audit-2026-10-08.md)
> (frame budget at rest; its *Not done* list named the render-blocking
> `globals.css` as "a load-time project of its own" — this is that project) and
> [`ui-perf-audit-2026-10-09.md`](./ui-perf-audit-2026-10-09.md) (page-switch
> lag; its Part 2 measured the same sheet as the bandwidth bottleneck on 3G).
>
> Finding IDs: `CSS-x` stylesheets, `JS-x` the entry chunk, `LIB-x` libraries.

---

## How it was measured

- **Two production builds side by side** — `main` at `49a89c3` in a git
  worktree, and this branch — booted from `.output/server/index.mjs` against the
  same freshly migrated local Postgres.
- **Sizes** from the built assets (raw, gzip −9, brotli), and from the repo's own
  gates: `scripts/ci/bundle-budget.ts`, `pnpm run check:bundle-budget` (the CI
  gate) and `pnpm run check:entry-composition` on a `--sourcemap` build, which
  attributes every byte of the entry's static closure to its source file.
- **Correctness: a computed-style diff, not screenshots.** Playwright loads each
  scenario on both servers and compares 39 computed properties (box, spacing,
  colour, type, radius, shadow, filters, transforms, animation name) for every
  element in `<body>`, matched by DOM path and class list. 27 scenarios: 13 site
  pages, 10 full-screen games/apps, and four **client-side navigation chains**
  through `window.__TSR_ROUTER__.navigate()` (site→game, game→site,
  site→game→site, game→site→game), with a marker on `window` asserting the
  document survived each hop.

---

## CSS-1 — The site stopped downloading every game's utilities

**Before:** one entry sheet, `globals.css`, render-blocking on every page:
**488.7 KB raw / 68.3 KB gzip / 51.9 KB brotli**. Tailwind's scanner cannot know
which page a class name ends up on, so it carried every utility any of the ~60
full-screen games and apps use — 93,865 scanned candidates.

An import-graph walk from the site shell (`__root`, `_site`, `_site/**`) shows
**1,674 source files that no site page can ever render**: 93 `components/` and
`lib/` directories (every game and app) plus their route files.

**After:** two entry sheets over the same `globals.css` body.

| Sheet | Who loads it | Raw | gzip | brotli |
|---|---|---:|---:|---:|
| `globals-*.css` (before) | every page | 488.7 KB | 68.3 KB | 51.9 KB |
| `site-tier-*.css` | `_site` pages, `/login`, articles, embeds | **313.0 KB** | **48.5 KB** | **38.1 KB** |
| `app-tier-*.css` | full-screen games and apps | 484.4 KB | 67.6 KB | 51.3 KB |

A site page's render-blocking CSS is **−29% gzip / −36% raw** — less to
download *and* ~175 KB less to parse before first paint. Games pay what they
paid before.

### Why the app sheet is a superset, not "just the game utilities"

React 19 never removes a `precedence` stylesheet once it has inserted one, and
TanStack's `HeadContent` renders every head stylesheet that way. So after a
visit to a game its sheet stays in the document. Two *partial* sheets would then
interleave in an order Tailwind never sorted — a game sheet's `.p-4` landing
after the site sheet's `.px-2` — and silently change what a site page looks
like. A superset that lingers only repeats rules the site sheet already has, in
the same relative order (verified: all 12,195 site-sheet lines appear in the app
sheet in order), so no cascade outcome can change.

The other half of the guarantee is in `lib/style-tier.ts`: once a document holds
the superset it keeps using it, so the site sheet is never inserted *after* it
(the game→site→game hazard).

### Pieces

- `app/site-tier.css` / `app/app-tier.css` — the two entries. `globals.css` lost
  its first line (`@import 'tailwindcss'`) and is otherwise the same body; every
  test that reads it as text is unaffected.
- `lib/style-tier.ts` — `styleTierFor()` picks per route: `_site/**` and the
  root-only 404 take the site sheet; top-level routes take the superset unless
  listed in `SITE_SHEET_ROUTES` (`/login`, articles, embeds…). Forgetting to list
  a new page costs it bytes, never styles.
- `installStyleTierPreload()` warms the app sheet from a site page on three
  signals the site already acts on: the router *preloading* an app-tier route
  (a hovered `<Link>`, or an on-screen link on a fast connection — the existing
  `viewport-prefetch` policy, Data Saver included); a client navigation into
  the app tier starting (the sheet starts with the chunk, not after it); and
  hover/focus/touch on a **plain `<a href>`** into the app tier — see the cost
  note below for why that one matters most.
- `scripts/fix-ssr-css-hash.mjs` handles both entry names.

### Gate: `lib/__tests__/style-tiers.test.ts`

The site sheet's skip list is a manifest, and the test keeps it honest in both
directions:

- **correctness** — walks the import graph from everything that takes the site
  sheet and fails if any import lands in a skipped path (a site page missing its
  utilities);
- **leanness** — fails if a `components/` or `lib/` directory is imported only by
  full-screen routes yet still scanned by the site sheet, printing the line to
  add. It fired during this audit: once `/speedruns` stopped importing
  `lib/game/replay` (JS-1), `lib/daily-puzzles` and `lib/lights-out` became
  game-only and it asked for them.

Mutation-checked: excluding `components/feed` makes it fail with the offending
files listed.

### Results

- SSR links the right sheet for every route type, including the 404.
- **Computed-style diff: 0 CSS-caused differences** — 27 scenarios on the
  default theme at 1440px, and 20 each under Midnight (`.style-graphite`), High
  contrast and a 390px touch phone: ~16,000 element comparisons. The only
  deltas were sub-pixel `width`s on `font-mono`/`font-serif` text with identical
  `font-family` and identical loaded faces, and they **swap sides between runs**
  (67.20 vs 67.44 px on one element, either server) — text-rendering timing of
  the `font-display: optional` faces, not either build's CSS.
- **No unstyled frame on a client switch.** At 3G (1.6 Mbit/s, 300 ms RTT),
  `/games` → `/daily`: the app sheet request starts 32 ms after navigation
  begins, and a `MutationObserver` saw no `/daily` DOM before the sheet had
  loaded.
- **The cost, stated plainly.** Before the split, every page shared one sheet,
  so a game opened from the site found its CSS already cached. Now the first
  game of a session needs the app sheet (~68 KB gzip; cached afterwards). Most
  of those trips are full document loads — the tiles on `/games` and `/apps`
  are plain anchors — so the sheet is fetched on hover/focus/touch of the tile,
  or earlier when the viewport prefetcher warms an on-screen game link on a fast
  connection. A cold tap with nothing warmed (Data Saver, or a slow link where
  the site deliberately doesn't speculate) downloads it with the game. On the
  throttled 3G profile a client-side switch with nothing warmed measured
  roughly +0.1–0.4 s over `main`. In exchange every site page — the majority of
  page views, and every visitor's first — paints with 20 KB gzip less on the
  critical path and ~175 KB less CSS to parse.

---

## CSS-2 — 4,000 lines of CSS nothing renders

Every class selector in the 55 hand-written sheets was checked against every
source file (TS/TSX/JS/HTML/JSON/MD under `app`, `components`, `lib`, `hooks`,
`stores`, `server`, `public`, `data`), with dynamically built names
(`` `ds-ms__cell--n${n}` ``, `` `--rmhfash-swatch-${id}` ``) and
library-generated DOM (MapLibre's `.maplibregl-canvas`) checked separately.

| Removed | Count |
|---|---:|
| Rules or selector-list entries whose class nothing renders | 537 |
| `@keyframes` left with no user | 32 |
| Theme tokens (`--x`) nothing reads | 23 |
| **Lines** | **~4,070** across 23 sheets |

The biggest were leftovers of features that were rebuilt: the old Dunesday
landing page (~1,200 lines, before Dunesday 7's desktop), the old Lockdown
landing (~790 — `lockdown.css` is now just the legal-page layout), RMHLadder's
retired shell and drawer (~700), RMH Vibe's old gallery/account menu (~320), and
the pre-radial top nav and bottom dock in the shell-wide `feed.css` (~300; the
entry `index-*.css` went 12.8 → 8.7 KB).

The removal is selector-aware, which mattered: a dead class inside
`:is(.glass-fill, …, .glass-chrome--aside)` drops out of the list rather than
killing the rule, and `:not(.dead)` is treated as always-true. Kept on purpose,
though currently unused, because the design language *prescribes* them:
`.glass-chrome--aside` (the escape hatch for `position: fixed` inside blurred
chrome) and `.media-scrim` / `.media-scrim-full`. The display scale lost its two
unused hero steps (`--site-display-1/2`); the comment says how to restore them.

`design-consistency.test.ts`'s `CSS_DEBT` ratchet lowered five entries to match
(the prune removed hardcoded colours and radii with the rules).

---

## JS-1 — What every page's entry carried that it never runs

A `--sourcemap` build attributed the entry's static closure by source file. Every
route *definition* is in it (`routeTree.gen.ts` imports all of them; Start's
splitter lifts out only components), so anything a definition touches at top
level runs on every page. Four such leaks, all fixed:

| Leak | Size (min) | Fix |
|---|---:|---|
| **zod**, via three route `head()`s reading `REPLAY_GAME_TITLES` from `lib/game/replay.ts` and `/slice-it/`'s `validateSearch` schema | ~70 KB | Titles and version tags → zod-free `lib/game/replay-meta.ts` (re-exported from `replay.ts`). The search schema → hand-rolled `validateLibrarySearch` in zod-free `lib/slice-it/library-search.ts`, typed with TanStack's `SearchSchemaInput` so `<Link to="/slice-it">` still needs no `search`. **Fuzzed against the old schema: 0 mismatches in 20,000 random inputs** plus non-object payloads. |
| RMHbox minigame registry, via `/rmhbox/minigames`' `head()` printing `getAllMinigames().length` | ~10 KB | The description no longer carries the count. |
| RMHbox history registrations, a bare `import '…'` in a route file | ~8 KB | `lib/rmhbox/history-display.ts` performs the registration *and* exports `getHistoryDisplay`, so it travels with the component chunk. |
| The whole `/rideshare` landing page — the route **exported** its component, which the splitter cannot move | ~9 KB | Un-exported. |

zod was the one dated exception in `check-entry-composition.ts`'s
`KNOWN_VIOLATIONS` ratchet since 2026-08-05; it is gone from the entry, so the
baseline is deleted and zod in the entry is a plain failure again.
`route-css-imports.test.ts` gained two rules for the other two shapes (no bare
side-effect import of a module in a route file; a page route exports only its
`Route`), mutation-checked.

| Critical path (`main` → JS-1 → JS-2) | `main` | after JS-1 | after JS-2 |
|---|---:|---:|---:|
| Eager JS, brotli (`scripts/ci/bundle-budget.ts`) | 303.1 KB (over its 300 band) | 278.3 KB | **242.7 KB** |
| Entry chunk, raw (CI gate, budget 525.3 KB) | 628.6 KB ✗ | 594.1 KB ✗ | **460.2 KB ✓** |
| Critical path, raw (CI gate) | 1,202.3 KB | 1,090.5 KB | **956.6 KB** (−20%) |
| Critical path, brotli (CI gate) | 336.6 KB | 309.9 KB | **274.4 KB** (−18%) |

## JS-2 — No translation catalog on the critical path, English included

After JS-1 the CI gate's *entry raw* row was still red (594 KB against 525 KB —
red on `main` too, at 628 KB). The largest single item left in the entry was the
**English core catalog, ~136 KB minified**: 13 namespaces (`feed` alone is
74 KB of JSON) bundled so the shell and feed could hydrate in English. The
sourcemap charges it to `react-i18next/I18nextProvider.js`, which is why the
composition table read "react-i18next 138 KB".

Nothing on screen needs it. Every `t()` call carries a `defaultValue`, so
English can render from those on the server and on the client's first render
alike — hydration matches by construction — and the catalog can arrive at idle,
as the non-core English catalog already did. That is safe only if every default
says exactly what the catalog says, so that the catalog landing changes nothing.
It did not, quite:

| Found | Count | Fix |
|---|---:|---|
| Core defaults that drifted from the catalog (casing, `...` vs `…`, stale copy) | 33 | Default aligned to the catalog — the text users already saw, so nothing visible changes |
| Plural calls passing one default for both forms | 4 | `defaultValue_one` + `defaultValue` |
| English catalog plurals that were wrong ("Show 3 more **reply**", "3 new **post**") | 2 | `_other` corrected in `locales/en/feed.json` |
| `poll-option-placeholder`: catalog `Option {{index}}`, code passed `count` — rendered "Option " with no number | 2 call sites | Pass `index` (Arabic had grown bogus plural forms off the stray `count`; it now uses its base translation) |
| Template-literal defaults (`` `Page ${n}` ``) the extractor can't read, so it wrote `""` into every locale — and i18next returns `""` as-is, so the text went **blank** once the catalog loaded | 17 calls / 19 keys in `admin`, `c-library`, `c-circle` | Interpolated defaults (`'Page {{page}}'`), English catalog filled in; the other locales keep their `""` placeholder, which the translate workflow picks up because the English source changed |

Then `resources.en-core.ts` is deleted and no catalog is bundled: the server
renders English from defaults (`getServerI18n`), the client initialises with no
English resources, and `backfillEn()` loads the whole catalog after `load` +
idle — for other locales' fallback and anything read without a default.

**Gates.** `i18n-default-drift.test.ts` now covers every namespace (it used to
exempt the bundled ones — the 41 drifts were hiding there) and gained a rule:
every call with a literal key carries a **literal** default (a template-literal
default is reported as none, with the reason). `i18n-code-splitting.test.ts`
lost its `resources.en-core` exception. Both mutation-checked.

**Verified at runtime**, because 58 core calls build their key from data and no
static check can vouch for those: each page rendered twice from the same build —
once with the English catalog request **blocked** (what a visitor sees before the
backfill) and once with it loaded — diffing every visible text node plus
`placeholder`, `aria-label`, `title` and `alt`, with the command palette and the
shortcuts sheet opened on each.

| Pass | Renders | Strings | Differences |
|---|---:|---:|---:|
| Signed out, 34 pages × 1440 + 390 px | 68 | ~21,900 | **0** |
| Signed in, 16 pages (settings, messages, notifications, wallet, profile…) × 2 widths | 32 | ~12,400 | **0** (one render came back signed-out and was re-run clean twice) |
| German locale (`rmh-lang=de`), 6 pages | 6 | ~2,200 | **0** — German renders server-side, English fallback unchanged |

No new hydration errors. Five pages (`/games`, `/apps`, `/store`,
`/leaderboard`, `/pricing`) log React #418 with or without the catalog — and on
the PR's previous commit, and on a fresh build of `main`. It is pre-existing: on
`/games` the server renders "Loading your standings…" where the client renders
the signed-out state, and the stack points into the subtree
`DeferOnNavigate` wraps. Out of scope here; reported separately.

### The eager-CSS budget was measuring the wrong file

`platform_eager_css` (40 KB brotli) summed only the CSS the manifest attaches to
the entry chunk — the 3 KB `index-*.css`. The real render-blocking sheet is
linked from `__root`'s head through a `?url` import, so no manifest lists it and
the budget never saw it. It now counts the site-tier sheet. Honest figure:
**~40 KB** on this branch, where `main` would read ~55 KB.

---

## LIB — Libraries: what was replaced, and what was not

- **zod** — off the critical path (JS-1); still used by server functions and
  game/app chunks, where it belongs.
- **`uuid`, `lodash-es`, `immer`** look unused by the app, but are resolved from
  our `node_modules` at runtime to bundle user-made RMH Vibe pages
  (`lib/rmhvibe/vibe-packages.ts`, tier `inline`). Removing them would break
  published Vibe pages. Kept.
- **framer-motion** (`motion-dom` + `framer-motion`, ~42 KB min in the entry,
  behind `LazyMotion`) — 108 files use it. A wholesale swap is a large rewrite
  for a cost the entry composition does not single out; the 08-12 audit already
  moved scroll reveals to CSS. The `LiquidTabs` `layoutId` thumb the previous
  audit flagged was looked at and left: since NAV-1 its layout read is the
  commit's *first*, so it duplicates nothing, and a CSS-only thumb would either
  paint no selection until JS measured it (losing the server-rendered state) or
  need the same forced read for a FLIP.
- **tailwind-merge** (26.5 KB) — `cn()`'s override semantics are relied on by
  every primitive that accepts `className`; `clsx` alone would let a default win
  over a caller's override. Kept.
- **sonner** (32.8 KB) — mounted globally; `toast()` and `<Toaster>` live in one
  module, so lazy-loading the toaster saves nothing. Kept.
- **Another language?** Nothing on this path qualifies. CSS is parsed by the
  browser; the entry's JS is React, the router and i18n. The one measured WASM
  candidate remains the Slice It STFT, where `worker_threads` is the first fix
  (08-12 audit).

---

## Not done (and why)

- **React #418 on five pages, pre-existing on `main`** (JS-2 above). A
  session-dependent render mismatch, not a size or i18n issue.
- **App-route-only rules still in `globals.css`** (`.app-viewport`, `.app-page`,
  `html.app-route …`, ~2.5 KB raw): some top-level pages that take the site sheet
  also get `html.app-route`, so moving them needs a per-route audit for ~0.5 KB
  brotli.
