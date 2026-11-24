# RMH Med Schools redesign (roadmap item 11): implementation plan

Written from a read-only pass over the repo; paths are repo-relative. Where a claim could not be verified, it says so.
**Status (2026-11-24): phase A is built** (see "Phase A as built" below, which corrects this plan where the code
differed) and "Phase B1 as built". B2, B3, C and D are not started.

## Owner answers (2026-11-24)

These settle the open questions in section 7 and override the plan text where they differ.

1. **Matriculation.** Add a tracker milestone ("Matriculating", purple in a member's timeline). The public live feed
   shows it only if a source ever reports it. (Needs an additive `MedMilestoneType`/event value: B3, not A.)
2. **Applicant-reported figures.** Keep them on school pages, in a separate section clearly labelled "reported by
   applicants"; official figures stay in the main stat tiles (C).
3. **Body font: DM Sans**, the site font already loaded. **No Inter.** Fraunces is for headings only. (Section 2.5's
   Inter plan is void.)
4. **AI school list.** Save the stats and the last generated list privately to the account, never shared. (Section 5's
   "answer is not stored" is void: D adds a stored list, in the erasure ops, and a boundary test that no public read
   path touches it.)

## Phase A as built (where the code differed from this plan)

- **Admin relocation** was its own first commit (`components/admin/medschools/`); the admin test's path reads moved with
  it.
- **Routes.** Seven page routes moved, not six: `practice` (interview prep) landed after the plan was written. It is in
  `features/medschools/feature.ts` now, with the layout file.
- **Stylesheet tier.** `SITE_SHEET_ROUTES` accepted `/rmh-medschool`, but `style-tiers.test.ts` failed: the layout
  imports `preloadFont` from `lib/fonts/self-hosted.ts`, and `app/site-tier.css` had `@source not "../lib/fonts"`. That
  directory holds only that one function (no classes), so the exclusion line was removed rather than falling back to the
  app sheet.
- **Fonts.** Inter dropped (owner answer 3). Only the `usedBy` string of `app/fonts/fraunces.css` changed.
- **Portals.** The plan did not cover dialogs and popovers, which portal to `<body>` outside `.medapp-theme`. The tokens
  and the `--site-*` bridge are therefore also set on `<html>` while the app is mounted (`:root:has(.medapp-theme)`).
  Phase B should confirm each dialog, or give them a `useDialogHost`.
- **Rail.** Removing the margin takeover would have dropped the live rail, so phase A mounts `ActivityRail` in `MedApp`
  at >= 1280px (the plan deferred it to B1).
- **Painterly wash.** Raster route, not the CSS fallback: `scripts/medschools/render-wash.mjs` renders the mockup's four
  blobs through its own SVG filters in headless Chromium, once, at 1280x1600 CSS px drawn at half scale, with a mask
  that fades the tile to nothing over 240px at top and bottom. Output is
  `public/images/medschools/wash-{light,dark}.webp` (about 17 KB and 15 KB). The mockup's grain layer is omitted (noise
  does not compress). The script takes `CHROMIUM_PATH` for a browser Playwright did not download itself.
- **Surfaces are solid.** The mockup's paper is translucent (0.72 to 0.78); the tokens are opaque approximations, so
  contrast is deterministic over the wash.
- **Chart tokens.** `--app-med-chart-n` carries the darker line colours and `--app-med-chart-n-fill` the mockup's
  pastels; the bridge maps `--site-chart-n` to the line colour so existing charts keep working. B2 retires
  `--site-chart-*`.
- **`withdrawn`** has a neutral status pair, as proposed.

## Phase B1 as built

- **Status primitives** (`features/medschools/ui/status/`): `status.ts` (eight keys, icon paths from the mockup, the
  label key of each), `StatusIcon`, `StatusText`. Mapping: ACCEPTANCE green, REJECTION red, HOLD dark blue, SECONDARY
  light blue, WAITLIST yellow, INTERVIEW orange, WITHDRAWN neutral, and the tracker's MATRICULATED purple;
  SECONDARY_SUBMITTED shares the light blue, SUBMITTED and COMPLETE have no colour. **The live feed's SECONDARY is
  "secondary received"** (sources report the school sending one; the tracker's own SECONDARY milestone is "Secondary
  received"), so it is labelled "Secondary", not "submitted"; only the private SECONDARY_SUBMITTED milestone says
  "Secondary submitted".
- **Contrast test** (`status.test.tsx`) parses `medschools.css`: text 4.5:1 on paper and ground, ink 3:1 on its swatch,
  paper and ground, in light and dark, for every key. All sixteen pairs passed with the mockup's values, so no token was
  darkened (the lowest: light green text on the ground, 4.56:1; light green ink on its swatch, 3.94:1). A lighter
  light-blue text for "secondary" (2A78B5) would have failed 4.5:1 on the ground, so the mockup's 2F6795 stays; hold and
  secondary are told apart by swatch, icon and label.
- **Matriculating** (owner answer 1): `MATRICULATED` after `ACCEPTANCE` in `MedMilestoneType`, migration
  `20261207090000_medschools_matriculated` (one `ALTER TYPE ... ADD VALUE`). Private like SECONDARY_SUBMITTED
  (`SHAREABLE: null`; the share-sync test and an integration test hold that no event is written). Wired through the
  milestone list (and so the zod schemas, the milestone form and the import's type list), the timeline (measured from
  the acceptance), the chance line (closing), the import cycle rule (the acceptance's), the AI import prompt and the
  label. The tracker row and the timeline draw it, and the other coloured milestones, with `StatusIcon` and `StatusText`.
- **Live rows** are name-first: the school's full name, then the status in its colour (weight 600) with the swatch at
  the left, then a muted 12px line of program, place, time and source. `compact` (the rail) drops the source and the
  swatch shrinks to 32px.
- **Restyled onto the app tokens:** `LiveRow`, `LivePage`, `ActivityRail` (a paper panel), `IndexPage`, `SchoolCrest`,
  `ProgramToggles`, `ProgramSetToggles`, `CategoryToggles`, `OptionGroup`, `SaveToList` (a 44px round button), `PrefsNote`,
  `WaveNote`, `skeletons`. `PageLayout` is untouched (other site pages use it); these two pages render `PageHead` instead.
  The index gained a "Live activity" chip so the page is reachable from the index.
- **Wash:** 34px blur, blobs 1.3 times larger, `background-size: max(100%, 900px) auto` (a phone shows a 900px crop).
  `wash-light.webp` 25.2 KB, `wash-dark.webp` 19.7 KB.
- **Left for B2:** the school page and tabs, the charts (retire `--site-chart-*`). **B3:** the tracker, lists, ask,
  secondaries, rolling, the import, and the last `--site-*` bridge consumers; their title rows still duplicate the top bar.

## 0. What the code says (the findings that shape the plan)

1. **Routes today.** Six files under `app/routes/_site/rmh-medschool/`: `index`, `live`, `$slug`, `tracker`, `lists`,
   `ask`. The `/admin/medschools` page is a separate `_site` route.
   - **How a full-screen app is mounted.** `app/routes/rmhstudy.tsx` and `rmhtype.tsx` are top-level layout routes with
     a sibling directory. Each wraps `<Outlet/>` in `AppShell` and links its own stylesheet through `head()` with
     `?url`.
   - **Differences for this app.** It is public and SEO'd, so no auth gate. It is a scrolling document, so it uses
     `.app-page` (`app/globals/comfort-suite.css`), not `.app-viewport`.
2. **Closest precedent: RMHMusic.**
   - Its light and dark palettes are plain CSS: light is the base, dark sits under `prefers-color-scheme` and
     `html[data-app-dark]`. Server HTML is therefore right with no script.
   - A pre-paint entry in `APP_ROUTE_THEME_BG` (`stores/themeStore.ts`) with `system: true` paints the document ground.
   - A hook (`components/rmhmusic/useRmhMusicMode.ts`) runs the toggle.
   - The key is registered in `lib/device-data/registry.ts`.
   - Its static paper band is the precedent for a decorative layer. It is CSS, never changes, and has no script.
3. **Tier membership is recorded in lists.** `FULLSCREEN_TIER_DIRS` and `FULLSCREEN_ROUTE_SEGMENTS` in
   `eslint-local-rules/design-scope.js` are read by eslint, `css-tiers.ts`, `design-consistency`, `ios-edge-contract`
   and `scripts/check-consistency.sh`.
   - Its header says "entries come out, they do not go in". Those words govern the exemption baselines, such as
     `STEEL_PALETTE_BASELINE`.
   - The same file has long carried whole apps that joined the tier (`steam`, `sohumtracker`, `dunesday`, `elections`),
     each with a comment naming the owner decision.
   - Joining the tier is the sanctioned path (CLAUDE.md L8, D13). Add a comment citing the owner's item-11 approval, and
     say in the commit message that the rule was changed on purpose (CLAUDE.md "If a rule is genuinely wrong, change the
     rule").
   - The awk parse needs one quoted name per line.
4. **App-tier CSS hex rule.** `design-consistency.test.ts` strips only declarations matching `--(app|site)-…` from the
   hex count in app-tier CSS (`APP_TIER_DIRS`).
   - **Consequence.** Every colour must be defined as an `--app-*` token. I propose `--app-med-*` for domain tokens
     (status, wash, chart). A `--medapp-*` prefix would trip the gate.
   - It also means adding `medschools` to `APP_TIER_DIRS` in `lib/__tests__/css-tiers.ts` so the CSS stays under the
     `!important` ratchet and the keyframes gate. That is how `rmhstudy` and the other apps are held.
5. **Two things block a naive tier move.**
   - **Admin UI.** `features/medschools/ui/` also holds the admin UI: `AdminMedSchoolsPage`, `AdminMedSchoolsLink`,
     `AliasMissesPanel` and `QaLimitRequestsPanel`. They render on `/admin/medschools`, a Steel `_site` page. Exempting
     the `medschools` directory would silently drop them from the site-tier lint, and an `@source not` of `ui` would
     break the style-tiers test. They must move out.
   - **Chart tokens.** `--site-chart-1..5` live in the site theme classes. `html.app-route` suppresses those classes
     (`THEME_EXCLUDED_ROUTES`), so the charts would lose their colours.
6. **Status data gap.**
   - `MedEventType` is SECONDARY, INTERVIEW, WAITLIST, REJECTION, ACCEPTANCE, WITHDRAWN and HOLD. There is **no
     matriculation** event, and the tracker's `MedMilestoneType` has none either.
   - The mockup's purple "Matriculating" has no data source today.
   - WITHDRAWN has no colour in the owner's list. I propose neutral muted.
7. **Public stats gap.** `MedSchoolStats` is applicant-reported (CycleTrack, Admit, SDN, RMH); the `MedSource` enum has
   no public-source value.
   - **Per-school coverage.** My recollection, to be verified before building, is that AAMC FACTS has per-school
     applicants and matriculants by state of residence, but per-school MCAT and GPA medians are MSAR-only. If so, MCAT
     and GPA tiles come from schools' own class profiles, and coverage will be partial.
   - **Licensing.** I could not check the AAMC FACTS or Choose DO reuse terms. Confirm them before the import.
8. **Precedent for curated data.**
   - `data/medschools/school-pages.json` is validated by `scrape/school-pages.ts` and loaded once per file hash by
     `ensureSchoolPagesImported` (a `MedSourceRun` row is the done-flag). It fills `MedSchoolAdmissionsPolicy`, which
     has `url` and `checkedOn` columns.
   - Phase C copies this pattern.
   - The Q&A gates in `api/qa/` (`admitQuestion`, `runUnderLease`, the `ai-budget.ts` share) are the precedent for phase
     D. The tracker import already reuses them ("one import is one daily question").

## 1. Phasing (five mergeable PRs, with a different split from yours)

I would adjust your split in two ways: A takes on the admin relocation, and B is cut into three PRs because the UI is
about 11.8k lines.

| PR     | Scope                                                                                                                                                                             | Depends on                   |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| **A**  | Shell, theme, tier move, top bar, wash, fonts. Existing pages keep their markup but pick up the new palette through a `--site-*` bridge, so A is visually coherent and shippable. | none                         |
| **B1** | `StatusIcon` and status palette, name-first `LiveRow`, `LivePage`, `ActivityRail` as the desktop live column, `IndexPage`, `SchoolCrest`, shared controls.                        | A                            |
| **B2** | `SchoolPage` and tabs, charts (recolour), `ArrivalsSection`, `SchoolFacts`.                                                                                                       | B1                           |
| **B3** | Tracker, lists, ask, secondaries, rolling, `SaveToList`, skeletons and empty states.                                                                                              | B1                           |
| **C**  | Public school stats panels plus data model and import.                                                                                                                            | B2                           |
| **D**  | Private stats plus AI school list.                                                                                                                                                | C (needs the public medians) |

B3 and C can run in parallel after B2.

## 2. Phase A, concretely

### 2.1 Routes and layout

- **New** `app/routes/rmh-medschool.tsx`, a pathless-URL top-level layout `createFileRoute('/rmh-medschool')`.
  - `head()` returns only `links`: the `?url` stylesheet `features/medschools/ui/medschools.css` and `preloadFont(...)`
    links. It uses neither `appRouteHead` (it needs a catalog app) nor an auth `beforeLoad`.
  - It declares its own `errorComponent` and `notFoundComponent`. `_site.tsx` supplied those frames before, so without
    them an unknown slug would render a bare 404 outside the app.
  - It renders `<MedApp><Outlet/></MedApp>` from `@features/medschools/ui/shell/MedApp`. Keep the component in the
    feature so the route file stays thin.
- **Move (git mv), URLs unchanged:** `app/routes/_site/rmh-medschool/{index,live,$slug,tracker,lists,ask}.tsx` become
  `app/routes/rmh-medschool/…`. Change only the `createFileRoute` ids, from `/_site/rmh-medschool/…` to
  `/rmh-medschool/…`. Loaders, `definePage` heads, search validators and `noIndex` stay.
- **Stylesheet tier.** Add `'/rmh-medschool'` to `SITE_SHEET_ROUTES` in `lib/style-tier.ts`.
  - **Why.** Top-level routes otherwise take the ~500 KB app superset sheet, which would be a regression for public SEO
    pages.
  - **Why it works.** `app-theme-tokens.css` is imported by `globals.css`, so `bg-app-*` utilities exist in the lean
    sheet. `features/medschools` is not `@source not`-excluded (only `scrape` is), so nothing needs excluding.
  - **Fallback.** If `style-tiers.test.ts` objects, fall back to the app sheet and add `@source not` lines for
    `features/medschools/{ui,engine}` in `app/site-tier.css` after the admin move.
- **Admin relocation, first commit of A.**
  - Move `AdminMedSchoolsPage`, `AdminMedSchoolsLink`, `AliasMissesPanel`, `QaLimitRequestsPanel` and
    `admin-page.test.ts` to `components/admin/medschools/`.
  - Update the imports in `app/routes/_site/admin/medschools.tsx` and `app/routes/_site/admin/index.tsx`.
  - They stay Steel and stay site-tier linted.
- **Shell column.**
  - Delete the `/rmh-medschool` entry from `components/shell/margin-takeover.ts`. Leave the mechanism and `MarginColumn`
    alone.
  - The rail is mounted in `MedApp` instead (see B1). Update `ui-rules.test.ts`, which asserts that entry.
- **Cookie notice.** `<CookieConsent/>` is mounted only in `_site.tsx` and `login.tsx`. A visitor landing on a med
  school page would never see the notice.
  - Mount it in `MedApp` inside a `SilentErrorBoundary`, as `_site.tsx` does.
  - It is `fixed` at the bottom, an existing iOS pattern. Check it in the iOS screenshots.
  - The command palette, "/" shortcut and what's-new overlays from `SiteOverlays` are intentionally lost, as in other
    apps.

### 2.2 Theme tokens and storage

- **CSS file** `features/medschools/ui/medschools.css`, with `@import '../../../components/shared/app-theme.css'` first,
  as `rmhstudy.css` does.
  - Scope `.medapp-theme`: light is the base, dark under `@media (prefers-color-scheme: dark)` except
    `html[data-app-dark='0']`, plus `html[data-app-dark='1']`. Copy the `rmhmusic.css` structure.
  - Define the `--app-*` contract: bg, surface, border, text, accent, radii around 22 to 26 px.
  - Define `--app-med-*`: wash 1 to 4, on-wash ink, the seven status pairs (swatch, ink, text; light and dark values
    from `Main.dc.html`), and chart 1 to 5.
  - **Bridge.** Also set the `--site-*` values (bg, surface, border, text, text-muted, accent, success, danger, radii)
    inside `.medapp-theme`. Existing Steel-class components and the shared `Button`, `Select` and `SearchField` then
    render in the pastel palette immediately, which makes B incremental.
  - Set `color-scheme` per mode.
- **Storage.** The `useMedMode` hook lives at `features/medschools/ui/shell/useMedMode.ts`, copied from
  `useRmhMusicMode`. Its key constant lives in `features/medschools/engine/mode.ts`: `rmh-medschool-mode`, JSON
  `{"dark": boolean}`.
  - **Default is the OS preference.** This is device-local, not synced to the account, and does not follow the site
    Day/Night edition. Following the edition would require changing the pre-paint script, and `html.app-route` already
    suppresses the site theme class on app routes.
  - **Pre-paint entry.** Add
    `'/rmh-medschool': { key: 'rmh-medschool-mode', darkFlag: 'dark', system: true, dark: '#1B1E2A', light: '#F6F1E7' }`
    to `APP_ROUTE_THEME_BG` in `stores/themeStore.ts`. `fouc-contract.test.ts` pins `system: true` or `defaultDark`, and
    that the key string is persisted by the page.
  - **Theme exclusion.** Add `'/rmh-medschool'` to the unlisted array in `lib/prepaint/theme-routes.ts`, as
    `/sohumtracker` and `/games` are. The feature has no catalog entry, so it is not derived. Run `pnpm gen` to
    regenerate `lib/prepaint/generated.ts`.
  - **Device registry.** Add `'rmh-medschool-mode'` next to `'rmhmusic-mode'` in `lib/device-data/registry.ts`.
    `device-registry.test.ts` checks both directions.
  - The toggle's pressed state is `null` on the server and the hydrating render, as in RMHMusic.

### 2.3 Top bar

- `features/medschools/ui/shell/MedTopBar.tsx`. It does not reuse `AppHeader`, whose three-column centred-title layout
  differs from the mockup. It reuses `useBackOrFallback` (`hooks/useBackOrFallback.ts`).
  - It contains a 44 px round back button, the Fraunces title, an optional search, and the theme toggle.
  - **Back targets (fallback).** Index goes to `/services`, the hub that lists it. `live`, `$slug`, `tracker`, `lists`
    and `ask` go to `/rmh-medschool`. A school page may pass "Back to all schools".
  - **Back is unconditional,** present on every route including the 404 and error frames.
  - It is in-flow, not `sticky top-0`. On ≥1024 px it may be `sticky` with a non-zero top offset, which the iOS contract
    allows.
- **Layout wrapper** `MedApp.tsx`.
  - It renders `AppShell` (toaster, keyboard inset, `data-tier`) with `appClassName="medapp-theme"` and no `theme` prop,
    so the CSS-driven modes apply.
  - Inside it is `.app-page`, a max-width 1240 px container, `MedTopBar`, and a grid of `<main>` plus a desktop-only
    `<aside>` slot for the live rail.

### 2.4 Painterly wash (static, no iOS bar problem)

- **Do not ship the mockup's SVG filters.** `feTurbulence`, `feDisplacementMap` and `feGaussianBlur` over a
  document-sized layer re-rasterise, the `filter-cost-budget` and app-tier gates dislike them, and the mockup draws them
  in a full-height `absolute` SVG.
- **Pre-render once.** A dev script, `scripts/medschools/render-wash.mjs`, renders the mockup's blobs and grain with
  headless Chromium (already available for thumbnails and e2e). It emits a vertically tileable alpha WebP per mode into
  `public/images/medschools/` (about 60 KB or less each, committed output).
- **Paint.** It is the `background-image` on `.medapp-theme`, with `repeat-y`, a width-based size, and
  `background-attachment: scroll`. The layer is in the document's flow.
  - **Never `position: fixed`.** There is no animation, no `@keyframes`, no JS and no canvas. A raster is the one place
    the app tier departs from "CSS paints it".
  - **Strip colour on iOS.** Make the first and last ~48 px of the asset fade to the exact ground colour. iOS Safari
    fills its status and tab strips from the body ground (`paintDocumentGround`), the same reason
    `html.ios-webkit:not(.app-route) body::before` exists.
  - **Low-data fallback.** Under `@media (prefers-reduced-data: reduce)` drop the image.
  - **Handheld query.** Do not invent a handheld query. If one is needed it must be exactly
    `(pointer: coarse) and (max-width: 1024px)` (`handheld-tier.test.ts`).
  - **Fallback.** A CSS-only fallback is stacked `radial-gradient`s plus a ~6 KB inline grain tile. It is zero-request
    and loses the brushed look.

### 2.5 Fonts

- **Fraunces.** `app/fonts/fraunces.css` already exists. It is generated, variable, and `font-display: optional`. Its
  header says "Loaded by: adaptive-intelligence"; update the `usedBy` string in `scripts/gen-self-hosted-fonts.ts` and
  regenerate. Link it from the layout `head()` and preload `fraunces-latin-opsz-normal.woff2` (67 KB) via `preloadFont`
  (precedent: `adaptive-intelligence.tsx`, `rmhmusic.tsx`). With `optional`, the preload decides whether the headings
  get the face on a first visit.
- **Inter (void: owner answer 3, DM Sans stays the body face).** `app/fonts/choice/inter.css` exists, swap, with a
  metric fallback. It is currently linked only for readers who chose it. Link it from the layout head (48 KB variable).
  - `font-choice-assets.test.ts` pins only the site sheet to DM Sans and DM Mono, so a route-linked sheet is fine.
  - Update that generated file's "Loaded by" text.
- **Tokens.** `--app-font-display: 'Fraunces', Georgia, serif` and `--app-font-body: 'Inter', 'Inter Fallback', …`. Both
  are self-hosted, nothing comes from Google.
- **Cost note.** About +115 KB of fonts against DM Sans, which is already cached from the rest of the site. See the open
  question on fonts below.

### 2.6 Gates, tests and what to add

| Gate                                                  | Action in A                                                                                                                                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `eslint-local-rules/design-scope.js`                  | Add `'medschools'` to `FULLSCREEN_TIER_DIRS` and `'rmh-medschool'` to `FULLSCREEN_ROUTE_SEGMENTS`, with an owner-decision comment (3). Keep the one-name-per-line shape.                                                                                                                                                                                                                                                 |
| `lib/__tests__/css-tiers.ts`                          | Add `'medschools'` to `APP_TIER_DIRS`.                                                                                                                                                                                                                                                                                                                                                                                   |
| `design-consistency`, `steel-flat`, `steel-tokens`    | `steel-flat` and `design-consistency` follow the lists automatically. `steel-tokens.test.ts` pins `--site-chart-*` to medschools; B2 recolours the charts onto `--app-med-chart-*`, then delete the `--site-chart-*` tokens and that test case.                                                                                                                                                                          |
| `ui-rules.test.ts`                                    | Rewrite the Steel-on-content rules. They forbid `rounded-*`, `shadow-*`, `backdrop` and `uppercase` and would now be wrong. Replace them with app-tier rules: tokens only, no hex, no `@keyframes`, no `fixed`. Keep the i18n, no-`fetch`, no-`createServerFn` and thin-route rules. Change the route paths.                                                                                                             |
| Test path strings                                     | Update every `app/routes/_site/rmh-medschool` reference: `pages.test.tsx`, `useEffectiveView.test.tsx`, `school-page.test.tsx`, `ui-rules.test.ts`, `features/medschools/feature.ts` `routes[]`. **Also fix** `engine/stats/stats-boundary.test.ts` and `engine/secondaries/boundary.test.ts`. They filter by existing directory and would pass vacuously after the move, silently dropping anonymity boundary coverage. |
| `style-tiers.test.ts`                                 | `SITE_SHEET_ROUTES` entry (2.1).                                                                                                                                                                                                                                                                                                                                                                                         |
| `fouc-contract.test.ts`, prepaint tests               | Section 2.2 entries.                                                                                                                                                                                                                                                                                                                                                                                                     |
| `og-page-coverage.test.ts`                            | URLs are unchanged; `rmh-medschool.tsx` next to `rmh-medschool/` is detected as a layout and skipped. Static cards for `/rmh-medschool` and `/live` already exist in `lib/og/static-cards.ts`. Run it to confirm.                                                                                                                                                                                                        |
| `ios-edge-contract.test.ts`                           | App dirs are outside the ratchet, but obey the rule: no `fixed`, in-flow wash and bar. Run the iOS Safari screenshots workflow (`.github/workflows/ios-safari-screenshots.yml`), as CLAUDE.md requires for any ground or wash change.                                                                                                                                                                                    |
| `game-viewport-consistency`, `stacking-consistency`   | Check whether they list the app dirs. Use `.app-page` and no bare `vh`; add `medschools` where they enumerate full-screen dirs if required.                                                                                                                                                                                                                                                                              |
| Bundle budget (`scripts/check-bundle-budget.ts`)      | Route records move; the layout adds one small record. Measure with `pnpm -s exec tsx scripts/check-bundle-budget.ts`. If a line moves, raise it with a dated, named comment as the file does. Site CSS should not grow (the app-tier tokens are already in the sheet).                                                                                                                                                   |
| Islands (`islands.test.ts`, `vite.islands.config.ts`) | **Not an island.** It needs the router, React Query loaders, `Link` and the session; islands have no router. `delivery: 'shell'` stays (it means router-delivered, not Steel).                                                                                                                                                                                                                                           |
| Docs                                                  | Run `pnpm docs:site` (inventories in `docs/site-reference/pages/r.md` carry the file paths). Update `features/medschools/CLAUDE.md` "What is public" and "Design", the roadmap row 11, and Steel §18 D13 (answered by this item; D10 stays open).                                                                                                                                                                        |
| `scripts/medschools/visual-check.mjs`                 | Update its R1 "no shadow, gradient or filter" assertions to app-tier ones; Day and Night become light and dark via `data-app-dark`. Add the routes to `testing/e2e/fouc.mjs` if it enumerates app routes.                                                                                                                                                                                                                |

### 2.7 File-by-file for phase A

- **Create:**
  - `app/routes/rmh-medschool.tsx`
  - `features/medschools/ui/shell/{MedApp,MedTopBar,useMedMode,ThemeToggle}.tsx`
  - `features/medschools/ui/shell/shell.test.tsx` (toggle, back target, ground, no `fixed`)
  - `features/medschools/ui/medschools.css`
  - `features/medschools/engine/mode.ts`
  - `public/images/medschools/wash-{light,dark}.webp`
  - `scripts/medschools/render-wash.mjs`
- **Move:** the six route files; the four admin files (to `components/admin/medschools/`).
- **Modify:**
  - `stores/themeStore.ts`
  - `lib/prepaint/theme-routes.ts`
  - `lib/style-tier.ts`
  - `lib/device-data/registry.ts`
  - `eslint-local-rules/design-scope.js`
  - `lib/__tests__/css-tiers.ts`
  - `components/shell/margin-takeover.ts`
  - `features/medschools/feature.ts`
  - `features/medschools/ui/ui-rules.test.ts`
  - the path-pinned tests listed above
  - `scripts/gen-self-hosted-fonts.ts` (usedBy strings)
  - `locales/en/medschools.json` (via `pnpm i18n:extract`: back label, theme toggle, "Med Schools" title)
  - docs (2.6)
- **Regenerate:** `pnpm gen` (route tree, prepaint), `pnpm docs:site`.

## 3. Phase B: component inventory

- **New primitives** (`features/medschools/ui/status/`):
  - `status.ts`: key to colour pair, icon path and label. Keys follow the owner's list: acceptance green, rejection red,
    hold dark blue, secondary submitted light blue, waitlist yellow, matriculation purple, interview invite orange. Add
    `withdrawn` as neutral. Use the mockup's icon paths: check, X, pause bars, envelope, clock, cap, speech bubble.
  - `StatusIcon.tsx`: round swatch plus stroke icon, text in the same hue, always with a text label so colour is never
    the only cue.
  - `StatusText.tsx`.
  - **Contrast test.** Pin 4.5:1 for status text and 3:1 for icons, against paper and ground in both modes (A1). Some
    light-mode green and yellow swatch/ink pairs look close to 3:1; the test will tell.
- **B1.**
  - `LiveRow` becomes name-first: school name on the first line, coloured status below, then program, place and time.
    `LiveRow.compact` stays for the rail.
  - `LivePage`, `IndexPage`, `SchoolCrest`, `ProgramSetToggles`, `ProgramToggles`, `CategoryToggles`, `OptionGroup`,
    `SaveToList`, `PrefsNote`, `WaveNote`, `skeletons`.
  - `ActivityRail` is mounted by `MedApp` as the desktop `<aside>`. Render and fetch it only at ≥1024 px via
    `useMediaQuery`, as `MarginColumn` does. Keep the `useSentinel` rule (`ui-rules` pins it).
- **B2.**
  - `SchoolPage` (tab pill nav per the mockup), `ActivityTab`, `HistoryTab`, `ForecastTab`, `InterviewsTab`,
    `SecondariesTab`, `SchoolChances`, `SchoolFacts`, `SourceLinks`, `ArrivalsSection`.
  - `charts/*`: `chartColors.ts` moves to `--app-med-chart-*`, and `ChartFrame` surfaces on paper.
  - **Risk.** The mockup's pastel line colours (#8DB9DE, #E8A87C and so on) are about 2:1 against cream paper. Use
    darker line variants and keep the pastels for fills, validated with the dataviz validator the existing charts
    already used.
- **B3.**
  - `tracker/*` (`TrackerPage`, `ApplicationRow`, `MilestoneForm`, `AddSchool`, `SharingRow`, `Timeline`, `SilenceLine`,
    `ChanceLine`, `import/*`).
  - `lists/*`, `ask/*`, `secondaries/*`, `rolling/*`.
  - The sign-in prompts use `StatusText` and shared controls.
- **Presentational only.** No data code changes, as the roadmap promised. All strings through `t()` in `medschools`;
  changing a shipped string's wording means a new key.

## 4. Phase C: public school stats

- **Table.** Add `MedSchoolFact` to `prisma/schema/medschools.prisma`, one shared sourced-fact shape per the roadmap's
  facilitator note.
  - **Columns.** `id`, `schoolId`, `program MedProgram?`, `cycleYear` (matriculating class), `kind` (enum, see below),
    `valueNum Float?`, `valueText String?`, `source MedFactSource`, `sourceUrl`, `checkedOn @db.Date`,
    `enteredBy String?`.
  - **Source enum.** `MedFactSource { AAMC_FACTS, SCHOOL_PROFILE, CHOOSE_DO }`. Adding `MSAR` later is a one-line
    additive change, which keeps your "no layout change" requirement.
  - **Kinds.** `MCAT_MEDIAN/P10/P90`, `GPA_MEDIAN/P10/P90`, `CLASS_SIZE`, `IN_STATE_PCT`, `APPLICANTS`, `MATRICULANTS`,
    `INTERVIEWED`.
  - **Uniqueness.** Unique on `(schoolId, program, cycleYear, kind, source)`.
  - **Why a new table.** It leaves `MedSchoolStats` and its anonymity boundary tests alone.
  - It also avoids widening `MedSource`, which `Record<MedSourceId, …>` maps (`chartColors.ts` and others) key on. The
    migration is additive.
- **Read rule.** `engine/school-facts.ts` (pure, client-safe). One value per kind by priority: school's own profile,
  then AAMC FACTS, then Choose DO. **Never average or sum across sources (spec §10).** Always label the source and
  `checkedOn`. A missing kind prints "Not published", not a blank.
- **RMH tracker tiles** (interview rate, interviewee acceptance).
  - They come from `publishedContributors >= 20`. The public floor is currently 3; stats panels need a separate
    `STATS_K_FLOOR = 20` constant in `engine/public-read.ts`, tested like `K_FLOOR`.
  - **Caveat on the mockup's "6.8% of all applicants".** The tracker cannot produce a denominator of all applicants.
    Label RMH tiles "of members who shared" and take percent-of-all-applicants only from AAMC or school figures.
- **Data entry** follows the school-pages pattern, with no scraper.
  - `data/medschools/school-facts.json` is validated by `scrape/school-facts.ts` (https, official hosts only, every slug
    in the registry, values in range).
  - It is loaded once per file hash by an `ensureSchoolFactsImported` job, idempotent and bundled into the worker.
  - `scripts/medschools/import-school-facts.ts --dry-run` does the same by hand.
  - **Admin.** A small "School facts" tab in the relocated `components/admin/medschools/AdminMedSchoolsPage` handles
    single corrections: an admin endpoint `api/admin.medschools.facts.server.ts` with zod and admin gate; every write
    requires `sourceUrl` and `checkedOn`.
- **API and UI.**
  - **Read endpoint.** Add `schools/$slug/facts` to `medschools.contract.ts`: anonymous, public-cached, a pinned key set
    like the other eight, extended in `testing/integration/medschools-public.test.ts`.
  - **Panel.** `ui/facts/SchoolStatsPanel.tsx` implements the mockup's tile grid (six tiles, each with its source line)
    in the Overview tab.
- **Tests.** A boundary test that no private table is imported (the `stats-boundary` pattern); validator tests; a
  snapshot of the key set; the 20-member floor.

## 5. Phase D: private stats and AI school list

- **Model.** `MedUserProfile` (userId primary key, cascade on delete): `mcat`, `gpaCum`, `gpaSci`, `homeState`, the
  hours fields, `cycleYear`, and `notes` capped at 1000 characters.
  - Add it to `medschoolsErasureOps` and run `pnpm docs:deletion`.
  - Add it to `medschools-private.test.ts`: anonymous 401, no public cache header, a session changes no public byte,
    foreign ids 404.
- **Endpoints.** `me/profile` (GET and PUT) and `me/school-list` (POST), signed in, `Cache-Control` never public, no DTO
  carrying a user or event id.
- **List construction.**
  - **Deterministic part.** A pure, tested function (`engine/school-list.ts`) places each school as reach, target or
    baseline from the member's MCAT and GPA, residency and the phase C medians. It is auditable and cannot invent a
    number.
  - **Model part.** The model only writes the one-line reason and reads the free-text notes. Its output is checked by
    the existing `engine/qa/ground.ts` rules.
  - **Gates.** The call runs under the Q&A gates (`admitQuestion`, `runUnderLease`, the `ai` rate-limit policy, the
    pause switch) and spends only the Q&A share, failing closed when the ledger is unreadable. One list costs one daily
    question, as the tracker import does.
  - **Prompt content.** The prompt carries numbers and the typed notes, never the user id, and the answer is not stored
    (like Q&A), pending the open question.
  - **Copy.** "An estimate against each school's public medians. Not an admissions prediction." (mockup wording).
- **UI.** `ui/me/MyStatsPage` (mockup `Stats.dc.html`: 12 fields, notes, "Build my school list") and `SuggestedList`
  (three tier cards in reach purple, target blue and baseline green, per the mockup). Add the route
  `app/routes/rmh-medschool/stats.tsx` (`noIndex`) and a `/stats` entry in `sitemap.ts` as `personal`.
- **Copy of privacy.** "Private to you. Never shared or counted in any public figure. Sent to the AI only when you ask
  for a school list." The code must make this literally true: no read path from `MedUserProfile` to any public or
  aggregate query, enforced by a boundary test.

## 6. Risks

- **Test churn.** Moving the routes touches path strings in about eight test files, and two boundary tests would go
  vacuously green if not fixed. Fix them in A's first commit.
- **Cookie notice and overlays** leave with `_site`. Mitigated by mounting `CookieConsent` (2.1).
- **iOS Safari strips.** The wash must fade to the exact ground at both ends; verify with the screenshots workflow, not
  an emulated iPhone.
- **Pastel contrast** (status text, chart lines) needs contrast tests; some mockup colours may need darkening.
- **FOUC.** The pre-paint key and the toggle must agree (`fouc-contract.test.ts`, `testing/e2e/fouc.mjs`).
- **Matriculation** has no event source; purple will not appear in live data until one exists.
- **Bundle budget.** A small movement is likely; a named raise is the file's convention.
- **AAMC and Choose DO reuse terms** are unverified by me.

## 7. Open questions for the owner

1. **Matriculation.** Add a presentational purple only (the live feed will not show it), or also add a `MATRICULATED`
   event and tracker milestone (an additive migration, but no scraper produces it)? I recommend presentational in B1.
2. **Applicant-reported figures.** The existing CycleTrack, Admit and SDN stats conflict with "public sources only" for
   the stat panels. Should they be dropped from the panels, or kept as a separate, clearly labelled "reported by
   applicants" comparison series?
3. **Fonts.** Inter as in the mockup (+48 KB) or DM Sans body, which is already loaded (Fraunces for headings either
   way)? I lean to follow the mockup.
4. **AAMC and Choose DO data.** Please confirm the reuse terms for a hand-curated import with a source URL and date per
   figure. If FACTS lacks per-school MCAT and GPA, are partial school-profile figures acceptable ("Not published" where
   absent)?
5. **School list storage.** Is the generated list stored (so it persists and could be shared later), or computed and
   discarded like Q&A answers? I recommend discarded, with the profile stored.

### Critical Files for Implementation

- /home/user/rmhstudios.com/eslint-local-rules/design-scope.js
- /home/user/rmhstudios.com/stores/themeStore.ts
- /home/user/rmhstudios.com/app/routes/rmhstudy.tsx
- /home/user/rmhstudios.com/features/medschools/ui/ui-rules.test.ts
- /home/user/rmhstudios.com/features/medschools/ui/LiveRow.tsx
