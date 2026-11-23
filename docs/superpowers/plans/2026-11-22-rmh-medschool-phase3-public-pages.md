# RMH Med Schools — Phase 3 (public pages) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the public, signed-out-readable face of RMH Med Schools at `/rmh-medschool`: a school index, a live feed
of recent reported events, and a per-school page (Activity · History · Interviews) with server-rendered SVG charts,
source attribution, link-preview cards, i18n and an RMH Services hub entry, on top of the data phases 1 to 2b already collect.

**Architecture:** Six anonymous `GET` endpoints (one contract file extension, registered `apiRoute` modules,
`auth: 'optional'`, read rate limit, public cache) read the existing tables through pure rules in
`features/medschools/engine/public-read.ts` (primary-series choice, k≥3 floor, program handling). Pages load through
route loaders that seed React Query with `contractQuery` (the repo's B4/AR2 pattern), so charts exist in the server HTML.
Charts are React SVG whose geometry comes from `d3-scale`/`d3-shape`, living in a lazy page chunk, coloured only with
`--site-text`, `--site-text-muted` and `--site-border`.

**Tech Stack:** TanStack Start (route loaders, `createFileRoute`), React 19, React Query, TypeScript strict, Prisma 7
(typed client, explicit `select`), zod 4, `d3-scale` + `d3-shape` (new direct dependencies), Tailwind v4 Steel tokens,
satori OG cards, vitest.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§1–2, §4a, §6, §10 "Combining sources", §11,
§12–15). Earlier phase plans for patterns: `docs/superpowers/plans/2026-11-20-rmh-medschool-phase1-foundation.md`,
`…phase2a-admit.md`, `…phase2b-sdn.md`. The one existing UI to copy: `features/medschools/ui/AliasMissesPanel.tsx`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Out of scope: the Forecast tab (phase
  5, leave a clean slot, no stub), the private tracker (phase 4), AI Q&A (phase 6), follows (phase 7), any worker or
  schema change. No migration in this phase.
- **Anonymization (spec §6):** "no identifier of a person crosses the adapter boundary", and no public response may carry
  one. Every Prisma read in this phase uses an explicit `select`; `inState`, `dedupeHash`, `ingestedAt` and
  `MedSdnThread.cursorPostHash` are never selected. Attribution links point at a school page or a thread, never a post.
- **k≥3 floor at read time (spec §6):** "any public figure built from RMH tracker data … and any in-state/out-of-state
  split from any source is suppressed when it rests on fewer than 3 contributors … The in-state split is suppressed
  independently of the count it splits. Admit and SDN events are already public one-by-one at their source … CycleTrack's
  counts are shown as published."
- **MD and MD-PhD are separate (spec §4a):** pages offer a program switch (O5: All, then the school's own degree and its PhD track, default All). "Null-program events are
  shown as 'program not reported' and never counted" in either program's series.
- **Never sum sources (spec §10):** "CycleTrack is the primary series … Admit, SDN and RMH available as comparison
  series … the next source in the order CycleTrack → Admit → SDN → RMH is primary and the chart says so. Every chart
  labels its unit as 'reported events' and names its sources." Reported events are never called applicants.
- **API (CLAUDE.md §3):** contracts in `features/medschools/medschools.contract.ts`, bound with `implement()` in
  registered `apiRoute` modules under `features/medschools/api/`, `pnpm api:routes` regenerates the table, clients call
  `api()`/`contractQuery`, no raw `fetch('/api/…')` (`raw-api-fetch-ratchet`), a `*.queries.ts` holds no `createServerFn`.
- **Steel:** rows on rules (R3), flat (R1), one ink primary per view (R4), nothing moves at rest (R5), late content
  fades 160 ms through `components/ui/arrive.tsx` (M9), seven `t-*` classes, `--site-*` tokens, `Tabs` for the tab
  strip, `PageLayout`, logical properties. Charts use only `--site-text`, `--site-text-muted`, `--site-border`.
- **i18n:** every string through `t()` in namespace `medschools`; `defaultValue` is used only for a missing key, so a
  reworded shipped string is a new key; never put a `{/* … */}` JSX comment right before a `t()` call. The file already
  holds the admin keys (`title`, `description`, `back`, `retry`, `empty`, `load-failed`, …): new keys carry a prefix
  (`index-`, `live-`, `school-`, `chart-`, `event-`, `program-`, `source-`) so none collides.
- **SEO:** per-route `head()` through `definePage`/`buildMeta` + canonical; a page about one thing names its card with
  `ogCardPath`; every other public page has a section card in `lib/og/static-cards.ts` in the same change
  (`og-page-coverage.test.ts`). JSON-LD only through `jsonLdScript()` and a builder from `@/lib/schema`.
- **Bundle (CLAUDE.md "Performance", OPT-01):** nothing heavy at a route module's top level (Start lifts only route
  `component`s; `head`, `loader`, `validateSearch` and their imports land in the shared entry). No `zod` and no `d3-*` in
  the entry closure. Raising a budget needs a dated comment in `scripts/check-bundle-budget.ts` and a PR-body line naming
  the feature (Task 11).
- **Commit gate:** stage first, commit separately, `pnpm check:consistency` passes before every commit, no `--no-verify`.
  Commit messages explain why and end with the attribution trailer the session was given
  (`Co-Authored-By: …` and `Claude-Session: …`). No `any`, `@ts-ignore`, new lint or type warnings.

## Review Focus

Inputs the spec implies but no obvious task test would reach; each line has its test in the named task.

1. **A school or cycle with no data** (June before the new cycle's first report, a new school, a PHD program with nothing):
   pages show an empty state, never `NaN` paths or a flat chart that reads as zero activity. Task 5 (geometry on empty and
   all-zero input), Task 9 (empty tab).
2. **Dates are UTC calendar days, viewers are in US time zones:** `2026-11-20` formatted in `America/Los_Angeles` must
   still read "Nov 20". Task 1 (`formatUtcDay` under `TZ=America/Los_Angeles`), Task 5 (axis labels).
3. **The floor leaking through side doors:** a suppressed RMH series must also be absent from totals, the "Sources:"
   caption, the sr-only table and the cache body. Task 1 (`buildTypeSeries`), Task 3 (response never names RMH), Task 5
   (caption built from the data it is given).
4. **Live feed ties and refetch:** many events share one `occurredAt`; paging must not skip or repeat rows, and the 60 s
   refetch must prepend new rows without dropping "show older" pages or replaying the fade on old rows. Task 1
   (`encodeLiveCursor`, `mergeLiveHead`), Task 3 (keyset query), Task 7.
5. **Hostile or unknown input:** an unknown, inactive, upper-case, over-long or `%00` slug is a 404 (never a 500); `q`
   with regex characters or 10,000 characters, `state=ZZ`, `degree=PhD`, `limit=-1` give 400 or an empty list. Task 4,
   Task 9 (`notFound()`).

## Owner revisions (2026-11-22): these override any task text that conflicts

- **O1 Placement: RMH Services, not games/apps.** RMH Med Schools is listed in the Services hub
  (`app/routes/_site/services/index.tsx`, the `SERVICES` list rendered by `HubLinkRow`) and in site search
  (`lib/search/catalog.ts`), not in `lib/catalog`. No `catalog.ts`, no `AppInfo`, no card art, no image manifest rows. The
  manifest keeps `catalog` unset and `listed: false` (it is not a catalog card). `/rmh-medschool` and
  `/rmh-medschool/live` are `STATIC_ROUTES` in `lib/sitemap.ts` permanently. Task 10 below is rewritten accordingly; D12 is
  void.
- **O2 Chart style:** the D3/D10 proposal is approved (thin ink and muted lines and bars, dashed vs solid, direct labels, no
  fills, no animation, the native table). Record this as the owner's answer for these pages only; the Steel §18 D10 row
  stays open for the rest of the site.
- **O3 Attribution:** D11 is approved: "Source: CycleTrack", "Source: Admit.org", "Source: Student Doctor Network", each
  linking to the school's page on that source where a URL is known.
- **O4 Toggleable categories (CycleTrack style).** The Activity tab's first chart is `CategoryLines`: one cumulative
  step line per event type in `CHARTED_TYPES` (Secondary, Interview invite, Waitlist, Rejection, Acceptance) for the
  primary source of each type, on one day-of-cycle x axis. Above it, a row of toggle buttons, one per category
  (`Button variant="ghost" size="xs" aria-pressed`, the `components/ui/line-chart.tsx` precedent; a group with
  `role="group"` and an `aria-label`, not a tab strip), each with a small line sample of its dash pattern. Visibility lives
  in the URL search (`show`, a comma list of event types; default all five; an empty or unknown list falls back to the
  default; at least one stays on: the last pressed one cannot be turned off), so the server renders the chosen lines with
  scripting off and a link reproduces the view. Toggling uses `navigate({ search, replace: true, resetScroll: false })`
  and refetches nothing (all five series are in the one activity response). Series are told apart without colour: Interview
  solid ink 2px, Acceptance solid ink 1.25px, Secondary muted dotted (`"1 3"`), Waitlist muted dashed (`"6 3"`), Rejection
  muted dash-dot (`"8 3 2 3"`), each with an end label placed by `spreadLabels`. The daily-bars chart for one chosen type
  (the event-type `Select`) stays below it. The native table lists every visible category by day.
- **O5 Program filter: All, MD, MD-PhD, DO, DO-PhD.** A school is MD or DO, so on a school page the program control is
  `ProgramFilter = 'ALL' | 'REG' | 'PHD'` labelled by the school's degree: an MD school shows "All", "MD", "MD-PhD"; a DO
  school "All", "DO", "DO-PhD". Default `ALL`. "All" is REG + PHD summed **within one source** per day (never across
  sources); null-program events stay out of every series under every choice (D6's muted line still says how many). On the
  index and live pages (many schools) the control is one `Select` with "All", "MD", "MD-PhD", "DO", "DO-PhD" (live adds
  "Program not reported"), which sets `degree` and `program` together (`MD-PhD` = `degree: 'MD', program: 'PHD'`). Search
  param `program` accepts `ALL|REG|PHD` (live also `NONE`), default `ALL`; the contracts' `program?` accepts `'ALL'` too and
  the loaders treat `ALL` as `program in ['REG','PHD']` then sum per `(source, date, eventType)` before `buildTypeSeries`.
  Labels: `program-all` "All", `program-md` "MD", `program-md-phd` "MD-PhD", `program-do` "DO", `program-do-phd`
  "DO-PhD". The k floor applies per row before any sum.
  **A school never shows the other degree's options (owner):** an MD school's control has no DO or DO-PhD, a DO
  school's no MD or MD-PhD. When the live feed is filtered to one school, `DegreeProgramSelect` gets that school's degree
  and shows only All and its two options (plus "Program not reported"), and a `degree` in the URL that contradicts the
  school is dropped. Tests: `ProgramSelect` for `degree: 'DO'` renders no "MD" option; the live page with `school=<an MD
  slug>&degree=DO` renders MD options only and filters by the school.

- **O6 Visual check on phones and odd aspect ratios (owner).** Task 12's screenshots cover, Day and Night: 320×568
  (smallest phone), 360×740, 390×844, 430×932, 844×390 (phone landscape), 768×1024 (tablet portrait), 1024×600 (short
  landscape), 1280×800, 1920×1080 and 2560×1080 (ultrawide), plus 390×844 and 1280×800 in `ar`. Every page and tab,
  with toggles in a non-default state and the program select open, is looked at: nothing clipped or overlapping, no
  sideways scroll, controls reachable and at least 44px on touch, chart end labels legible, the toggle row wrapping
  cleanly, and the layout reading as one site with the rest of `/services`. A rough check (390 and 1280, Day) also runs
  right after Task 7 and Task 9, before the next task starts, so problems are fixed while the code is fresh.

## Decisions made in this plan (owner may override)

- **D1 Data loading:** route loaders prefetch `contractQuery` options (`lib/route/route-query.ts`), as `series.$id.tsx`
  and `admin/economy.tsx` do; the component reads the same options with `useQuery`. No `createServerFn`. The browser path
  is the typed `api()` call, so the raw-fetch ratchet is untouched. The school route's loader also returns a small
  `{ slug, name, shortName, degree, state, city } | null` object so `head()` can name the school (`definePage` tolerates
  `loaderData` undefined) and throws `notFound()` on a 404.
- **D2 Chart rendering:** React SVG, not SVG strings. TanStack Start server-renders it, so the markup exists without
  scripting, with no `dangerouslySetInnerHTML`. Geometry is a pure module (`engine/chart-geometry.ts`) on `d3-scale`
  (`scaleLinear`, `scaleBand`) and `d3-shape` (`line`, `curveStepAfter`, `.digits(2)` so server and client path strings are
  byte-equal). Why not reuse `components/ui/line-chart.tsx`: it draws at most two series, sorts its x values as strings
  (day numbers break), and keeps a client-state table toggle. Why d3 at all: the owner-approved spec §11 names it. Its
  cost is contained: only `engine/chart-geometry.ts` imports `d3-*`, only `ui/charts/*` imports that, only the page
  components import `ui/charts`, so it lands in the lazy page chunk; `scripts/check-entry-composition.ts` gets
  `d3-scale` and `d3-shape` tripwires. Imported as `d3-scale` and `d3-shape` (not the `d3` barrel, which is the RMHVibe
  sandbox's package, `lib/rmhvibe/vibe-packages.ts`). Text alternative: `role="img"` with a summary label plus a native
  `<details>` table, which works with no JS and needs no state.
- **D3 Series styling without colour:** primary = solid 2px `--site-text`; comparison = 1px `--site-text-muted`, dashed;
  cycle overlay = current solid ink, prior cycles muted with distinct dash patterns and end labels. Series are named by
  direct labels, never by a colour legend.
- **D4 Primary series:** chosen per school × program × cycle × event type, after the floor, in
  `PRIMARY_ORDER = CYCLETRACK, ADMIT, SDN, RMH, MDAPPLICANTS` (MDApplicants is archive-only comparison; no rows exist
  yet). The History overlay draws one source only (the highest-priority source present in the newest cycle and at least
  one earlier cycle) so lines are never cross-source; a "Source" select lists the others.
- **D5 k-floor details:** counts: RMH rows are dropped when `contributors` is null or below 3 (fail closed); other
  sources show as published (their `contributors` is null today: verified in `rollup-events.ts`, `ingest-page.ts`,
  `parse-school.ts`). In-state/out-of-state: `MedSchoolStats` rows with `residence ≠ GLOBAL` are dropped when
  `contributors` is null or below 3; `MedInterviewProfile.inStateCount/outOfStateCount` are returned as one `split`
  object only when **both** are at least 3. `MedCycleEvent.inState` is never selected. The live feed excludes
  `source = RMH` events entirely (one tracker milestone is a one-contributor figure); RMH reaches the public only through
  count aggregates under the floor.
- **D6 Program labels and null programs:** a program `Select` ("MD / DO", "MD-PhD / DO-PhD"), default `REG`, not a
  second tab strip. Null-program events appear only in the live feed ("Program not reported") and as one muted line on the
  Activity tab ("{{count}} reported events did not say a program and are in neither series"). They are never in a
  series, total or chart.
- **D7 Event types:** charts offer `INTERVIEW` (default), `SECONDARY`, `WAITLIST`, `REJECTION`, `ACCEPTANCE`
  (`CHARTED_TYPES`). `WITHDRAWN` and `HOLD` (added in phase 2) appear in the live feed and in the Activity totals table
  only.
- **D8 Live row privacy:** a row is `{ id, eventType, program | null, school, occurredAt, source }`, with `occurredAt`
  truncated to the minute. The opaque cuid `id` is a React key and a cursor part, not a source id.
- **D9 Added endpoint:** `GET /api/medschools/today` (spec §11 index "schools that sent invites today") beyond the five
  the brief lists. It returns the latest UTC day with any reported INTERVIEW count (per school, the primary source's
  count) and says whether that day is today; the heading says "Today" only when it is.
- **D10 Current cycle:** `resolveCycleYear` = the latest cycle that has count rows, never later than the June 1 rollover
  of `cycleYearOf(now, 'SECONDARY')`; falls back to the rollover. Early June does not show an empty new cycle.
- **D11 Attribution text:** `Source: CycleTrack`, `Source: Admit.org`, `Source: Student Doctor Network`. Only the SDN
  wording is in the spec; no source set wording (spec §1), so the other two follow its form and the names live in one
  constant (`SOURCE_NAMES`) so a later term is a one-line change. SDN links are the school's non-archive thread (and each
  prior cycle's archive thread on History) plus the interview-feedback summary page.
- **D12 Catalog art (VOID, owner O1: listed under Services, no catalog card):** there is no placeholder convention. `catalog.test.ts` requires `bannerPath` and `logoPath` (existing
  `.webp` files, banner ≤ 1.5 MB, logo ≤ 150 KB) on every entry without `unlisted`, and this plan must not invent images.
  Task 10 therefore ships the entry with `unlisted: true` (the schema, the catalog test and `catalogRoutes()` all honour
  it) and the manifest `listed: false`; a second step, blocked on owner-supplied art, flips both and adds the
  three manifest rows.
- **D13 Charts keep a left-to-right time axis in `ar`:** the SVG sits in a `dir="ltr"` wrapper; everything around it
  mirrors.
- **D14 Index list:** rows on rules (the Steel D7 default), not tiles, each row linking to the school.

### Steel §18 open decisions these pages touch (not resolved here; owner needed)

- **D10 (dashboards and data tables; "No chart styling has been designed"):** this phase draws charts. The approved
  spec §11 requires them; their styling (ink and muted ink, dashes instead of colour, 2px primary, direct labels, no
  fills) follows `components/ui/line-chart.tsx`/`bar-chart.tsx` and is a proposal until the owner answers D10.
- **D7 (catalogues of things: tiles or rows):** the school index is rows on rules, the stated default.
- **X2 (no recipe fits):** none of the section-10 recipes describes an index of schools, a live feed or a school page, so
  all three are "a titled page of rows on rules with no spine". Task 12 records the gap as a new open row in §18; it does
  not answer it. The spine is not used.
- **D8 (inline notices):** no tinted notice box is added. "Data is thin" and "not reported" are `t-meta` lines.
- **D5:** decided for presence only; the live page adds no "live" colour or marker beyond its words.

## File Structure

| Path | Responsibility |
| --- | --- |
| `features/medschools/engine/public-read.ts` (+test) | Pure read rules: `PRIMARY_ORDER`, `pickPrimary`, `applyKFloor`, `floorSplit`, `buildTypeSeries`, `resolveCycleYear`, `toCumulativeByDay`, `overlaySource`, `filterSchools`, live cursor, `mergeLiveHead`, `formatUtcDay`. Client-safe, no I/O |
| `features/medschools/engine/search.ts` (+test) | Hand-rolled `validateSearch` parsers (zod may not enter the entry): `parseIndexSearch`, `parseLiveSearch`, `parseSchoolSearch`, `SCHOOL_TABS` |
| `features/medschools/engine/chart-geometry.ts` (+test) | Pure geometry on `d3-scale`/`d3-shape`; the only `d3-*` importer |
| `features/medschools/medschools.contract.ts` | Existing file: add the six public contracts and their DTO types |
| `features/medschools/api/read-schemas.ts` | zod query schemas (server-side only importers) |
| `features/medschools/api/source-links.ts` (+test) | `buildSourceLinks` from aliases and SDN threads |
| `features/medschools/api/read.server.ts` (+test) | The six loaders on the typed Prisma client |
| `features/medschools/api/medschools.*.server.ts` (6 files, +`read-routes.server.test.ts`) | Registered `apiRoute` GET modules |
| `features/medschools/medschools.queries.ts` | `contractQuery` option factories, client-safe |
| `features/medschools/ui/charts/` | `ChartFrame`, `DailyBars`, `CumulativeLine`, `CycleOverlay` |
| `features/medschools/ui/` | `IndexPage`, `LivePage`, `LiveRow`, `SchoolPage`, `ActivityTab`, `HistoryTab`, `InterviewsTab`, `SourceLinks`, `ProgramSelect`, `labels.ts`, skeletons |
| `app/routes/_site/rmh-medschool/{index,live,$slug}.tsx` | Thin routes: head, loader, validateSearch, one page component each |
| `lib/og/api/og.med-school.$slug.server.ts` | `/api/og/med-school/$slug` card; `ogCardPath` kind `med-school` in `lib/seo.ts` |
| `lib/og/static-cards.ts`, `lib/og/static-card-index.ts` | Section cards for `/rmh-medschool` and `/rmh-medschool/live` |
| `lib/sitemap.ts`, `lib/sitemap.server.ts` | `/rmh-medschool/live` static route, `medschools` section for `/rmh-medschool/$slug` |
| `app/routes/_site/services/index.tsx`, `lib/search/catalog.ts`, `feature.ts` | Services hub entry, search entry, manifest (O1) |
| `scripts/medschools/seed-visual.ts`, `scripts/medschools/visual-check.mjs`, `testing/integration/medschools-public.test.ts` | Seeded visual verification and black-box check |

---

### Task 1: Pure read rules and search parsers

**Files:**
- Create: `features/medschools/engine/public-read.ts`, `features/medschools/engine/public-read.test.ts`
- Create: `features/medschools/engine/search.ts`, `features/medschools/engine/search.test.ts`

**Interfaces:**
- Consumes: `MedSource`, `MedProgram`, `MedEventType` from `./types`; `cycleYearOf`, `dayOfCycle`, `defaultDayZero` from `./cycle`.
- Produces (client-safe, no zod):

```ts
export const PRIMARY_ORDER: readonly MedSource[];          // CYCLETRACK, ADMIT, SDN, RMH, MDAPPLICANTS
export const CHARTED_TYPES: readonly MedEventType[];       // INTERVIEW, SECONDARY, WAITLIST, REJECTION, ACCEPTANCE
export const K_FLOOR = 3;
export const SOURCE_NAMES: Record<MedSource, string>;      // 'CycleTrack', 'Admit.org', 'Student Doctor Network', 'RMH tracker', 'MDApplicants'
export interface CountCell { source: MedSource; date: string /* YYYY-MM-DD */; count: number; contributors: number | null }
export interface TypeSeries { primary: MedSource | null; sources: { source: MedSource; days: { date: string; count: number }[]; total: number }[] }
export function pickPrimary(present: Iterable<MedSource>): MedSource | null;
export function applyKFloor(rows: readonly CountCell[]): CountCell[];
export function floorSplit(inState: number | null, outOfState: number | null): { inState: number; outOfState: number } | null;
export function buildTypeSeries(rows: readonly CountCell[]): TypeSeries;
export function resolveCycleYear(a: { requested?: number; latestWithData: number | null; now: Date }): number;
export function toCumulativeByDay(days: { date: string; count: number }[], dayZeroOn: string): { day: number; cumulative: number }[];
export function overlaySource(cycles: { cycleYear: number; sources: MedSource[] }[]): MedSource | null; // newest first
export function filterSchools<T extends { name: string; shortName: string; state: string; degree: string }>(s: readonly T[], f: { q?: string; degree?: string; state?: string }): T[];
export function encodeLiveCursor(c: { occurredAt: Date; id: string }): string;
export function decodeLiveCursor(s: string): { occurredAt: Date; id: string } | null;
export function mergeLiveHead<T extends { id: string }>(prev: readonly T[], head: readonly T[]): { rows: T[]; arrived: string[] };
export function truncateToMinute(d: Date): string;          // ISO, seconds and ms zeroed
export function formatUtcDay(day: string, locale: string, opts?: Intl.DateTimeFormatOptions): string; // timeZone: 'UTC'
export type SchoolTab = 'activity' | 'history' | 'interviews';
export const SCHOOL_TABS: readonly SchoolTab[];             // exactly these three; phase 5 adds 'forecast' between history and interviews
```

`search.ts` produces `parseIndexSearch(raw: Record<string, unknown>): { q?: string; degree?: 'MD'|'DO'; state?: string; program: 'ALL'|'REG'|'PHD' }` (O5),
`parseLiveSearch(raw): { type?: MedEventType; school?: string; degree?: 'MD'|'DO'; program: 'ALL'|'REG'|'PHD'|'NONE' }`,
`parseSchoolSearch(raw): { tab: SchoolTab; program: 'ALL'|'REG'|'PHD'; show: MedEventType[]; type: MedEventType; source?: MedSource; cycle?: number }` (`show`: O4, a comma list filtered to `CHARTED_TYPES`, deduplicated, in `CHARTED_TYPES` order, empty → all five). Unknown or malformed values fall back to defaults and never throw (`tab: 'forecast'` gives `'activity'`).

- [ ] **Step 1: Write the failing tests** (`public-read.test.ts`):
  - `pickPrimary(['SDN','ADMIT'])` is `'ADMIT'`; `pickPrimary(['RMH','SDN'])` is `'SDN'`; `pickPrimary([])` is `null`.
  - `applyKFloor`: an RMH row with `contributors: null` and one with `2` are dropped; one with `3` is kept; CYCLETRACK and ADMIT rows with `contributors: null` are kept.
  - `buildTypeSeries`: CycleTrack absent and RMH suppressed gives `primary: 'ADMIT'`; two sources with rows on one date stay two series whose `total`s are each their own sum (`total` of ADMIT 5 and SDN 2 are 5 and 2, never 7); output `sources` are in `PRIMARY_ORDER`; `days` ascend; a suppressed RMH source is absent from `sources` altogether (Review Focus 3).
  - `floorSplit(2, 10)`, `(null, 5)` give `null`; `(3, 3)` gives both numbers.
  - `resolveCycleYear`: `now 2027-06-02`, `latestWithData: 2027` gives 2027; `latestWithData: 2028` gives 2028; `latestWithData: null` gives 2028; `now 2027-05-31`, `null` gives 2027; `requested: 2025` wins when given.
  - `toCumulativeByDay([{date:'2026-06-01',count:2},{date:'2026-06-03',count:1}], '2026-06-01')` equals `[{day:0,cumulative:2},{day:2,cumulative:3}]`.
  - `overlaySource([{cycleYear:2027,sources:['ADMIT','CYCLETRACK']},{cycleYear:2026,sources:['CYCLETRACK']}])` is `'CYCLETRACK'` (present in the newest and one earlier cycle); `[{2027:['ADMIT']}]` alone gives `'ADMIT'` when no source spans two cycles but one cycle has data; `[]` gives `null`.
  - `filterSchools`: `q: ' duke '` matches by `name` and `shortName`, case-insensitive; `q: '(['` returns `[]` without throwing; `degree: 'DO'`, `state: 'TX'` combine with AND.
  - cursor: `decodeLiveCursor(encodeLiveCursor(c))` round-trips `occurredAt` to the millisecond; `decodeLiveCursor('%%%')` is `null`.
  - `mergeLiveHead(prev: [c,b,a], head: [d,c,b])` returns `rows: [d,c,b,a]` and `arrived: ['d']`; with an empty `prev` `arrived` is `[]` (first batch is a baseline, not an arrival).
  - `truncateToMinute(new Date('2026-11-20T10:15:42.123Z'))` is `'2026-11-20T10:15:00.000Z'`.
  - `formatUtcDay('2026-11-20','en-US')` contains `Nov` and `20` when run with `process.env.TZ='America/Los_Angeles'` (set in the test file before the first `Date`, as other date tests do) (Review Focus 2).
  - `SCHOOL_TABS` equals `['activity','history','interviews']`.
  `search.test.ts`: `parseSchoolSearch({tab:'forecast'}).tab` is `'activity'`; `{program:'PHD'}` gives `'PHD'`; `{program:'x'}` gives `'ALL'`; `{}` gives `program: 'ALL'` and `show` equal to `CHARTED_TYPES`; `{show:'interview,bogus,INTERVIEW'}` gives `show: ['INTERVIEW']` (case-insensitive); `{show:''}` gives all five; `{cycle:'2027'}` gives `2027`, `{cycle:'abc'}` gives `undefined`; `parseIndexSearch({state:'zz9', degree:'PhD'})` gives `state: undefined`, `degree: undefined`; `parseLiveSearch({program:'NONE'}).program` is `'NONE'`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/public-read.test.ts features/medschools/engine/search.test.ts`. Expected: FAIL (modules missing).
- [ ] **Step 3: Implement.** `buildTypeSeries` is the algorithm the tests do not determine:

```ts
export function buildTypeSeries(rows: readonly CountCell[]): TypeSeries {
  const visible = applyKFloor(rows);                       // floor first: a suppressed source can never be primary
  const bySource = new Map<MedSource, CountCell[]>();
  for (const r of visible) (bySource.get(r.source) ?? bySource.set(r.source, []).get(r.source)!).push(r);
  const sources = PRIMARY_ORDER.filter((s) => bySource.has(s)).map((source) => {
    const days = bySource.get(source)!.map(({ date, count }) => ({ date, count })).sort((a, b) => a.date.localeCompare(b.date));
    return { source, days, total: days.reduce((n, d) => n + d.count, 0) };
  });
  return { primary: pickPrimary(sources.map((s) => s.source)), sources };
}
```

  `applyKFloor` keeps a row unless `source === 'RMH' && (contributors === null || contributors < K_FLOOR)`.
  `overlaySource`: for `cycles[0]` (newest), the first source in `PRIMARY_ORDER` that also appears in some later cycle; else the first `PRIMARY_ORDER` source in `cycles[0]`; else `null`. `parse*Search` read strings only (`typeof v === 'string'`), no zod.
- [ ] **Step 4: Run to verify pass:** same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): pure read rules for the public pages (primary series, k floor, cursors)`.

---

### Task 2: Public contracts, query schemas and source links

**Files:**
- Modify: `features/medschools/medschools.contract.ts` (append; keep the admin contracts untouched)
- Create: `features/medschools/api/read-schemas.ts`
- Create: `features/medschools/api/source-links.ts`, `features/medschools/api/source-links.test.ts`

**Interfaces:**
- Consumes: Task 1 types; `schoolUrl` (`scrape/adapters/cycletrack/urls`), `canonicalThreadUrl` and `summaryPageUrl` (`scrape/adapters/sdn/urls`), `parseSummaryKey` (`engine/sdn-title`).
- Produces: the contracts below (client-safe, `endpoint<…>()({method:'GET', path})`), plus zod schemas `listSchoolsQuery`, `activityQuery`, `historyQuery`, `liveQuery`, `todayQuery` whose parsed types equal each contract's `query` exactly (`implement()` checks it at compile time; follow `lib/playtime/playtime.contract.ts` for optional-key style), and

```ts
export function buildSourceLinks(a: {
  aliases: { source: 'CYCLETRACK' | 'ADMIT' | 'SDN'; sourceKey: string }[];
  threads: { threadId: number; slug: string; cycleYear: number; archive: boolean }[];
  currentCycle: number;
}): SourceLinkDto[];
```

Contracts (all `GET`, response types exported from the contract file; `MedSourceId`, `MedProgramId`, `MedEventTypeId` are re-exports of the engine types):

| Const | Path | Query | Response |
| --- | --- | --- | --- |
| `listMedSchoolsApi` | `/api/medschools/schools` | `q?, degree?: 'MD'\|'DO', state?, program?` | `{ cycleYear; program; schools: MedSchoolListItemDto[]; states: string[] }` |
| `getMedSchoolApi` | `/api/medschools/schools/$slug` | none | `MedSchoolDetailDto` |
| `getMedSchoolActivityApi` | `/api/medschools/schools/$slug/activity` | `program?, cycle?` | `{ cycleYear; program; dayZeroOn; dayZeroEstimated; types: ActivityTypeDto[]; unreportedProgram: number }` |
| `getMedSchoolHistoryApi` | `/api/medschools/schools/$slug/history` | `program?, type?` | `{ program; eventType; cycles: HistoryCycleDto[] }` (newest first, at most 4) |
| `getMedLiveApi` | `/api/medschools/live` | `type?, school?, program?: 'REG'\|'PHD'\|'NONE', cursor?, limit?` | `{ events: LiveEventDto[]; nextCursor: string \| null; asOf: string }` |
| `getMedTodayApi` | `/api/medschools/today` | `program?` | `{ date: string \| null; isToday: boolean; program; schools: { slug; shortName; name; state; count: number; source: MedSourceId }[] }` |

DTOs (names fixed here; later tasks use them verbatim): `MedSchoolListItemDto { slug; name; shortName; degree: 'MD'|'DO'; city; state; reported: { source: MedSourceId; count: number } | null }`;
`SourceLinkDto { source: 'CYCLETRACK'|'ADMIT'|'SDN'; name: string; href: string; scope: 'school'|'thread'|'summary'; cycleYear: number | null }`;
`SchoolStatsDto { source; program: MedProgramId | null; cycleYear; residence: 'GLOBAL'|'IN_STATE'|'OUT_OF_STATE'; allCycles: boolean; gpaMedian…interviewToAcceptancePct (nullable numbers) }`;
`InterviewProfileDto { source; format; fileType; avgDifficulty; avgStress; avgImpression; interviewCount; interviewStyle; interviewLength; split: {inState:number; outOfState:number} | null; feedbackPositive: string[]; feedbackNegative: string[]; feedbackBefore: string[] }`;
`InterviewQuestionDto { text; source; votes: number | null; cycleYear: number | null }`;
`MedSchoolDetailDto { school: { slug; name; shortName; degree; city; state; website: string | null; interviewFormat: string | null; interviewType: string | null }; cycleYear; programsWithData: MedProgramId[]; links: SourceLinkDto[]; stats: SchoolStatsDto[]; profiles: InterviewProfileDto[]; questions: InterviewQuestionDto[] }`;
`ActivityTypeDto { eventType; primary: MedSourceId | null; sources: { source; days: { date: string; count: number }[]; total: number }[] }`;
`HistoryCycleDto { cycleYear; dayZeroEstimated: boolean; sources: { source; points: { day: number; cumulative: number }[]; total: number }[] }`;
`LiveEventDto { id; eventType; program: MedProgramId | null; school: { slug; shortName; name }; occurredAt: string; source: 'ADMIT' | 'SDN' }`.

- [ ] **Step 1: Write the failing tests** (`source-links.test.ts`):
  - CYCLETRACK alias `'Texas A&M'` gives `{ href: 'https://cycletrack.org/explorer/school/Texas%20A%26M', name: 'CycleTrack', scope: 'school' }`.
  - Two SDN threads (cycle 2027 live, cycle 2026 archive) give a `thread` link for the live one with `href` equal to `canonicalThreadUrl(slug, id)` and `cycleYear: 2027`, and one for the archive with `cycleYear: 2026`; an SDN alias `summary:ABC/duke` gives a `summary` link equal to `summaryPageUrl('ABC','duke')`.
  - No link `href` matches `/\/post-|#post|\/goto\/|\/members\//` for any input (thread-level only, never a post).
  - An alias with a source outside the three (`MDAPPLICANTS`) is ignored.
  - Admit alias `duke-university` gives the school-level Admit link per the URL format recorded in Facts (1); until that fact is settled the function returns the Admit link only when `ADMIT_SCHOOL_URL` is defined in `scrape/sources.ts`, and the test asserts both branches.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/source-links.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `buildSourceLinks` (names from `SOURCE_NAMES`), the contracts, and `read-schemas.ts` (`limit` coerced 1–100 default 50; `q` ≤ 80 characters; `state` `/^[A-Z]{2}$/`; `slug` is not a query field). Add an Admit page-URL builder to `scrape/sources.ts` only once Facts (1) is verified.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools/api/source-links.test.ts && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): public read contracts, query schemas and attribution links`.

---

### Task 3: The six loaders

**Files:**
- Create: `features/medschools/api/read.server.ts`, `features/medschools/api/read.server.test.ts`

**Interfaces:**
- Consumes: Task 1 rules, Task 2 DTOs and `buildSourceLinks`, `prisma` from `@/lib/prisma.server`.
- Produces (each returns `null` for an unknown or inactive slug where it takes one):

```ts
export async function listSchools(q: ListSchoolsQuery, now?: Date): Promise<ListMedSchoolsRes>;
export async function getSchool(slug: string, now?: Date): Promise<MedSchoolDetailDto | null>;
export async function getActivity(slug: string, q: ActivityQuery, now?: Date): Promise<MedSchoolActivityRes | null>;
export async function getHistory(slug: string, q: HistoryQuery, now?: Date): Promise<MedSchoolHistoryRes | null>;
export async function getLive(q: LiveQuery): Promise<MedLiveRes>;
export async function getToday(q: TodayQuery, now?: Date): Promise<MedTodayRes>;
```

Query shape rules: every `findMany`/`count` has an explicit `select` (or a count `where`); schools are `where: { active: true }`; `MedCycleCount` reads filter by `program`, `cycleYear` and, for charts, `eventType in CHARTED_TYPES`, then pass `CountCell[]` per `(eventType)` to `buildTypeSeries`; `date` values are returned as `date.toISOString().slice(0,10)`. `getActivity` also runs one `medCycleEvent.count({ where: { schoolId, cycleYear, program: null } })` for `unreportedProgram`, and reads `MedCycle.dayZeroOn` (fallback `defaultDayZero(cycleYear)`, `dayZeroEstimated: true`). `getHistory` reads the newest four cycles that have rows for the school/program/type, turns each source's days into `toCumulativeByDay(…, dayZeroOn)` (so the x axis is day-of-cycle) and applies `buildTypeSeries` per cycle. `getLive` selects `{ id, eventType, program, occurredAt, source, school: { select: { slug, shortName, name } } }`, `where.source: { in: ['ADMIT','SDN'] }`, orders `occurredAt desc, id desc`, keyset-pages with `decodeLiveCursor` as `OR: [{ occurredAt: { lt } }, { occurredAt: { equals }, id: { lt } }]`, fetches `limit + 1`, and maps `occurredAt` through `truncateToMinute`. `getToday` takes the latest `date` ≤ today with an INTERVIEW count for the program in the current cycle, applies the floor, and gives each school its `pickPrimary` source's count. `getSchool` returns stats through the residence rule (D5), profiles with `split: floorSplit(...)`, at most 100 questions ordered by `votes desc nulls last, updatedAt desc`, at most 10 feedback lines per array, and `links` from `buildSourceLinks`.

- [ ] **Step 1: Write the failing tests** (mock `@/lib/prisma.server` as `alias-routes.server.test.ts` does; one `vi.fn` per delegate):
  - **Anonymity of queries:** for every call recorded on every delegate, `args.select` is an object, and across all of them no key is `inState`, `dedupeHash`, `ingestedAt`, `cursorPostHash`, `userId`.
  - **Live:** `where.source` is `{ in: ['ADMIT','SDN'] }`; a null-program row comes back `program: null`; response event keys equal exactly `['eventType','id','occurredAt','program','school','source']` and `school` keys `['name','shortName','slug']`; two rows with the same `occurredAt` straddling the page boundary are neither skipped nor repeated across the two pages (Review Focus 4); `occurredAt` ends in `:00.000Z`.
  - **Activity:** null-program events never enter `types[].sources`; `unreportedProgram` equals the mocked count; an RMH count row with `contributors: 2` is absent and `JSON.stringify(res)` does not contain `RMH`; with no CycleTrack rows the primary is ADMIT (Review Focus 3).
  - **History:** two sources present in the newest and an older cycle give points as cumulative by day-of-cycle; at most four cycles are returned, newest first; a cycle with no `MedCycle` row has `dayZeroEstimated: true`.
  - **Detail:** an `IN_STATE` stats row with `contributors: 2` or `null` is dropped, with `3` kept; a profile with `inStateCount: 5, outOfStateCount: 2` has `split: null`; `5` and `3` give a split; more than 100 questions are capped; an unknown slug and `active: false` give `null`.
  - **List:** `degree`, `state`, `q` filters reach `where` (or `filterSchools`) and `states` is the sorted distinct list of active schools' states.
  - **Today:** on `now = 2027-11-21T00:30Z` with data only on 2027-11-20, `isToday: false`, `date: '2027-11-20'`; with no INTERVIEW counts at all, `date: null, schools: []`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/read.server.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the six functions. Keep rules in Task 1 (call, do not copy). Use `Promise.all` for independent reads; no N+1 per school in `listSchools` (one grouped `medCycleCount.groupBy` over `schoolId, source` for the current cycle and `INTERVIEW`, then `pickPrimary` per school).
- [ ] **Step 4: Run** the same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): anonymous read loaders for schools, activity, history, live and today`.

---

### Task 4: Registered GET modules

**Files:**
- Create under `features/medschools/api/`: `medschools.schools.server.ts`, `medschools.schools.$slug.server.ts`, `medschools.schools.$slug.activity.server.ts`, `medschools.schools.$slug.history.server.ts`, `medschools.live.server.ts`, `medschools.today.server.ts`
- Create: `features/medschools/api/read-routes.server.test.ts`
- Modify: `lib/api/route-table.server.ts` (generated by `pnpm api:routes`)

**Interfaces:**
- Consumes: Task 2 contracts and schemas, Task 3 loaders.
- Produces: each module exports `route = apiRoute('/api/medschools/…', { GET: implement(contract, { auth: 'optional', rateLimit: 'read', query: schema, cache: { visibility: 'public', maxAge: 30, sMaxAge: 60, staleWhileRevalidate: 120 } }, handler) })`; `live` uses `maxAge: 15, sMaxAge: 15`. A loader returning `null` becomes `Response.json({ error: 'Not found' }, { status: 404 })`.

- [ ] **Step 1: Write the failing tests** (mock auth to no session, `withRateLimitAsync` to pass, and `./read.server` loaders; call through `handlersOf` as `alias-routes.server.test.ts` does):
  - every route answers 200 with **no** cookie (anonymous) and the body the loader returned;
  - 404 JSON `{ error }` for a `null` loader result on the three `$slug` routes;
  - 400 for `degree=PhD`, `state=ZZ`, `limit=-1`, `limit=1000`, `q` of 10,000 characters, `program=NONE` on a route that does not accept it (Review Focus 5);
  - a slug of `'%00'`, `'DUKE'` and a 300-character string reaches the loader unchanged and a `null` result is a 404, not a 500;
  - the `cache-control` header contains `public` and `s-maxage=60` (`15` for live);
  - a loader that throws gives a bare `{ error: 'Internal Server Error' }` 500 (the wrapper's guarantee), never the thrown message.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/read-routes.server.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the six modules. Then `pnpm api:routes`.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools/api lib/api/__tests__/route-table.test.ts lib/__tests__/api-handler-adoption.test.ts`. Expected: PASS (route table fresh, every contract resolves to exactly one handler).
- [ ] **Step 5: Commit** — `feat(medschools): public read endpoints (optional auth, read rate limit, public cache)`.

---

### Task 5: Charts

**Files:**
- Modify: `package.json`, `pnpm-lock.yaml` (`pnpm add d3-scale@^4.0.2 d3-shape@^3.2.0` and `pnpm add -D @types/d3-scale @types/d3-shape`; both are already in the lockfile transitively, so no new code is fetched)
- Modify: `scripts/check-entry-composition.ts` (add `'d3-scale'` and `'d3-shape'` to `FORBIDDEN`, reason "RMH Med Schools charts: route-only, must stay in the lazy page chunk")
- Create: `features/medschools/engine/chart-geometry.ts`, `chart-geometry.test.ts`
- Create: `features/medschools/ui/charts/ChartFrame.tsx`, `DailyBars.tsx`, `CumulativeLine.tsx`, `CycleOverlay.tsx`, `charts.test.tsx`

**Interfaces:**
- Consumes: Task 1 (`SOURCE_NAMES`, `toCumulativeByDay`, `formatUtcDay`), Task 2 DTOs.
- Produces:

```ts
// engine/chart-geometry.ts — the only d3-* importer; all outputs are plain numbers and strings
export const CHART_W = 640; export const CHART_H = 240;
export function fillDays(days: {date:string;count:number}[], from: string, to: string): {date:string;count:number}[]; // zero-filled, ascending
export function barsGeometry(days: {date:string;count:number}[]): { bars: {x:number;y:number;w:number;h:number}[]; yTicks: {v:number;y:number}[]; max: number };
export function linePath(points: {x:number;y:number}[], xDomain: [number,number], yMax: number, step?: boolean): { d: string; end: {x:number;y:number} | null };
export function xTicks(domain: [number, number], count: number): {v:number;x:number}[];
export function spreadLabels(ys: number[], minGap: number, bounds: [number, number]): number[]; // same order, no two closer than minGap

// ui/charts — presentational: callers pass already-translated strings
export function ChartFrame(p: { title: string; unit: string; sourcesLine: string; summary: string; table: React.ReactNode; tableLabel: string; children: React.ReactNode }): JSX.Element;
export function DailyBars(p: { primary: ActivitySeries; comparison: ActivitySeries[]; from: string; to: string; labels: ChartLabels }): JSX.Element;
export function CumulativeLine(p: { primary: ActivitySeries; comparison: ActivitySeries[]; dayZeroOn: string; to: string; labels: ChartLabels }): JSX.Element;
export function CategoryLines(p: { series: { eventType: MedEventTypeId; label: string; points: {day:number;cumulative:number}[] }[]; visible: readonly MedEventTypeId[]; labels: ChartLabels }): JSX.Element; // O4: one line per visible type, styles from CATEGORY_STYLE
export const CATEGORY_STYLE: Record<MedEventTypeId, { stroke: 'ink'|'muted'; width: number; dash?: string }>; // O4 values
export function CycleOverlay(p: { cycles: { cycleYear: number; points: {day:number;cumulative:number}[] }[]; sourceName: string; labels: ChartLabels }): JSX.Element;
```

`ChartLabels` carries every word the charts print (`unit` = "Reported events", `sourcesLine` formatter, `primary`, `comparison`, `day`, `count`, `summary` formatters, `showData`), as `components/ui/line-chart.tsx` does with its `labels` prop. `ChartFrame` renders a `<figure>`: `<figcaption>` with the title and a `t-meta` line "Reported events · Sources: CycleTrack (primary), Admit.org"; the SVG in a `dir="ltr"` wrapper with `role="img"` and `aria-label={summary}`; then `<details><summary>{tableLabel}</summary>{table}</details>` (native, no state, closed by default). SVG text uses `fill="var(--site-text-muted)"`, marks `var(--site-text)`, axes and zero line `var(--site-border)`. No `<animate>`, no `transition`, no `useEffect`, no `window`, no observer (R5).

- [ ] **Step 1: Write the failing tests.**
  - `chart-geometry.test.ts`: `fillDays([{date:'2026-06-02',count:3}],'2026-06-01','2026-06-03')` gives three days with counts `[0,3,0]`; `barsGeometry([])` gives `bars: []`, `max: 0` and finite `yTicks`; all-zero input gives finite `y/h` (no `NaN`) (Review Focus 1); `linePath` of `[]` gives `d: ''`, `end: null`; `linePath` is byte-identical across two calls and contains no `e-` exponent notation and at most two decimals; `spreadLabels([100,102,104],12,[0,240])` returns values at least 12 apart, within bounds, order preserved; `xTicks([0,300],4)` returns four ascending ticks inside `[0,CHART_W]`.
  - `charts.test.tsx` (`renderToString`, no DOM): each chart's HTML contains `<svg`, `role="img"`, `Reported events`, `<details`, and a `<table`; the sources line names exactly the sources passed in (pass CYCLETRACK and ADMIT, assert both appear and `RMH` does not); with an empty primary series each chart renders without `NaN` and shows no path of zero length; dates in the table for `'2026-11-20'` read "Nov 20" under `TZ=America/Los_Angeles` (Review Focus 2); the wrapper has `dir="ltr"` (D13).
  - **Colour rule (static scan of `features/medschools/ui/charts/*.tsx`):** no hex, `rgb(`, `hsl(`, `oklch(`, named colour, and every `var(--…)` is one of `--site-text`, `--site-text-muted`, `--site-border`; no `animate`, `transition`, `requestAnimationFrame`, `useEffect`, `dangerouslySetInnerHTML`, `gradient`, `filter`, `shadow`.
  - **Import containment:** only `engine/chart-geometry.ts` matches `from 'd3-`; `app/routes/**` and `features/medschools/api/**` do not import `ui/charts` or `chart-geometry`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/chart-geometry.test.ts features/medschools/ui/charts/charts.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `barsGeometry` uses `scaleBand` for x (padding 0.15) and `scaleLinear().domain([0, max || 1]).nice()` for y; `linePath` uses `line().x().y().digits(2)` with `curveStepAfter` when `step`; comparison series are muted dashed step lines over the bars' scale (`strokeDasharray="4 3"`); `CycleOverlay` draws the first cycle solid ink 2px and others muted 1.5px with dash patterns `undefined`, `"6 3"`, `"2 3"` and end labels placed with `spreadLabels`; every chart's y axis starts at 0.
- [ ] **Step 4: Run** the same command plus `pnpm exec tsx scripts/check-entry-composition.ts` (no sourcemap build yet: it says so and exits 0). Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): server-rendered SVG charts (daily bars, cumulative line, cycle overlay)`.

---

### Task 6: Shared UI pieces, query factories, i18n scaffolding

**Files:**
- Create: `features/medschools/medschools.queries.ts`
- Create: `features/medschools/ui/labels.ts`, `SourceLinks.tsx`, `ProgramSelect.tsx`, `ReportedNote.tsx`, `skeletons.tsx`, `ui-rules.test.ts`, `SourceLinks.test.tsx`
- Modify: `locales/en/medschools.json` (via `pnpm i18n:extract`)

**Interfaces:**
- Consumes: Tasks 1, 2 (`contractQuery` from `@/lib/route/route-query`).
- Produces:

```ts
// medschools.queries.ts (client-safe; no createServerFn)
export const schoolsQuery = (q: IndexQuery) => contractQuery(['medschools','schools',q], listMedSchoolsApi, { query: q }, { staleTime: 60_000 });
export const todayQuery = (program: MedProgramId) => …;
export const schoolQuery = (slug: string) => contractQuery(['medschools','school',slug], getMedSchoolApi, { params: { slug } }, { staleTime: 60_000 });
export const activityQuery = (slug: string, q: { program: MedProgramId; cycle?: number }) => …;
export const historyQuery = (slug: string, q: { program: MedProgramId; type: MedEventTypeId }) => …;
export const liveQuery = (q: LiveFilters) => contractQuery(['medschools','live',q], getMedLiveApi, { query: q }, { staleTime: 0 });
// ui
export function useMedLabels(): { eventLabel(t: MedEventTypeId): string; programLabel(p: MedProgramId | null): string; sourceName(s: MedSourceId): string };
export function SourceLinks(p: { links: SourceLinkDto[]; cycleYear?: number }): JSX.Element;     // "Source: Student Doctor Network" + <a href>
export function ProgramSelect(p: { degree: 'MD'|'DO'; value: 'ALL'|'REG'|'PHD'; onChange(v: 'ALL'|'REG'|'PHD'): void }): JSX.Element; // school page, O5 labels by degree, default ALL
export function DegreeProgramSelect(p: { value: { degree?: 'MD'|'DO'; program: 'ALL'|'REG'|'PHD'|'NONE' }; allowNone?: boolean; onChange(v: { degree?: 'MD'|'DO'; program: 'ALL'|'REG'|'PHD'|'NONE' }): void }): JSX.Element; // index/live: All, MD, MD-PhD, DO, DO-PhD (+ Program not reported)
export function CategoryToggles(p: { value: readonly MedEventTypeId[]; onChange(v: MedEventTypeId[]): void }): JSX.Element; // O4: role=group of aria-pressed ghost Buttons; the last one on cannot be turned off
export function ReportedNote(): JSX.Element;   // "Reported events, not applicants. Sources overlap and are never added together."
```

`programLabel(null)` is "Program not reported" (key `program-not-reported`); labels: `event-interview` "Interview invite", `event-secondary` "Secondary", `event-waitlist` "Waitlist", `event-rejection` "Rejection", `event-acceptance` "Acceptance", `event-withdrawn` "Withdrawn", `event-hold` "Hold"; program labels per O5 (`program-all`, `program-md`, `program-md-phd`, `program-do`, `program-do-phd`); `category-toggles-label` "Show categories". Source names are proper nouns from `SOURCE_NAMES` (not translated); the lead-in is the key `source-line` "Source: {{name}}". Links are `<a>` underlined (Y3) with `rel="noopener noreferrer"` and `target="_blank"`.

- [ ] **Step 1: Write the failing tests.**
  - `SourceLinks.test.tsx`: an SDN `thread` link renders the exact text `Source: Student Doctor Network`, an `<a>` whose `href` equals the DTO's, `rel` containing `noopener`; a CycleTrack link renders `Source: CycleTrack`; empty `links` renders nothing.
  - `ui-rules.test.ts` (static, over `features/medschools/ui/**/*.tsx` excluding tests, and the three route files): every file that renders text uses `useTranslation('medschools')`; no JSX text literal between tags (reuse the regex in `admin-page.test.ts`); no `{/*` comment on the line before a `t(` call; no `fetch(`; no `surface-card`, `surface-panel`, `backdrop`, `shadow-`, `rounded-xl|2xl|full` on content; no `font-bold|font-extrabold|uppercase|tracking-` (Y1, Y2); no raw `<table` outside `charts/` and `InterviewsTab`/`ActivityTab` tables; the three route files contain no import from `ui/charts`, `chart-geometry` or `d3-`.
  - `medschools.queries.ts` contains no `createServerFn` (the ratchet already scans `*.queries.ts`; run it).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui`. Expected: FAIL.
- [ ] **Step 3: Implement** the pieces. Loading placeholders are `Skeleton` blocks that hold the list-row and chart (`h-56 w-full`) shape; any file that draws a skeleton uses `useArrival` (M9, `arrival-coverage.test.ts`).
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools lib/__tests__/queries-server-fn-ratchet.test.ts lib/__tests__/arrival-coverage.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): shared page pieces, query options and labels for the public pages`.

---

### Task 7: Index and live pages

**Files:**
- Create: `app/routes/_site/rmh-medschool/index.tsx`, `app/routes/_site/rmh-medschool/live.tsx`
- Create: `features/medschools/ui/IndexPage.tsx`, `LivePage.tsx`, `LiveRow.tsx`, `pages.test.tsx`
- Modify: `lib/og/static-cards.ts`, `lib/og/static-card-index.ts`, `lib/sitemap.ts` (`STATIC_ROUTES`: `/rmh-medschool/live`, and `/rmh-medschool`, permanently: O1)

**Interfaces:**
- Consumes: Tasks 1, 2, 6.
- Produces: routes `/_site/rmh-medschool/` and `/_site/rmh-medschool/live`. Each route file contains only: `head: definePage({ path, title, description })`, `validateSearch: parseIndexSearch` / `parseLiveSearch`, `loaderDeps: ({ search }) => search`, `loader: ({ context, deps }) => prefetchRouteQuery(context.queryClient, …)`, `component: IndexPage` / `LivePage` (imported from `@features/medschools/ui/…`).
  - **Index:** `PageLayout` title "RMH Med Schools" (key `index-title`), then `ReportedNote`; "Latest day" block (rows on rules: school short name, count, source) headed "Interview invites reported today" when `isToday` else "Interview invites reported on {{date}}" (`formatUtcDay`); `ProgramSelect`, `SearchField` (debounced 250 ms into the URL via `useNavigate({ replace: true })`), `Select` for degree and for state; then the school list as rows on rules, each a `Link` to `/rmh-medschool/$slug`, showing name, `degree · city, state` in `t-meta`, and `reported.count` with the source name ("120 reported invites, CycleTrack"); loading skeleton rows, `EmptyState` for no match, `EmptyState` + retry `Button` on error. No primary button on the page (R4: nothing here is a primary action).
  - **Live:** rows "Interview invite · Duke · 4 min ago · Admit.org" (`LiveRow`: event label, school short name as a `Link`, `RelativeTime`, source name; program label shown when set, "Program not reported" when null); filters: event `Select`, school `Select` (from `listMedSchoolsApi`), program `Select` (All, MD / DO, MD-PhD / DO-PhD, Program not reported); `useQuery({ ...liveQuery(filters), refetchInterval: 60_000, refetchIntervalInBackground: false })`; "Show older" `Button` fetches the next page with `nextCursor` and appends; rows added by a refetch fade through `useArrivingKeys` + `arrive` (M9); the first paint never fades; no animation at rest (R5); empty, error and skeleton states.
  - Section cards: `/rmh-medschool` (file `rmh-medschool`, eyebrow `RMH Med Schools`, title `Med school cycles, reported daily.`, subtitle `Interview invites and decisions by school and day, from CycleTrack, Admit.org and SDN.`) and `/rmh-medschool/live` (file `rmh-medschool-live`, eyebrow `RMH Med Schools`, title `Live reported events.`, subtitle `The latest interview invites and decisions reported across schools, with no names.`); copy within the caps in `og-cards.test.ts` and no number in a title.

- [ ] **Step 1: Write the failing tests** (`pages.test.tsx`, `renderToString` with a seeded `QueryClient`):
  - Index with two schools renders both as links to `/rmh-medschool/duke` and the second slug, shows "reported invites" text and the source name, and renders no `Button` with `variant="primary"`; with `schools: []` renders the empty state; the `Latest day` heading reads "reported today" when `isToday` and the formatted date otherwise.
  - Live renders each row's event label and school, a null-program row shows "Program not reported", and no row text contains an `@`, a `/u/`, or the event `id`.
  - Static route-file assertions (read the source): both files call `definePage`, set `loader` with `prefetchRouteQuery`, `validateSearch`, and export `Route = createFileRoute('/_site/rmh-medschool/…')`.
  - `mergeLiveHead` is the function the live list uses (import assertion), and the 60 s interval is exactly `60_000`.
  - `og-cards.test.ts`, `og-page-coverage.test.ts` and `sitemap-coverage.test.ts` pass with the new entries (run them).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/pages.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** both pages and the entries. Reuse `PageLayout`, `SearchField`, `Select`, `Button`, `EmptyState`, `Skeleton`, `RelativeTime`, `arrive.tsx`; write no new CSS classes and no arbitrary-value utilities (Task 11 measures).
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools lib/__tests__/og-cards.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/sitemap-coverage.test.ts lib/__tests__/design-consistency.test.ts lib/__tests__/style-tiers.test.ts` then `pnpm typecheck` (the dev server or a build regenerates `app/routeTree.gen.ts`: run `pnpm exec vite build --mode development` once or start `pnpm dev` briefly, and never edit it by hand). Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): index and live pages`.

---

### Task 8: Card kind `med-school`, sitemap section, JSON-LD wiring

**Files:**
- Modify: `lib/seo.ts` (add `'med-school'` to the `ogCardPath` kind union)
- Create: `lib/og/api/og.med-school.$slug.server.ts`, `lib/og/__tests__/med-school-card.test.ts`
- Modify: `lib/sitemap.ts` (`SITEMAP_SECTION_NAMES` add `'medschools'`; `DYNAMIC_ROUTES['/rmh-medschool/$slug'] = 'medschools'`), `lib/sitemap.server.ts` (`CAPS.medschools = 1_000`; `SITEMAP_SECTIONS.medschools`)
- Modify: `docs/open-graph.md` (card kinds list)

**Interfaces:**
- Consumes: `getSchool`-style reads (a small `getCardData(slug)` in `read.server.ts` returning `{ name, degree, city, state, cycleYear, reported: { source, count } | null } | null`), `renderPageCard`.
- Produces: `GET /api/og/med-school/$slug`, `auth: 'none'`, `image/png`, long `Cache-Control` like `og.job`. The card: eyebrow `RMH Med Schools`, title the school name, subtitle `{{degree}} · {{city}}, {{state}}`, `stats: [{ value: String(count), label: 'reported interview events this cycle', lead: true }]` only when `reported` exists, `cacheKey: 'med-school:'+slug+':'+cycleYear+':'+(count ?? 'none')`, `path: '/rmh-medschool/'+slug`. The sitemap section lists active schools (`count`: active schools; `page`: `loc: /rmh-medschool/${slug}`, `lastmod: updatedAt`, `changefreq: 'daily'`, `priority: 0.5`).

- [ ] **Step 1: Write the failing tests** (`med-school-card.test.ts`, modelled on `music-card.test.ts`):
  - `ogCardPath('med-school','duke')` equals `/api/og/med-school/duke?v=${OG_CARD_VERSION}`;
  - the handler returns 404 for an unknown or inactive slug and a PNG (`content-type: image/png`) for a known one (`renderPageCard` mocked); the drawn stats never include a program-less or suppressed figure; the cache key changes when `count` changes.
  - `sitemap-coverage.test.ts` passes: the `medschools` section exists in both halves and `/rmh-medschool/$slug` maps to it.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run lib/og/__tests__/med-school-card.test.ts lib/__tests__/sitemap-coverage.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement**, then `pnpm api:routes`.
- [ ] **Step 4: Run** the same tests plus `lib/api/__tests__/route-table.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): per-school link-preview card and sitemap section`.

---

### Task 9: School page

**Files:**
- Create: `app/routes/_site/rmh-medschool/$slug.tsx`
- Create: `features/medschools/ui/SchoolPage.tsx`, `ActivityTab.tsx`, `HistoryTab.tsx`, `InterviewsTab.tsx`, `school-page.test.tsx`

**Interfaces:**
- Consumes: Tasks 1, 2, 5, 6, 8.
- Produces: route `/_site/rmh-medschool/$slug`. Route file:

```ts
export const Route = createFileRoute('/_site/rmh-medschool/$slug')({
  validateSearch: parseSchoolSearch,
  loaderDeps: ({ search }) => ({ tab: search.tab, program: search.program, type: search.type, cycle: search.cycle }),
  loader: async ({ context, params, deps }): Promise<SchoolHead | null> => { /* ensure schoolQuery(slug); HttpError 404 → throw notFound(); other errors → null;
                                                                              then prefetchRouteQuery the active tab's query */ },
  head: definePage<SchoolHead | null, { slug: string }>({
    path: ({ params }) => `/rmh-medschool/${params.slug}`,
    title: ({ loaderData }) => `${loaderData?.name ?? 'Med school'} | RMH Med Schools`,
    description: ({ loaderData }) => `Reported interview invites and decisions at ${loaderData?.name ?? 'this school'}, by day, with past cycles.`,
    ogCard: ({ params }) => ({ kind: 'med-school', id: params.slug }),
    jsonLd: ({ loaderData, params }) => loaderData ? [breadcrumbSchema([{ name: 'RMH Med Schools', path: '/rmh-medschool' }, { name: loaderData.name, path: `/rmh-medschool/${params.slug}` }])] : [],
  }),
  component: SchoolPage,
});
```

  - **Page:** `PageLayout` (`title` = school name, `breadcrumbs` RMH Med Schools > school); a facts block (degree, city, state, website as a link, interview format/type) as `t-meta` rows; `ReportedNote`; then `Tabs` in **link mode** (`renderTab` with TanStack `Link` to the same route with `search`), items from `SCHOOL_TABS` only (a code comment marks where phase 5's Forecast tab goes; no placeholder tab, no disabled tab, no stub copy); controls row under the strip: `ProgramSelect` with the school's degree (all tabs, O5), event-type `Select` (Activity, History), source `Select` (History).
  - **Activity tab:** first `CategoryToggles` + `CategoryLines` (O4) over all visible types; then, for the chosen type: `DailyBars` (primary bars, comparison dashed step lines, `fillDays` from `dayZeroOn` to today) and `CumulativeLine`, both through `ChartFrame`; a totals table (every type incl. WITHDRAWN/HOLD where present, per source, "reported events"); the D6 muted line for `unreportedProgram > 0`; `SourceLinks` for the school's links; empty state "No reported events yet this cycle." when the type has no sources.
  - **History tab:** `CycleOverlay` for `overlaySource(...)` (one source), up to four cycles; a "Source" select when more than one source qualifies; per-cycle archive-thread `SourceLinks`; empty state when fewer than one cycle has data; a one-line note when a cycle's `dayZeroEstimated` ("Cycle start estimated as June 1").
  - **Interviews tab:** per source one block of rows on rules: format, file type, style, length, difficulty, stress, impression, interview count, in/out-of-state `split` only when present (otherwise no row, no "hidden" hint); feedback lines; top questions (text, votes, cycle) each with its source name; Admit's all-cycles stats labelled "Admit.org, all reported cycles"; the stats table respects residence rows that survived the floor; `SourceLinks`; empty state when no profile and no question exists.
  - Error state per tab (retry `Button`), skeletons holding chart and row shapes, `useArrival` on content that replaces a skeleton.

- [ ] **Step 1: Write the failing tests** (`school-page.test.tsx`; render each tab component with fixture DTOs through `renderToString`):
  - The route file source contains `parseSchoolSearch`, `notFound`, `definePage`, `ogCard`, `breadcrumbSchema`, and no import from `ui/charts`, `chart-geometry`, `d3-` (the lazy-chunk rule); `SchoolPage.tsx` imports `Tabs` from `@/components/ui/tabs` and contains no `role="tablist"`, no `aria-selected`, no `layoutId`.
  - The rendered tab strip has exactly three items (Activity, History, Interviews) and none says Forecast; the labels come from `t()`.
  - Activity with a CycleTrack primary and an Admit comparison renders `<svg`, the text "Reported events", "CycleTrack (primary)" and "Admit.org" and the SDN-style attribution line "Source: Admit.org"; with only ADMIT data it names ADMIT as primary and does not mention CycleTrack; with `types: []` renders the empty state (Review Focus 1).
  - Program `PHD` fixture with no rows renders the empty state and none of the REG fixture's numbers; `unreportedProgram: 4` renders the muted line and the number 4 appears in no chart, total or table cell.
  - History with two cycles from CYCLETRACK and one line from ADMIT renders only the CYCLETRACK lines (never cross-source).
  - Interviews with `split: null` renders neither "in-state" nor a zero; with a split renders both numbers; "Admit.org, all reported cycles" appears for an Admit stats row with `allCycles: true`.
  - SSR without scripting: the Activity HTML string contains `<svg` and a `<path` (the markup is complete before hydration).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/school-page.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement.** `loader` returns `SchoolHead` (`{ slug, name, shortName, degree, state, city }`) from the cached detail; a 404 is `throw notFound()`; every other failure leaves the component's error state to render. Reuse `Select`, `Tabs`, `EmptyState`, `Button`, `Skeleton`, `PageLayout` breadcrumbs.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools lib/__tests__/design-consistency.test.ts lib/__tests__/style-tiers.test.ts lib/__tests__/og-page-coverage.test.ts lib/__tests__/arrival-coverage.test.ts` and `pnpm typecheck`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): school page with activity, history and interviews`.

---

### Task 10: Services hub entry, search entry and manifest (O1)

**Files:**
- Modify: `app/routes/_site/services/index.tsx` (one `SERVICES` entry), `lib/search/catalog.ts` (one entry beside `services`), `locales/en/feed.json` via `pnpm i18n:extract` (the hub's strings live in the `feed` namespace), `features/medschools/feature.ts`, `features/medschools/ui/ui-rules.test.ts`
- Do not create `features/medschools/catalog.ts`; do not touch `lib/catalog`.

**Interfaces:**
- Produces: a `SERVICES` entry `{ id: 'medschools', href: '/rmh-medschool', navKey: 'nav-rmh-medschools' ("RMH Med Schools"), descKey: 'services-medschools-desc' ("Med school application cycles by school: reported interview invites and decisions, past cycles and interview questions."), … }` shaped exactly like the `homes` entry (read the `ServiceDef` type; add an id to `SERVICE_TABS` only if the type requires it, and if it does, no panel). A search entry `{ id: 'rmh-medschool', href: '/rmh-medschool', keywords: 'med school medical school md do phd mstp admissions amcas aacomas interview secondary waitlist cycle sdn cycletrack admit' }` shaped like its neighbours. Manifest: `routes` lists the three route files and the six `features/medschools/api/medschools.*.server.ts` files, no `catalog`, `listed: false`.

- [ ] **Step 1: Write the failing tests** in `ui-rules.test.ts`: the manifest `routes` all exist; `app/routes/_site/services/index.tsx` contains `href: '/rmh-medschool'`; `lib/search/catalog.ts` contains `'/rmh-medschool'`; `features/medschools/catalog.ts` does not exist; `lib/catalog/index.ts` does not mention `medschools`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/ui-rules.test.ts lib/__tests__/feature-manifests.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the two entries and the manifest. Use `t('nav-rmh-medschools', { defaultValue })` style exactly as the neighbouring entries do; run `pnpm i18n:extract` and confirm both keys landed in `locales/en/feed.json`. Confirm `app/site-tier.css` needs **no** `@source not` for `features/medschools/ui`.
- [ ] **Step 4: Run** the two suites plus any services/search tests (`pnpm exec vitest run lib/search lib/__tests__/sitemap-coverage.test.ts lib/__tests__/og-page-coverage.test.ts` and anything under `app/routes/_site/services` or `components/feed` that pins the hub list; update a pinned list only by adding this entry). Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): list RMH Med Schools in the Services hub and site search`.

---

### Task 11: Build, measure, raise the budget

**Files:**
- Modify: `scripts/check-bundle-budget.ts` (only as measured)

**Interfaces:** consumes the finished pages; produces measured numbers and, only if needed, a budget raise.

- [ ] **Step 1: Measure the baseline.** In a second worktree on `main`: `git worktree add ../rmh-main main && cd ../rmh-main && pnpm install --frozen-lockfile && pnpm build:frontend && pnpm exec tsx scripts/check-bundle-budget.ts --json > /tmp/claude-0/budget-main.json` (record `siteCssBrotli`, `entryRaw`, `criticalPathRaw`, `criticalPathBrotli`; copy `.output/public/assets/site-tier-*.css` aside as `main.css`). The stale `.output` in this checkout (32,577 B site CSS against a 32,800 B line, about 0.2 KB of headroom) is not a baseline.
- [ ] **Step 2: Build the branch.** `pnpm build:frontend:sourcemap && pnpm exec tsx scripts/check-bundle-budget.ts --json > budget-branch.json && pnpm exec tsx scripts/check-entry-composition.ts --strict`. Expected for composition: no `d3-scale`, `d3-shape` or `zod` in the entry closure. If `d3-*` appears, find the importer in the report and move the import behind the page component (Task 5/9 containment), never loosen the tripwire.
- [ ] **Step 3: Find what the CSS cost.** Diff the class selectors of `main.css` and the branch's `site-tier-*.css` (`grep -o '^\.[^{]*' | sort -u`, compare). For every new selector, replace the utility with an existing class where one gives the same result (a token utility already in use, `gap-3` for `gap-[13px]`, a `t-*` class); arbitrary-value utilities (`[...]`) are the first to go. Re-measure after each batch of replacements.
- [ ] **Step 4: Raise only the measured remainder.** If `siteCssBrotli` is still above 32,800 B (the Docker build measures about 0.2% more than a plain build), edit `BUDGETS.siteCssBrotli` to measured + about 0.2 KB and add a dated paragraph in the `BUDGETS` comment block in the form of the existing ones ("Phone back-to-top and compose disc (owner exception L1a, 2026-11-20): site CSS brotli RAISED 32,600 → 32,800 B (OPT-01 line). The feature that bought the bytes is …"), headed `RMH Med Schools public pages (2026-11-xx): site CSS brotli RAISED 32,800 → N B (OPT-01 line)`, naming the feature, the measured before/after on a plain `vite build` (main sha), and the headroom kept. Do the same for `entryRaw`, `criticalPathRaw`, `criticalPathBrotli` only if they exceed their lines (the route records, the Services entry and `contract` imports are what moves them, as in RMHCharacters' lines). Never raise a line that still passes.
- [ ] **Step 5: Run** `pnpm exec tsx scripts/check-bundle-budget.ts && pnpm exec tsx scripts/check-entry-composition.ts --strict`. Expected: both pass.
- [ ] **Step 6: Record the PR line** to paste in the PR body: `OPT-01: site CSS brotli budget raised 32,800 -> N B (+D B); the feature that bought the bytes is the RMH Med Schools public pages (/rmh-medschool, /rmh-medschool/live, /rmh-medschool/$slug).` (entry/critical-path lines the same way if raised).
- [ ] **Step 7: Commit** — `build(medschools): measure the public pages and record the OPT-01 budget raise`.

---

### Task 12: Seeded visual verification, black-box check, docs, final gate

**Files:**
- Create: `scripts/medschools/seed-visual.ts`, `scripts/medschools/visual-check.mjs`, `testing/integration/medschools-public.test.ts`
- Create: `features/medschools/CLAUDE.md`
- Modify: `features/CLAUDE.md` (the "Moved so far" list), `docs/open-graph.md` (done in Task 8; confirm), `docs/plans/2026-11-11-steel-design-implementation.md` §18 (add one open row, below), `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` §14 (phase 3 status line, like phase 2's), `docs/_generated/facts.json` (`pnpm facts:generate`), `locales/en/medschools.json` (`pnpm i18n:extract`)

**Interfaces:** consumes everything; produces evidence.

- [ ] **Step 1: Seed script.** `seed-visual.ts` refuses to run unless `DATABASE_URL` points at `localhost`/`127.0.0.1` and the database name contains `scratch`. It calls `seedRegistryIfEmpty` then writes deterministic synthetic fixtures (labelled `FIXTURE` in a comment, never real figures): for three schools, CycleTrack, Admit and SDN `MedCycleCount` rows for REG over cycles 2025–2027, a few PHD rows, `MedCycle` rows for 2026 and 2027 (2025 deliberately missing: estimated start), `MedCycleEvent` rows for ADMIT and SDN including null-program ones and several sharing one `occurredAt`, an RMH count row with `contributors: 2` (must stay invisible), `MedSchoolStats` incl. an `IN_STATE` row with `contributors: 2`, `MedInterviewProfile` with `inStateCount: 5, outOfStateCount: 2`, `MedInterviewQuestion` rows, and `MedSdnThread` rows. It prints the slugs.
- [ ] **Step 2: Stand up a throwaway database and the app.**

```bash
docker run --rm -d --name medschools-scratch -p 55432:5432 -e POSTGRES_PASSWORD=scratch -e POSTGRES_DB=scratch pgvector/pgvector:pg16
export DATABASE_URL=postgresql://postgres:scratch@127.0.0.1:55432/scratch
pnpm exec prisma migrate deploy && pnpm exec tsx scripts/medschools/seed-visual.ts
pnpm build:frontend && BETTER_AUTH_SECRET=local-secret-at-least-32-chars-long BETTER_AUTH_URL=http://localhost:7005 PORT=7005 node .output/server/index.mjs &
```

  No account is needed: every public page and endpoint is anonymous.
- [ ] **Step 3: Black-box test** `testing/integration/medschools-public.test.ts` (same harness as `public.test.ts`, seeded by the script): anonymous `GET /api/medschools/schools/<slug>` is 200 with no `Set-Cookie` needed; the activity response contains no `RMH` and no `contributors` key; the live response keys equal the pinned set and contain no null-program row mislabelled as REG; `GET /rmh-medschool/<slug>` HTML contains `<svg`, `Reported events` and `Source:` and **no** occurrence of any seeded `inState`/hash value; `/rmh-medschool/does-not-exist` is a 404 page; `/sitemap.xml` chunks list `/rmh-medschool/<slug>`. Run: `INTEGRATION_BASE_URL=http://localhost:7005 DATABASE_URL=$DATABASE_URL pnpm test:integration -- testing/integration/medschools-public.test.ts`. Expected: PASS.
- [ ] **Step 4: Screenshots.** `visual-check.mjs` (Playwright, as `scripts/audit-pages.mjs` does: `ctx.addInitScript` sets `localStorage['rmh-style']` to `graphite` for Night and removes it for Day, plus the consent keys it sets; `rmh-lang=ar` cookie for `ar`) writes PNGs to `.cache/medschools-shots/`: Day and Night at 390×844 and 1280×800 for `/rmh-medschool`, `/rmh-medschool/live`, `/rmh-medschool/<slug>`, `?tab=history`, `?tab=interviews`, `?program=PHD`; `ar` (Day) at both widths for the same pages (after `pnpm i18n:pull`; the new keys are untranslated there, so `ar` shows English text under `dir="rtl"`: it checks mirroring and clipping, not translation); a run with `javaScriptEnabled: false` on the school page asserting an `<svg>` exists. It also asserts per shot: `document.documentElement.scrollWidth <= clientWidth` (no sideways scroll), every `<img>`/svg has a name or is `aria-hidden`, and the focus ring is the global one. Run `pnpm exec playwright install chromium` if missing, then `node scripts/medschools/visual-check.mjs --base-url http://localhost:7005`. **Look at every PNG** (Read tool): rows on rules with no boxes, no shadow or gradient, charts in ink and muted ink only, labels not overlapping at 390, tab strip words on a rule, mirrored layout in `ar` with the chart axis still left to right, Night contrast. Fix and re-run until clean. Do not commit the PNGs.
- [ ] **Step 5: Page audit.** `pnpm audit:pages --routes /rmh-medschool,/rmh-medschool/live,/rmh-medschool/<slug> --full --base-url http://localhost:7005`. Expected: no edge-pinned layer and no anatomy drift for the three pages (`--strict` fails on anything not allowlisted: do not add allowlist entries).
- [ ] **Step 6: Tear down.** `docker stop medschools-scratch`; stop the node server.
- [ ] **Step 7: Docs.** Write `features/medschools/CLAUDE.md` (what is public, the read rules and where they live, the k floor and primary-series rules, the chart rules and the containment of d3, how to add the Forecast tab: add `'forecast'` to `SCHOOL_TABS` between history and interviews, one query, one tab component; that it is listed under Services, not the catalog: O1). Add `medschools` to the "Moved so far" list in `features/CLAUDE.md`. In the Steel plan §18 table add one row, **unanswered**, `D13 | RMH Med Schools pages (index, live feed, school page): no section-10 recipe fits | A titled page of rows on rules with no spine (X2)`, and do not alter D7 or D10. In the spec §14 add a phase 3 status line listing the decisions D4–D11, D13, D14 and the owner revisions O1–O5. Run `pnpm i18n:extract` and confirm `locales/en/medschools.json` gained every new key (and kept the admin ones); `pnpm facts:generate`.
- [ ] **Step 8: Final gate.** `pnpm check:consistency --base main`, `pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm exec tsx scripts/check-bundle-budget.ts`, `pnpm api:routes:check`, `pnpm images:variants:check`. Expected: all green, no new warnings.
- [ ] **Step 9: Commit** — `docs(medschools): phase 3 verification harness, docs and the §18 gap row`.

---

## Self-review (run against the spec; fixes applied above)

- **Spec coverage:** §1–2 anti-goals ("applicant counts", re-identification, off-token look) → the unit label and `ReportedNote` (Tasks 5, 6), explicit `select` and pinned key sets (Tasks 3, 12), Steel rules in `ui-rules.test.ts` (Task 6). §4a → program switch, null-program handling (Tasks 1, 3, 9). §6 floor → Tasks 1, 3 (D5), live excludes RMH. §10 sources → `pickPrimary`/`buildTypeSeries`, one-source overlay, "Sources:" caption (Tasks 1, 5, 9). §11 index/live/`$slug`, tabs via shared primitive, attribution, OG (Tasks 7–9); Forecast slot left clean (Tasks 1, 9, 12). §12–15 → i18n (Task 6), wiring (Tasks 8, 10), phases 4–7 untouched. §14 phase 3 deliverables "index, live, school page Activity/History/Interviews, OG, i18n" all mapped.
- **Brief items:** read API (Tasks 2–4), pages with `head()`/OG/sitemap/JSON-LD (7–9; only `breadcrumbSchema` fits, so no school schema is invented), 60 s refetch and M9 (Task 7), tab primitive (Task 9), states (7, 9), attribution (2, 6), charts with text alternatives and primary rule (5), Services hub entry (10, O1), i18n (6, 12), visual verification (12), docs (12), budget and critical path (5, 11).
- **Step scan:** every code step names a signature and file; bodies appear only for `buildTypeSeries` (and `applyKFloor`/`overlaySource` in prose). Decisions the implementer cannot make alone (query shapes, DTO keys, cache TTLs, copy strings, file names) are fixed above.
- **Type consistency:** `CountCell`/`TypeSeries` (Task 1) are what `getActivity`/`getHistory` (Task 3) feed and what DTOs `ActivityTypeDto`/`HistoryCycleDto` (Task 2) serialize; `SchoolHead` (Task 9) is built from `MedSchoolDetailDto.school`; `LiveFilters` (Task 6) matches `parseLiveSearch` (Task 1) and `getMedLiveApi` query (Task 2); `SCHOOL_TABS` (Task 1) is the only tab source for Task 9; `SOURCE_NAMES` is used by `buildSourceLinks` (2), `useMedLabels` (6) and the chart captions (5).
- **Review Focus:** each of the five lines has a named test in the owning task (Tasks 1, 3, 4, 5, 7, 9).
- **Proportion:** the plan is a fraction of the page and API code it describes; code blocks are one algorithm.
- **Gap found and handled:** the brief's five endpoints do not cover the index's "schools that sent invites today"; D9 adds `today` and says so.

## Facts an implementer must verify (do not assume)

1. **Admit's public school-page URL.** Nothing in the repo records it (only `api.admit.org/graphql` and `med.admit.org` as the Origin header, `scrape/sources.ts`). Open one school on `med.admit.org`, record the path pattern for an alias slug, and add its builder to `sources.ts` before Task 2's Admit branch is final.
2. **Attribution wording.** Only "Source: Student Doctor Network" is in the spec; CycleTrack's and Admit.org's required text, if any, is in the owner's permission messages. Ask the owner; the names live in `SOURCE_NAMES`.
3. **`d3-scale`/`d3-shape` install and size.** `pnpm add` must resolve to the versions already in `pnpm-lock.yaml` (`d3-scale` 4.0.2/4.0.3, `d3-shape` 3.2.0/3.2.1); `.digits()` needs d3-shape 3.1+. Measure the lazy chunk in Task 11 and confirm `scaleLinear`/`scaleBand` tree-shake (`d3-scale` is `sideEffects: false`). If the chunk is unreasonable, the fallback is the hand-rolled `niceTicks` pattern in `components/ui/line-chart.tsx` (owner decision, since the spec names d3).
4. **Start's route splitting.** `vite.config.ts` says only route components are lifted; confirm with `check-entry-composition --strict` (Task 11) that nothing a route file imports for `head`, `loader` or `validateSearch` drags `ui/charts`, `d3-*` or `zod` into the entry. `validateSearch` is hand-rolled for exactly this reason (zod is on the forbidden list).
5. **`cache: { visibility: 'public' }` with `auth: 'optional'`** is accepted by `defineHandler` (only `required`/`admin` are rejected, `handler.server.ts` around line 262); confirm the response `Vary`/`Set-Cookie` behaviour behind Apache and Cloudflare does not make the body per-viewer (the body must be identical for everyone, which these handlers guarantee by never reading the session).
6. **(Void, O1)** **`unlisted: true` scope.** The schema, `catalog.test.ts` (banner/logo check) and `catalogRoutes()` honour it, but no entry uses it today. Check the arcade/library/command palette and `/builds/$slug` consumers also hide an unlisted app before relying on D12.
7. **(Void, O1)** **Art and manifest budget.** `catalog.test.ts` needs banner and logo for a listed app; the variant manifest line is 16,700 B in `image-manifest-entry-cost.test.ts`. The owner must supply the three images.
8. **Budget baselines.** The stale `.output` here measured site CSS 32,577 B against a 32,800 B line; precedents for recording a raise in this checkout are RMHCharacters (#1726) and the phone back-to-top change (#1757). `#1782` is not a budget PR here, so do not cite it.
9. **Data realities to look at in a real database before trusting the pages:** which `MedCycle` rows exist (the rest use `defaultDayZero`, estimated); whether PHD rows exist for CycleTrack; whether Admit `MedCycleEvent.occurredAt` is the event time or the feed's time (the "time ago" copy depends on it; SDN's is the post time); that `MedCycleCount.contributors` is null for every non-RMH source today (read from `rollup-events.ts`, `ingest-page.ts`, `parse-school.ts`); that `@db.Date` columns come back as UTC-midnight `Date`s so `toISOString().slice(0,10)` is the stored day.
10. **`RelativeTime`'s first render** is deterministic (null snapshot on server and hydration), so SSR live rows do not mismatch; and `useArrivingKeys` treats the first non-empty batch as the baseline.
11. **`ar`:** only English catalogs live in the repo; `pnpm i18n:pull` copies the others from the `i18n/catalogs` branch, where the new keys are not yet translated, so the `ar` check is about mirroring.
12. **Existing `medschools.json` keys** (`title`, `description`, `back`, `retry`, `empty`, `load-failed`, …) belong to the admin page; run `pnpm i18n:extract` and diff the file to confirm no admin key changed.
