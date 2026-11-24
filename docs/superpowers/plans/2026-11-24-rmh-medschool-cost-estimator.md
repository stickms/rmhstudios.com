# RMH Med Schools — Cost estimator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A private **Costs** section under each of a member's lists and under the tracker's current cycle that adds up
primary application fees (AMCAS, AACOMAS, TMDSAS), secondary fees and interview travel for those schools, with the Fee
Assistance Program (FAP) switched on or off, a total, a primary / secondaries / travel breakdown and one line per
school. Every fee is a dated, sourced, verbatim-quoted institutional fact; a school with no verifiable fee says "Fee not
published", never a guess; travel is the member's own estimate.

**Architecture:** Two checked-in, one-time curated data files under `data/medschools/` (primary fee schedules and
participating-school lists; per-school secondary fee, FAP waiver and interview mode), each figure carrying its official
URL, a verbatim quote and a checked date, filled by Haiku research agents and then **kept only if a script finds the
quote verbatim on the cited page**. No database table and no import job: one **public, cached, user-independent**
endpoint (`GET /api/medschools/costs`) validates the files at load, joins them with the registry's active schools and
the SDN interview profile, and returns institutional facts only. The calculation is a **pure TypeScript engine that runs
in the browser** on the list or tracker the page already loaded, so a member's schools and assumptions never reach a new
endpoint. Travel assumptions live in the member's own browser storage, not the account.

**Tech Stack:** TanStack Start, React 19, React Query, TypeScript strict, zod 4, vitest, Playwright (visual pass), Node
scripts run with `pnpm exec tsx`. No new dependency. **No model call at runtime**; the Haiku agents are a build-time
research aid whose output is untrusted until the verifier keeps it.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§6 anonymization, §7 data model and "school
websites are not scraped", §11 web). Roadmap: `docs/superpowers/plans/2026-11-23-rmh-medschool-roadmap.md` (item 3, and
the "shared school fact" facilitator note, which Ruling R1 answers). Precedent plan:
`docs/superpowers/plans/2026-11-23-rmh-medschool-secondaries.md` (structure, the one-time curated import of
`data/medschools/school-pages.json`, the overlap section this one sits beside). Read `features/medschools/CLAUDE.md` and
`design.md` first.

**Precedents cited (read before the task that uses them):**

- _The one-time curated file and its validator:_ `data/medschools/school-pages.json` (header: `source`, `method`,
  `checkedOn`), `features/medschools/scrape/school-pages.ts` (`officialUrl`, `isThirdPartyHost`,
  `schoolPagesFileSchema`), `scripts/medschools/import-school-pages.ts`, and the `features/medschools/CLAUDE.md` bullet
  "School pages: one-time import (no scraper)".
- _The verifier of that pass_ (session-local, not in the repo; Task 8 ports it):
  `/tmp/claude-0/-home-user-rmhstudios-com/6e7c6389-3db2-5724-b8fa-dc74390d0ab2/scratchpad/schoolpages/verify.mjs`, the
  brief `…/schoolpages/BRIEF.md`, the recovery notes `…/schoolpages/recovery-log.md`. If that directory is gone, rebuild
  from the algorithm written in Task 8.
- _A public registered endpoint, cache option and contract:_ `api/medschools.schools.$slug.secondaries.server.ts`,
  `medschools.contract.ts` (`endpoint<…>()`), `medschools.queries.ts` (`contractQuery`).
- _A private disclosure under a list and the tracker, with its query enabled on open:_
  `ui/secondaries/OverlapSection.tsx`, mounted in `ui/lists/ListSection.tsx:150` and `ui/tracker/TrackerPage.tsx:345`.
- _Client-only boundary test:_ `engine/secondaries/boundary.test.ts`.
- _Cycle labels:_ `cycleLabel`, `cycleLabelIsolated`, `cycleYearOf(date, 'SECONDARY')` in `engine/cycle.ts`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Out of scope: cost of attendance,
  tuition, aid, MCAT, CASPer, transcript and letter-service fees (roadmap item 8 owns cost of attendance), a database
  table for fees (R1), any AI call at runtime, scraping airfare or any travel price, any crawler of a school website
  (the one-time research pass is a reading by hand, like the school-pages pass), changes to the tracker's sharing or its
  milestones.
- **Public sources only (owner 2026-11-24).** Primary fees come from the official AAMC, AACOM or TMDSAS page; a school's
  fee from that school's own site. No MSAR, forum, prep company, Admit, SDN, Reddit or blog as the source of a figure
  (`isThirdPartyHost` already refuses them for a school; Task 1 adds the three service hosts). **No fee number is
  invented or remembered: this plan contains none, and the data files start with every figure `null` ("to be
  collected").**
- **Every figure carries `{ value, sourceUrl, quote, checkedOn }`.** `quote` is a verbatim sentence or phrase from
  `sourceUrl`, and it contains the figure (Task 1 checks that); the verifier (Tasks 8-10) keeps a figure only if the
  quote is found on the live page; a figure that fails verification is `null`, never "close enough". `checkedOn` is a
  UTC calendar day.
- **Privacy.** The member's list, tracker, schools, travel numbers and FAP choice are read and used in the browser. The
  new endpoint takes **no identity and no list**: its response is byte-identical for any viewer. Nothing new is written
  to any table. Assumptions stay in the browser's own storage (R4); the only write is `localStorage`, wrapped in
  `try/catch`. Nothing a member types is logged, sent, or put in a URL.
- **Dates are UTC calendar days; cycle years are entry years** (`cycleYear` 2027 is the 2026-2027 cycle); labels through
  `cycleLabelIsolated` (the site's `2026–2027` style, owner 2026-11-23). Money is USD; the engine works in **integer
  cents** (no float sums); display through `Intl.NumberFormat` for the locale.
- **API (CLAUDE.md §3):** contract in `medschools.contract.ts` (`endpoint<…>()`), `implement()` in a registered
  `apiRoute` module under `features/medschools/api/`, `pnpm api:routes`, client through `contractQuery` / `api()`, no
  raw `fetch('/api/…')`. Public, `auth: 'none'`, `rateLimit: 'read'`, a public `cache` option.
- **Steel (until the owner-approved redesign, roadmap item 11).** Flat (R1), rows on rules (R3), one ink primary per
  view (R4; this section adds none, its controls are ghost or native), nothing moves at rest (R5), content arriving
  after paint through `components/ui/arrive.tsx` (M9), `t-*` type classes, `--site-*` tokens only, `components/ui`
  primitives (`Switch`, `Input`, `Button`), 44 px controls on touch, a notice is a `t-meta` line (no tinted box, §18 D8
  is open). Components are presentational and token-driven (data in props, no fetching inside a row).
- **i18n:** every string through `t()` in namespace `medschools`, keys prefixed `costs-`; a reworded shipped string is a
  new key; no `{/* … */}` directly before a `t()` call; check `locales/en/medschools.json` after `pnpm i18n:extract`.
  Test Day and Night at 390 and 1280 px, 320 px, and once in `ar` (amounts and cycle labels isolated left to right).
- **Bundle (OPT-01):** the client may import only `engine/costs/{types,money,estimate}.ts` from the engine (pure, tiny).
  Everything that reads the JSON, zod schemas and the mode derivation is server or test code. No route file imports the
  section (it lives in the lazy list and tracker chunks). Task 4's boundary test pins both rules.
- **Commands:** typecheck with
  `GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 node node_modules/typescript-native/bin/tsc -b --singleThreaded` (plain
  `pnpm typecheck` OOMs in this container); unit tests `pnpm exec vitest run <paths>`. **Commit gate:** stage first,
  commit separately, `pnpm check:consistency` before every commit, never `--no-verify`, no `RMH_SKIP_COMMIT_GATE`.
  Generated files (`pnpm gen`, `routeTree.gen.ts`, `lib/prepaint/generated.ts`, `docs/_generated/facts/*.json`) are
  never committed. Messages explain why and end with the trailer lines the session was given. No `any`, `@ts-ignore`,
  new lint or type warnings.
- **Ordering.** Start from `main` with the secondaries work merged (it is: `OverlapSection` exists). Task 4 adds to
  `medschools.contract.ts`; rebase before Task 4 if another medschools branch has touched it.

## Review Focus

Inputs the spec implies but no obvious task test reaches; each line has its test in the named task.

1. **A missing fee is not $0.** A school with no verified fee adds nothing to the total, reads "Fee not published", and
   the total reads "at least $X, N schools not priced". A list where nothing is priced shows no total figure at all.
   Task 2, 6.
2. **FAP bigger than the list, zero, or unknown.** A waiver count larger than the number of schools waives them all and
   no more; a service whose count is `null` waives nothing and says why; "all" waives every primary fee of that service;
   the FAP switch with no data at all changes nothing and does not claim a saving. Task 2, 6.
3. **First fee known, additional fee unknown** (or the reverse): only the schools whose own fee is known are priced.
   Task 2.
4. **The same school twice** (MD and MD-PhD items, REG and PHD applications): one school, one primary fee, one secondary
   fee, one line labelled with both programs; an inactive school is shown and not counted. Task 2, 6.
5. **A school whose FAP waiver of the secondary fee is not stated** still counts its fee when FAP is on (never an
   under-estimate), with the line saying the page does not say. Task 2.
6. **Travel input abuse.** Empty, `abc`, `-5`, `1,200`, `$1,200.50`, `1e9`, `0`, a pasted ten-digit number: parsed or
   refused to a clamp of 0-10,000 dollars, never `NaN` in a total; a virtual school cannot be charged travel; an unknown
   or "either" mode counts as in-person (never under-estimate) and says so. Task 2, 3, 6.
7. **Browser storage that is blocked, full, corrupt, or from an older shape** renders the defaults and never throws; a
   reset button clears it. Task 5.
8. **Another cycle, another list.** A tracker cycle other than the one the fees were published for shows a one-line note
   with both cycle labels; a list with 200 schools stays one render (no per-school request); the list changing under an
   open section (a school removed) recalculates. Task 6, 7.
9. **`ar` and 320 px.** Amounts and cycle labels keep their order in a right-to-left page (isolated), rows wrap, no
   sideways scroll, 44 px controls, the closed section works with scripting off (a native `<details>`). Task 6, 11.
10. **Caching and identity.** The costs response is the same bytes for any viewer, has a public cache option, contains
    no member field, and the section's only network call is that GET (plus the lists or tracker read the page already
    makes). Task 4, 11.

## Decisions made in this plan (technical; owner-overridable ones are "Rulings" at the end)

- **D1 Sourced figure.** Everywhere a number, flag or mode comes from a page it is
  `Sourced<T> = { value: T; sourceUrl: string; quote: string; checkedOn: string }` in the files, and
  `{ value; sourceUrl; checkedOn }` on the wire (the quote is for the verifier and the file's reviewers, and would
  double the payload).
- **D2 The service of a school.** Never guessed from state. The research pass reads each service's official
  participating-school list and records, per school, the lists it appears on (`onLists`) with the quote naming it. The
  endpoint's `service` is the single list when exactly one, else `null` (none found, or more than one: shown as
  "Application service not confirmed", excluded from primary totals). The Texas rule is therefore a data fact, not code.
- **D3 Primary fee schedule.** Per service: `first` and `additional` (USD, the whole schedule being first school plus
  each additional school), `fapSchools` (a positive integer or `'all'`: "FAP waives the fee for up to N schools"). Other
  FAP benefits (MCAT discounts and the like) are not modelled.
- **D4 The estimate (pure).** Schools are deduplicated by slug in the caller's order. Per service, in that order, the
  first school pays `first`, each later one `additional`; with FAP on, the first `fapSchools` schools of that service
  pay 0 and are marked waived. A secondary fee is the school's once; with FAP on it is 0 and waived only when the
  school's page says so (`fapWaivesSecondary === true`). Travel is the member's per-interview figure for each school
  that is counted (the member ticked it) and whose mode is not `virtual`. Unknown anywhere stays unknown: a part is
  `{ cents, unknownSlugs }`, the total is the sum of what is known plus the count of what is not.
- **D5 Interview mode** (`virtual | in-person | either | unknown`), precedence: the school's own page (Task 10's third
  fact, dated and quoted) over the SDN interview profile's `format` (the modal reported format over all SDN reports, not
  recency weighted) over `unknown`. `MedSchool.interviewFormat` and the Admit profile are the interview **style**
  (`MMI`, `STANDARD`), not the modality, and are not used. The member can override a school's mode on the line (stored
  locally).
- **D6 Where each thing lives.** Engine and wire types in `features/medschools/engine/costs/`; file validator and loader
  in `features/medschools/scrape/costs-data.ts` (server and tests only); the endpoint service in `api/costs.server.ts`;
  the quote verifier in `scrape/quote-verify.ts` with a CLI in `scripts/medschools/verify-cost-quotes.ts`; UI in
  `ui/costs/`.

## File Structure

| Path                                                                                                                                      | Responsibility                                                                                                                                     |
| ----------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/medschools/application-fees.json`                                                                                                   | Three service schedules (fees, FAP count) and each service's participating-school names, all sourced                                               |
| `data/medschools/school-fees.json`                                                                                                        | Per school: `onLists`, secondary fee, FAP waiver of it, interview mode; all sourced                                                                |
| `features/medschools/scrape/costs-data.ts` (+test)                                                                                        | zod schemas for both files, `loadCostsData()`, host rules, "quote contains the figure" check; exports `officialUrl` re-used from `school-pages.ts` |
| `features/medschools/scrape/school-pages.ts`                                                                                              | `officialUrl` becomes an export (no behaviour change)                                                                                              |
| `features/medschools/scrape/quote-verify.ts` (+test)                                                                                      | `normQuote`, `quoteFound`, `pageTextOf` (HTML and PDF), the polite fetch queue                                                                     |
| `scripts/medschools/verify-cost-quotes.ts`                                                                                                | CLI: verify a research output directory against live pages, write the kept file and a report                                                       |
| `scripts/medschools/match-participants.ts` (+test of the matcher in `scrape/`)                                                            | Turn the verbatim participating-school names into `onLists` per registry slug                                                                      |
| `features/medschools/engine/costs/{types,money,estimate,mode}.ts` (+tests)                                                                | Pure engine; client may import `types`, `money`, `estimate` only                                                                                   |
| `features/medschools/medschools.contract.ts`                                                                                              | `MedCostsRes`, `getMedCostsApi`                                                                                                                    |
| `features/medschools/api/costs.server.ts`, `medschools.costs.server.ts` (+tests)                                                          | Service and the registered public route                                                                                                            |
| `features/medschools/medschools.queries.ts`                                                                                               | `costsQuery()`                                                                                                                                     |
| `features/medschools/ui/costs/{CostsSection,CostsView,CostLine,CostsControls,labels}.tsx`, `useCostAssumptions.ts`, `storage.ts` (+tests) | The section                                                                                                                                        |
| `features/medschools/ui/lists/ListSection.tsx`, `ui/tracker/TrackerPage.tsx`                                                              | Mount points                                                                                                                                       |
| `testing/integration/medschools-costs.test.ts`, `scripts/medschools/{seed-visual.ts,visual-check.mjs}`                                    | Verification                                                                                                                                       |
| `features/medschools/CLAUDE.md`, roadmap, spec §7/§14, `locales/en/medschools.json`, `scripts/check-bundle-budget.ts` (only as measured)  | Close-out                                                                                                                                          |

---

### Task 1: Data files, schemas and loader

**Files:**

- Create: `data/medschools/application-fees.json`, `data/medschools/school-fees.json`,
  `features/medschools/scrape/costs-data.ts`, `features/medschools/scrape/costs-data.test.ts`
- Modify: `features/medschools/scrape/school-pages.ts` (export `officialUrl`; nothing else)

**Interfaces:** produces

```ts
export type CostService = 'AMCAS' | 'AACOMAS' | 'TMDSAS';
export interface Sourced<T> {
  value: T;
  sourceUrl: string;
  quote: string;
  checkedOn: string;
}
export interface ApplicationFeesFile {
  // application-fees.json
  source: string;
  method: string;
  checkedOn: string;
  services: Record<
    CostService,
    {
      cycleYear: number | null; // entry year the schedule is for; null while uncollected
      first: Sourced<number> | null;
      additional: Sourced<number> | null;
      fapSchools: Sourced<number | 'all'> | null;
      participants: { name: string; sourceUrl: string; quote: string; checkedOn: string }[]; // the list's own spelling
    }
  >;
}
export interface SchoolFeesFile {
  // school-fees.json
  source: string;
  method: string;
  checkedOn: string;
  schools: {
    slug: string;
    checkedOn: string;
    onLists: { service: CostService; sourceUrl: string; quote: string }[]; // written by match-participants (Task 9)
    secondaryFee: Sourced<number> | null; // 0 only with a quote that says no fee is charged
    fapWaivesSecondary: Sourced<boolean> | null;
    interview: Sourced<'virtual' | 'in-person' | 'either'> | null;
    notes?: string; // free text, <= 300 chars, never shown
  }[];
}
export function loadCostsData(): { fees: ApplicationFeesFile; schools: SchoolFeesFile }; // validates, throws on a bad file
export const SERVICE_HOSTS: Record<CostService, string[]>; // see Facts 1
export function figureInQuote(value: number | 'all', quote: string): boolean;
```

Both files ship **with every figure `null`, `participants: []` and `schools` listing every registry slug with
`onLists: []` and all three facts `null`** (generated from `data/medschools/schools.json`, sorted by slug, header
`method` saying "to be collected, see the cost estimator plan"). `checkedOn` in the headers is the day the file is
created.

- [ ] **Step 1: Write the failing tests** in `costs-data.test.ts`: the committed files load; every registry slug appears
      once in `school-fees.json` and no slug that is not in `data/medschools/schools.json`; `.strict()` rejects an extra
      key; a `Sourced` with an empty quote, a non-https URL, or a URL on a host not in `SERVICE_HOSTS[service]` (primary
      figures) is refused; a school fact's URL must pass `officialUrl` (a `aamc.org`, `admit.org` or `studentdoctor.net`
      URL is refused); `figureInQuote(175, 'The fee is $175 for the first school')` true,
      `figureInQuote(175, 'costs $1,175')` false (digits are matched as a whole number, with optional thousands comma
      and `.00`), `figureInQuote('all', 'waives all application     fees')` true and false without "all"; a `fapSchools`
      number may also be spelled as a word one to thirty in the quote; `usd` must be `0 <= x <= 5000` with at most two
      decimals; `0` needs a quote matching `/no (secondary )?(application )?fee|free|     waived|not charge/i`;
      `cycleYear` is null or 2005-2100; `checkedOn` is `YYYY-MM-DD` and not in the future; an `interview` of `'either'`
      is allowed only with a quote naming both words (`virtual|online|remote` and `in[- ]person|on[- ]campus|on site`);
      a fixture file with a quote that does not contain its figure is refused with the school slug in the message.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/costs-data.test.ts`. Expected:
      FAIL (module not found).
- [ ] **Step 3: Implement** `costs-data.ts` (zod, strict, reuse `officialUrl`, a `refine` per rule above) and generate
      the two starter files with a one-off `pnpm exec tsx -e` that reads `schools.json` (do not commit the generator;
      the files are the artefact). Export `officialUrl` from `school-pages.ts`.
- [ ] **Step 4: Run to verify it passes:** same command plus
      `pnpm exec vitest run features/medschools/scrape/school-pages.test.ts`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): cost data files (all figures to be collected) and their validator`.

---

### Task 2: The estimate (pure engine)

**Files:**

- Create: `features/medschools/engine/costs/{types,money,estimate}.ts`, `money.test.ts`, `estimate.test.ts`

**Interfaces:** produces (client-safe, no imports outside `engine/costs`):

```ts
// types.ts
export type CostService = 'AMCAS' | 'AACOMAS' | 'TMDSAS';
export type InterviewModeId = 'virtual' | 'in-person' | 'either' | 'unknown';
export interface ServiceRates {
  firstCents: number | null;
  additionalCents: number | null;
  fapSchools: number | 'all' | null;
}
export interface EstimateSchool {
  slug: string;
  active: boolean;
  programs: ('REG' | 'PHD')[];
  service: CostService | null;
  secondaryCents: number | null;
  fapWaivesSecondary: boolean | null;
  mode: InterviewModeId;
  travel: boolean; // travel = the member counts an in-person trip for this school
}
export interface EstimateInput {
  schools: EstimateSchool[]; // the caller's order; duplicates by slug are merged (first wins, programs unioned, travel OR)
  rates: Partial<Record<CostService, ServiceRates>>;
  fap: boolean;
  travelPerInterviewCents: number;
}
export interface Part {
  cents: number;
  unknownSlugs: string[];
}
export interface SchoolCostLine {
  slug: string;
  counted: boolean;
  programs: ('REG' | 'PHD')[];
  primary: { cents: number | null; waived: boolean; why: 'no-service' | 'no-fee' | 'fap-unknown' | null };
  secondary: { cents: number | null; waived: boolean; fapNotStated: boolean };
  travel: { cents: number; counted: boolean; reason: 'virtual' | 'not-chosen' | 'assumed-in-person' | null };
  totalCents: number; // the known part of this line
}
export interface CostEstimate {
  lines: SchoolCostLine[];
  primary: Part;
  secondary: Part;
  travel: Part;
  totalCents: number;
  unknownCount: number;
  allUnknown: boolean;
}
// money.ts
export const MAX_TRAVEL_USD = 10_000;
export const DEFAULT_TRAVEL_USD = 500; // R5
export function toCents(usd: number): number; // Math.round(usd * 100), safe for 0.1 + 0.2
export function parseUsdInput(text: string): { ok: true; cents: number } | { ok: false }; // "$1,200.50" ok; "", "abc", "-5", "1e9" not ok; clamps nothing: > MAX is not ok
// estimate.ts
export function estimate(input: EstimateInput): CostEstimate;
```

- [ ] **Step 1: Write the failing tests** (rates are made-up fixtures, say so in a comment: they are not fee data).
      `money.test.ts`: `toCents(0.1) + toCents(0.2) === 30`; `parseUsdInput` for each input in Review Focus 6 and
      `'1,200'` to `120000`. `estimate.test.ts`: three schools on one service, first 10 / additional 4 (fixture
      dollars), FAP off: primary 18, lines in order; FAP `fapSchools: 2` waives the first two in the caller's order and
      the third pays; `fapSchools: 99` waives all three, no more; `'all'` likewise; `fapSchools: null` with FAP on
      waives nothing and every line's primary `why` is `'fap-unknown'` only when FAP is on; two services price
      independently (a TMDSAS school is "first" of TMDSAS); `first` known and `additional` null prices only the first; a
      school with `service: null` has `why: 'no-service'` and is in `primary.unknownSlugs`; a missing rate set is
      `'no-fee'`; duplicate slug REG then PHD is one line with `programs ['REG','PHD']` and one primary fee;
      `active: false` is a line with `counted: false` and adds nothing to any part or to `unknownCount`; secondary:
      known fee counts, `null` is unknown (not 0), `0` is 0; FAP on with `fapWaivesSecondary: true` waives, with `false`
      or `null` still counts and `null` sets `fapNotStated`; travel: counted and `in-person`/`either`/`unknown` charges
      `travelPerInterviewCents` (reason `assumed-in-person` for `either`/`unknown`), `virtual` is 0 with reason
      `'virtual'` even if `travel` is true, not chosen is 0 `'not-chosen'`; `totalCents` equals the sum of the three
      parts; `unknownCount` counts distinct unknown schools once; `allUnknown` is true when every counted school has an
      unknown primary and an unknown secondary; an empty input is zeros and `allUnknown: false`; `estimate` does not
      mutate its input (deep-frozen fixture).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/costs`. Expected: FAIL.
- [ ] **Step 3: Implement** `types.ts`, `money.ts` and `estimate.ts` per D4. Constants are named exports; no `Date`, no
      `Intl`, no imports.
- [ ] **Step 4: Run to verify it passes:** same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): pure cost estimate (fees, FAP waivers, travel) in integer cents`.

---

### Task 3: Interview mode (pure, server side)

**Files:**

- Create: `features/medschools/engine/costs/mode.ts`, `mode.test.ts`

**Interfaces:** produces

```ts
export function sdnFormatMode(format: string | null): InterviewModeId; // 'Virtual' -> virtual, 'In-person' -> in-person, null/other -> unknown
export function interviewModeOf(p: { page: 'virtual' | 'in-person' | 'either' | null; sdnFormat: string | null }): {
  mode: InterviewModeId;
  basis: 'school-page' | 'sdn-reports' | null;
};
```

- [ ] **Step 1: Write the failing tests:** `sdnFormatMode('Virtual')` virtual; `'virtual'`, `' VIRTUAL '` virtual;
      `'In-person'`, `'In person'`, `'On-site'` in-person; `'Hybrid'`, `'Both'` either; `null`, `''`, `'MMI'`,
      `'STANDARD'` (a style, not a modality) unknown; `interviewModeOf` prefers the page over SDN (`page 'in-person'` +
      `sdnFormat 'Virtual'` gives in-person, basis `school-page`); SDN used when the page is null (basis `sdn-reports`);
      both null gives `unknown` and basis null. **Before writing the expectations, confirm the strings SDN really
      writes** (Facts 2) and use those spellings.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/costs/mode.test.ts`. Expected:
      FAIL.
- [ ] **Step 3: Implement** both functions (lower-case, trim, a small keyword table; unknown is the default).
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): interview mode from the school page or SDN reports`.

---

### Task 4: The public endpoint and its boundary

**Files:**

- Modify: `features/medschools/medschools.contract.ts`, `features/medschools/medschools.queries.ts`; regenerate
  `lib/api/route-table.server.ts` with `pnpm api:routes`
- Create: `features/medschools/api/costs.server.ts`, `costs.server.test.ts`, `medschools.costs.server.ts`,
  `engine/costs/boundary.test.ts`

**Interfaces:** produces

```ts
export interface Sourced1<T> {
  value: T;
  sourceUrl: string;
  checkedOn: string;
}
export interface MedCostsRes {
  services: Record<
    CostService,
    {
      cycleYear: number | null;
      first: Sourced1<number> | null;
      additional: Sourced1<number> | null;
      fapSchools: Sourced1<number | 'all'> | null;
    }
  >;
  schools: {
    slug: string;
    service: CostService | null;
    secondaryFee: Sourced1<number> | null;
    fapWaivesSecondary: Sourced1<boolean> | null;
    interview: { mode: InterviewModeId; basis: 'school-page' | 'sdn-reports' | null; sourceUrl: string | null };
  }[];
}
export const getMedCostsApi = endpoint<{ res: MedCostsRes }>()({ method: 'GET', path: '/api/medschools/costs' });
export const costsQuery = () =>
  contractQuery(['medschools', 'costs'] as const, getMedCostsApi, undefined, { staleTime: 5 * 60_000 });
// costs.server.ts
export function getCosts(): Promise<MedCostsRes>;
```

`getCosts` loads and validates the files once (module-level memo), reads active `MedSchool` slugs plus the
`MedInterviewProfile` rows with `source: 'SDN'` (`schoolId`, `format`) in **one** query each, and returns a `schools`
entry for a school only when it has a service, a fee, a waiver or a mode other than `unknown`. `service` is the sole
`onLists` entry, else `null` (D2). Route: `auth: 'none'`, `rateLimit: 'read'`,
`cache: { visibility: 'public', maxAge: 300, sMaxAge: 900, staleWhileRevalidate: 3600 }`.

- [ ] **Step 1: Write the failing tests.** `costs.server.test.ts` (fake prisma as the secondaries service test does):
      with the starter files (all null) the response has three services with `null` figures and an empty `schools`; with
      an injected fixture file a school on exactly one list gets that `service`, on two lists `null`, on none `null`;
      the quote never appears in the response (`JSON.stringify` has no `quote`); an inactive school is omitted; SDN
      `format 'Virtual'` with no page fact gives `{ mode: 'virtual', basis: 'sdn-reports', sourceUrl: null }`; a page
      fact wins and carries its URL; **two prisma reads in total** for 200 schools; the response contains no field named
      `userId`, `list`, `note`. Route test: no session needed (200 anonymous), the `Cache-Control` header is public, a
      second call returns identical bytes. `boundary.test.ts`: every file under `ui/costs/` and `ui/lists`, `ui/tracker`
      imports from `engine/costs` only `types`, `money` and `estimate`; none imports `scrape/costs-data`, `zod`, or a
      `.server` module.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/api/costs.server.test.ts features/medschools/engine/costs/boundary.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** the contract, query, service and route. Add `.strict()`-style pinned key sets in the test
      (the integration test in Task 11 pins them again against the running app).
- [ ] **Step 4: Run**
      `pnpm api:routes && pnpm api:routes:check && pnpm exec vitest run features/medschools/api lib/api/__tests__/route-table.test.ts`.
      Expected: PASS (the new static path `/api/medschools/costs` shadows no `schools/$slug` sibling).
- [ ] **Step 5: Commit** —
      `feat(medschools): public costs endpoint (institutional facts only, cached, user-independent)`.

---

### Task 5: The member's assumptions (browser storage)

**Files:**

- Create: `features/medschools/ui/costs/storage.ts`, `storage.test.ts`, `useCostAssumptions.ts`,
  `useCostAssumptions.test.tsx`

**Interfaces:** produces

```ts
export interface CostAssumptions {
  v: 1;
  fap: boolean;
  travelPerInterviewUsd: number; // default false and DEFAULT_TRAVEL_USD
  travel: Record<string, string[]>; // per scope key ('list:<id>' | 'tracker:<cycle>') the slugs the member counts travel for
  mode: Record<string, 'virtual' | 'in-person'>; // the member's per-school mode override
}
export const STORAGE_KEY = 'rmh-medschool-costs-v1';
export function readAssumptions(): CostAssumptions; // never throws; defaults on any failure
export function writeAssumptions(a: CostAssumptions): void; // never throws
export function clearAssumptions(): void;
export function useCostAssumptions(scope: string): {
  value: CostAssumptions;
  setFap(b: boolean): void;
  setTravelUsd(usd: number): void;
  toggleTravel(slug: string): void;
  setMode(slug: string, m: 'virtual' | 'in-person' | null): void;
  reset(): void;
};
```

- [ ] **Step 1: Write the failing tests** (Review Focus 7): a throwing `getItem`, a throwing `setItem` (quota),
      `localStorage` undefined, invalid JSON, `{ v: 2 }`, `{ v: 1, travelPerInterviewUsd: 'x' }`, a negative or
      over-`MAX_TRAVEL_USD` travel figure, a non-array `travel`, a slug that is not `[a-z0-9-]{1,80}`, and 5,000 slugs
      each fall back to defaults (or drop the bad part) without throwing; a good value round-trips; `reset` removes the
      key; the hook starts from defaults on the server render and reads storage in an effect (no hydration mismatch: the
      first client render equals the server render); the key holds no email, user id or name (the test seeds a
      session-like global and checks the written JSON).
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/ui/costs/storage.test.ts features/medschools/ui/costs/useCostAssumptions.test.tsx`.
      Expected: FAIL.
- [ ] **Step 3: Implement** with hand validation (no zod on the client). Cap stored slugs at 4,000 total (the lists cap)
      and drop the rest.
- [ ] **Step 4: Run to verify it passes.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): cost assumptions kept in the member's own browser, never the account`.

---

### Task 6: The Costs section (presentational view and its container)

**Files:**

- Create: `features/medschools/ui/costs/{CostsSection,CostsView,CostLine,CostsControls}.tsx`, `labels.tsx`,
  `costs.test.tsx`
- Modify: `locales/en/medschools.json` (via `pnpm i18n:extract`)

**Interfaces:** consumes `costsQuery()`, `estimate`, `parseUsdInput`, `useCostAssumptions`, `cycleLabelIsolated`.
Produces:

```ts
export interface CostsSchoolInput {
  slug: string;
  name: string;
  active: boolean;
  programs: ('REG' | 'PHD')[];
  defaultTravel: boolean;
}
export function CostsSection(props: {
  scope: string;
  schools: CostsSchoolInput[];
  cycleYear: number | null;
  defaultOpen?: boolean;
}): JSX.Element;
export function CostsView(props: {
  estimateOn: CostEstimate;
  estimateOff: CostEstimate;
  fap: boolean; /* …data, labels, handlers */
}): JSX.Element;
```

`CostsSection` is a native `<details>` ("Costs") like `OverlapSection`; the query is enabled only when open. Inside: a
`t-meta` intro line ("An estimate from published fees and your own travel figure. Fees are as the sources publish them;
check each before you pay."); the **FAP `Switch`** (default off, label "I qualify for fee assistance", with a `t-meta`
line naming what is modelled: the application fee waiver for the schools the service covers, and each school's own
secondary waiver where its page says so); the **travel figure** `Input` (inputMode decimal, prefilled
`DEFAULT_TRAVEL_USD`, label "Travel per in-person interview", helper line "RMH planning figure. It is not data; replace
it with your own estimate."); the **total** (`t-title`-sized figure per Steel type: use `t-heading`; "At least $X" when
`unknownCount > 0`, followed by "N schools not priced"; nothing but a `t-meta` line when `allUnknown`); the
**breakdown** as three rows on rules (Primary applications, Secondaries, Travel) and, when FAP is on, a `t-meta` line
"Without fee assistance: $Y"; then **one line per school** (name linking to the school page, programs, primary fee or
"Fee not published" / "Application service not confirmed", secondary fee or "Fee not published" with "Waived with fee
assistance" or "The school's page does not say whether fee assistance waives it", a travel checkbox (44 px) with the
mode label "Virtual", "In person", "Virtual or in person", "Format not published" and the mode's source link, and a mode
override as a small `Select` only when the member opens the line), and a footer `t-meta`: the sources (service names
with `sourceUrl` links and the checked date, `cycleLabelIsolated`), the cycle note when `cycleYear` differs from the
fees' cycle, and a "Reset my cost settings" ghost button. No strings are built by concatenation; amounts are
`<bdi dir="ltr">`.

- [ ] **Step 1: Write the failing tests** (`costs.test.tsx`, with a mocked `costsQuery` and the same render helpers as
      `secondaries.test.tsx`): closed by default and no query fired until opened (Review Focus 9); with an all-null
      costs response every school reads "Fee not published", the total area reads "No fees published for these schools
      yet" and **no dollar total renders** (Review Focus 1); a priced fixture shows "At least" while any school is
      unknown and drops "At least" when none is; turning FAP on changes the total, shows "Without fee assistance: …" and
      never claims a saving when the rates are null; the `Switch` and the travel `Input` have accessible names; typing
      `abc`, `-5`, `1e9` keeps the last good figure and shows a `t-meta` error line, `1,200` is accepted; a virtual
      school's travel checkbox is disabled with the "Virtual" label and contributes 0; an `unknown` or `either` mode
      school ticked contributes the figure and says "counted as in person"; the mode override changes that school's line
      only; an inactive school shows "No longer listed" and adds nothing; two programs of one school are one line; the
      cycle note appears only when cycles differ; the section renders in `ar` with `dir="rtl"` and every amount and
      cycle label inside `bdi` / `dir="ltr"`; no `<textarea>`, no `transition-all`, no raw palette colour or radius
      (`ui/ui-rules.test.ts` runs on the new files); the reset button calls `clearAssumptions`; the section issues
      exactly one request (the costs GET) — assert with a spy on `fetch` that no `me/` URL is requested by the section.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui/costs`. Expected: FAIL.
- [ ] **Step 3: Implement** the four components and the labels hook (all copy via `t('costs-…', { defaultValue })`,
      plural keys for "N schools not priced"); `CostLine` takes plain props and never fetches. Run `pnpm i18n:extract`
      and read `locales/en/medschools.json` for every `costs-` key.
- [ ] **Step 4: Run** `pnpm exec vitest run features/medschools/ui` (the whole ui folder: `ui-rules.test.ts`). Expected:
      PASS.
- [ ] **Step 5: Commit** — `feat(medschools): the Costs section (total, breakdown, FAP switch, per-school lines)`.

---

### Task 7: Mount on the lists page and the tracker

**Files:**

- Modify: `features/medschools/ui/lists/ListSection.tsx`, `features/medschools/ui/tracker/TrackerPage.tsx`,
  `features/medschools/ui/lists/lists-page.test.tsx`, `features/medschools/ui/tracker/tracker-page.test.tsx`

- [ ] **Step 1: Write the failing tests.** Lists: a list with items renders the Costs section after the overlap section,
      with `scope = 'list:<id>'`; an empty list renders none; items map to `CostsSchoolInput` (an `ANY` or `REG` item is
      `programs ['REG']`, `PHD` is `['PHD']`, `defaultTravel: false`, `active` from the school). Tracker: the section is
      offered for **every** cycle the member has (the costs do not depend on the current cycle, unlike the overlap),
      `scope = 'tracker:<cycleYear>'`, `cycleYear` passed, `defaultTravel` true for an application that has an
      `INTERVIEW` milestone; removing an application removes its line without a request.
- [ ] **Step 2: Run to verify failure:**
      `pnpm exec vitest run features/medschools/ui/lists features/medschools/ui/tracker`. Expected: FAIL.
- [ ] **Step 3: Implement** the two mounts (a small pure mapper per page, exported for the test).
- [ ] **Step 4: Run** the same command plus the Task 4 boundary test. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): Costs on every list and tracker cycle`.

---

### Task 8: The quote verifier (port into the repo)

**Files:**

- Create: `features/medschools/scrape/quote-verify.ts`, `quote-verify.test.ts`,
  `scripts/medschools/verify-cost-quotes.ts`

**Interfaces:** produces

```ts
export function normQuote(s: string): string; // NFKC, curly quotes and dashes to ASCII, nbsp and runs of whitespace to one space, lower-case
export function htmlToText(html: string): string; // drops script and style, br to space, tags to space, the common entities
export function quoteFound(pageText: string | null, quote: string): boolean;
// a quote is split on '...' / '…'; every piece of at least 4 words must be a substring of normQuote(pageText); surrounding quotes ignored; null page is false
export interface PageFetcher {
  text(url: string): Promise<{ ok: true; text: string } | { ok: false; reason: string }>;
}
export function politeFetcher(opts?: {
  spacingMs?: number;
  jitterMs?: number;
  userAgent?: string;
  fetchImpl?: typeof fetch;
}): PageFetcher;
// one request at a time, 3000 ms + 0-1000 ms jitter, MEDSCHOOLS_USER_AGENT, each URL once (memoised), HTML via htmlToText, PDF via `pdftotext -layout`, 20 s timeout
```

CLI: `pnpm exec tsx scripts/medschools/verify-cost-quotes.ts --in <dir-or-file> --out <file> [--pages <dir>]`. For each
sourced figure it fetches `sourceUrl`, keeps the figure only if `quoteFound` **and** `figureInQuote`, otherwise sets it
to `null`; it writes the kept file, saves page text under `--pages` for recovery, and prints a report (`checked`,
`kept`, `dropped`, `unreachable`: each with slug and URL). It never invents or edits a quote.

- [ ] **Step 1: Write the failing tests** (a fake `fetchImpl` and a fake clock; no network): `normQuote` makes
      `“It’s – $175”` and `"it's - $175"` equal; `quoteFound` true for a quote with a trimmed `…`, false when one 4-word
      piece is missing, false for a quote under 4 words (too short to prove anything), false for a `null` page; the
      fetcher waits at least 3000 ms between two calls (fake timers), fetches a repeated URL once, reports a 403 as
      `{ ok: false, reason: 'http-403' }`, an HTML error page that is not `text/html` or `application/pdf` as not ok;
      the CLI function (exported as `verifyFile`) given a fixture with two figures, one real and one altered by a single
      word, keeps one and nulls the other and reports it.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/quote-verify.test.ts`.
      Expected: FAIL.
- [ ] **Step 3: Implement** by porting `…/schoolpages/verify.mjs` into typed modules (same normalisation and piece rule
      as that file; keep its headers and politeness numbers; read the static user agent from
      `features/medschools/scrape/sources.ts` `MEDSCHOOLS_USER_AGENT`).
- [ ] **Step 4: Run to verify it passes.** Expected: PASS. Then a dry run of the CLI on the starter files (all null):
      report says `checked: 0`.
- [ ] **Step 5: Commit** — `feat(medschools): verify-verbatim tool for sourced cost figures`.

---

### Task 9: Research pass A — primary fees, FAP and participating schools

**Files:**

- Modify: `data/medschools/application-fees.json`, `data/medschools/school-fees.json` (`onLists` only)
- Create: `features/medschools/scrape/match-participants.ts`, `match-participants.test.ts`,
  `scripts/medschools/match-participants.ts`

This is a **reading task for agents, then a mechanical verify**; the implementer does not type any number from memory.

- [ ] **Step 1: Brief (write to the scratchpad as `costs-brief-primary.md` and give to three Haiku agents, one per
      service).** Each agent is told: "You are collecting public facts for RMH Med Schools. Service:
      `<AMCAS|AACOMAS|TMDSAS>`. Use only the official site of its operator (AAMC for AMCAS, AACOM for AACOMAS, TMDSAS
      for TMDSAS: start from the service's own 'fees' and 'fee assistance / fee waiver' pages and its 'participating
      schools' list). Do not use forums, SDN, Admit, blogs, prep companies, Reddit, MSAR or any third-party page;
      third-party pages may help you find the official one but every fact must be read on the official page whose URL
      you give. Record: the cycle the page says the schedule is for (as the ENTRY year: 2027 means 2026–2027; null if
      not stated); the fee for the first school and the fee for each additional school (USD, copy the number exactly as
      printed); how many schools the fee assistance waiver covers ('all' if the page says all, otherwise the integer,
      'up to N' means N); and the participating schools' names exactly as the list prints them. For each fact give
      `sourceUrl` and a `quote`: one sentence or phrase copied verbatim from that page, containing the figure. **Never
      invent, round, convert or remember a number; if you did not read it on the official page, write null.** Output ONE
      JSON file `<service>.json` in the exact shape of `ApplicationFeesFile.services[<service>]` plus `checkedOn`
      (today), at most 8 pages fetched, politely. Reply with one line per fact: `value, url, confidence`."
- [ ] **Step 2: Run the three agents** (`Agent` tool, model `haiku`, in parallel, outputs to
      `<scratchpad>/costs/primary/`). Read each output file yourself before using it (untrusted).
- [ ] **Step 3: Verify:**
      `pnpm exec tsx scripts/medschools/verify-cost-quotes.ts --in <scratchpad>/costs/primary --out <scratchpad>/costs/primary.kept.json --pages <scratchpad>/costs/pages`.
      Read the report. **Recovery rule (as the school-pages pass):** for a figure or a name that failed, open the saved
      page text, and either (a) re-run one agent on that single fact with the saved text, or (b) leave `null`. Never
      edit a quote by hand to make it pass; a recovered quote must go through the verifier again.
- [ ] **Step 4: Write the failing tests** for `match-participants.ts`
      (`matchParticipants(names: string[], registry: {slug:string; name:string; shortName:string; aliases:string[]}[]): { matched: {slug; name}[]; unmatched: string[]; ambiguous: {name; slugs: string[]}[] }`):
      exact match after the site's name normaliser (`engine/names.ts`); "The University of X School of Medicine" matches
      a registry name "University of X"; a name matching two registry schools is `ambiguous`, never auto-assigned; MD
      and DO schools of one university are two schools; an unknown name stays `unmatched`. Run:
      `pnpm exec vitest run features/medschools/scrape/match-participants.test.ts` (FAIL), implement, run (PASS).
- [ ] **Step 5: Merge:** copy the kept figures into `application-fees.json`; run
      `scripts/medschools/match-participants.ts` to write `onLists` for every matched slug in `school-fees.json` (with
      the participant's `quote` and `sourceUrl`); print the `unmatched` and `ambiguous` names and **decide each by hand
      against the list page** (the registry's `schools.json` aliases are the evidence), recording the decision only when
      the list itself names the school; otherwise leave `onLists: []`. Run
      `pnpm exec vitest run features/medschools/scrape/costs-data.test.ts`.
- [ ] **Step 6: Commit** —
      `data(medschools): primary application fees, FAP coverage and participating schools, verified verbatim (checked 2026-11-24)`.
      The message states the counts: figures collected and kept, schools matched, unmatched left null.

---

### Task 10: Research pass B — secondary fee, FAP waiver and interview mode per school

**Files:**

- Modify: `data/medschools/school-fees.json`

- [ ] **Step 1: Batches.** Split the 221 registry schools into batches of 14 (`schools.json` order by slug, 16 batches),
      the size the school-pages pass used. Write `<scratchpad>/costs/batches/batch-NN.txt` (slug, name, degree, city,
      state, website host if known, one per line). Write the brief `costs-brief-schools.md`: "You are collecting public
      facts about US medical schools for RMH Med Schools. For each school find the school's OWN official pages (its
      `.edu` site or official domain) and record three facts. Do not use forums, SDN, Reddit, Admit.org, MSAR, US News,
      blogs, prep companies, AAMC or any third-party site as a source; they may help you locate the official page, but
      every fact must be read on the official page whose URL you give. (1) **Secondary application fee**: the fee a
      school charges with its secondary application, in USD exactly as printed; `0` only if the page says no fee is
      charged (quote it); `null` if the page does not say or the school has no secondary. (2) **Does the school waive
      that fee for applicants approved for fee assistance (AAMC FAP or the service's fee waiver)?** `true` or `false`
      only if the page says so, with the sentence; otherwise `null`. (3) **Interview format**: do the school's own pages
      say interviews are `virtual`, `in-person`, or `either` (virtual or in person, or both offered)? `null` if not
      stated. Each fact gets `sourceUrl` and a `quote` copied **verbatim** from that page, containing the figure or the
      word that decides it. **Never invent or guess; a fact you did not read on the official page is `null`.** At most 6
      pages per school, politely, no login pages, record no personal names, emails or phone numbers. Output one JSON
      file per school `<slug>.json` in the shape
      `{ slug, checkedOn, secondaryFee, fapWaivesSecondary, interview, notes }` (shapes of `SchoolFeesFile.schools[]`
      without `onLists`); reply one line per school with confidence high, medium or low and anything unreachable." Reuse
      the "Additions after the pilot" lessons from `…/schoolpages/BRIEF.md`: hidden pages and PDFs are noted, not
      guessed; a fact is high-confidence only if each non-null value is quoted from a page the agent read.
- [ ] **Step 2: Pilot.** Run one batch with one Haiku agent and one with a Sonnet agent into separate directories; run
      Step 3's verifier on both; compare the kept counts and read ten quotes by eye. Use Haiku for the rest unless
      Haiku's kept rate is under half of Sonnet's on the same batch (then say so in the commit and use Sonnet for that
      kind of page).
- [ ] **Step 3: Full run.** Run the 16 batches (up to four agents at a time, one request at a time per host is each
      agent's own rule), outputs to `<scratchpad>/costs/schools/`. Then
      `pnpm exec tsx scripts/medschools/verify-cost-quotes.ts --in <scratchpad>/costs/schools --out <scratchpad>/costs/schools.kept.json --pages <scratchpad>/costs/pages`.
- [ ] **Step 4: Recovery.** For every dropped figure whose page was reachable, one targeted retry with the saved page
      text (as the school-pages recovery did); then re-verify. Read the `unreachable` list: leave those `null`.
      Spot-check by eye 20 kept figures chosen at random, including at least five `0` fees, five `true`/`false` waivers
      and five modes, against the live page; if more than one is wrong, stop and tighten the brief instead of merging.
- [ ] **Step 5: Merge** the kept facts into `school-fees.json` (keep each school's `onLists` from Task 9), run
      `pnpm exec vitest run features/medschools/scrape/costs-data.test.ts features/medschools/api/costs.server.test.ts`.
      Record in the commit message: schools with a secondary fee, with a waiver stated, with a mode, with none.
- [ ] **Step 6: Commit** —
      `data(medschools): per-school secondary fees, FAP waivers and interview formats, verified verbatim (checked 2026-11-24)`.

---

### Task 11: Black-box tests and the visual pass

**Files:**

- Create: `testing/integration/medschools-costs.test.ts`
- Modify: `scripts/medschools/seed-visual.ts`, `scripts/medschools/visual-check.mjs`,
  `testing/integration/lib/medschools-fixture.ts` (only if the fixture school helper needs a fee)

- [ ] **Step 1: Public black box** (the app on the throwaway Postgres, as `medschools-public.test.ts`):
      `GET /api/medschools/costs` is 200 anonymous, `Cache-Control` public, two calls return identical bytes, the
      top-level and per-school key sets are pinned, no `quote`, no `userId`, no `me` anywhere; every `sourceUrl` is
      `https`; every figure's value is within the schema bounds.
- [ ] **Step 2: Private black box** (alice, bob, as `medschools-private.test.ts`): alice's list and tracker load
      unchanged by this feature; `GET /api/medschools/me/costs` does not exist (404); the section sends no travel figure
      or FAP flag anywhere (scan every table for alice's chosen travel figure, a sentinel like `7311`, after she uses
      the page through Playwright; expect zero hits) and the account-deletion path needs no change
      (`lib/account/__tests__/erasure-coverage.test.ts` still passes with no new table).
- [ ] **Step 3: Seed and visual.** `seed-visual.ts` (scratch DB only, its refusal rule stays) points the costs service
      at a **fixture** copy of the two files (an env path `MEDSCHOOLS_COSTS_DATA_DIR` read only when set, only in
      non-production; a test pins that production ignores it) with made-up, obviously fake numbers, covering: a priced
      school, one with an unpublished secondary fee, one with `0` fee, a school with no service, a virtual school, an
      unknown-mode school, a school on two lists; a three-school list and a tracker cycle with an interview milestone
      for alice. `visual-check.mjs` adds the Costs section, closed and open, FAP off and on, with the travel figure
      edited and a bad value typed, on the lists page and the tracker at 320x568, 390x844, 844x390, 768x1024, 1024x600,
      1280x800, 1920x1080, 2560x1080 in Day and Night plus `ar` at 390 and 1280; it asserts no sideways scroll, text at
      least 11 px below 1024, 44 px controls on touch, `dir=rtl` in `ar` with amounts still reading left to right, no
      shadow, gradient, filter or backdrop filter (Steel R1) on the section, and no `<textarea>`. Set the appearance
      through `PUT /api/preferences/appearance` before the Night pass (note in `features/medschools/CLAUDE.md`).
- [ ] **Step 4: Run:** `pnpm exec vitest run features/medschools`, then `pnpm test:integration` against a throwaway
      Postgres with `MEDSCHOOLS_DEDUPE_SECRET` set, then the visual script against `pnpm dev` with the scratch seed.
      Expected: PASS; read the screenshots by eye in both editions (a green gate is not "looks right").
- [ ] **Step 5: Commit** — `test(medschools): costs black-box tests and seeded visual pass`.

---

### Task 12: Docs, budget, final gate

**Files:**

- Modify: `features/medschools/CLAUDE.md`, `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§7: the two
  data files, no table; §14 a status line), `docs/superpowers/plans/2026-11-23-rmh-medschool-roadmap.md` (item 3 status,
  and the facilitator note about the shared fact table), `docs/plans/2026-11-11-steel-design-implementation.md` §18 (the
  D13 row: one sentence naming the Costs section; **not answered**), `scripts/check-bundle-budget.ts` (only as
  measured), `locales/en/medschools.json`

- [ ] **Step 1: Measure** as the secondaries plan did: baseline on `main` in a second worktree, then the branch
      (`pnpm build:frontend`, `pnpm exec tsx scripts/check-bundle-budget.ts --json`, `pnpm build:frontend:sourcemap`,
      `pnpm exec tsx scripts/check-entry-composition.ts --strict`). Record `siteCssBrotli`, `entryRaw`,
      `criticalPathRaw`, `criticalPathBrotli` and the delta. Expect no entry growth (the section is in the lazy list and
      tracker chunks; Task 4's boundary test holds the import rule). Replace arbitrary-value utilities with existing
      classes if the site CSS grew; raise a budget line only by the measured remainder with a dated comment; change
      nothing if nothing exceeds.
- [ ] **Step 2: Docs.** `features/medschools/CLAUDE.md`: a "Cost estimator (owner 2026-11-24)" section: the section and
      where it mounts; the two data files and their header, the `Sourced` rule (value, URL, verbatim quote, checked
      date) and that **no figure is typed from memory**; how to refresh them next cycle (re-run Tasks 9-10 with
      `verify-cost-quotes.ts`; the commands); the endpoint (public endpoint count is now ten, with `costs`), what it
      joins (registry, SDN profile `format`) and that it is user-independent; the engine (D4 rules, integer cents, the
      unknown-is-not-zero rule, FAP order assumption); interview mode precedence and why `interviewFormat` is not used;
      **privacy: the estimate is computed in the browser, assumptions are in `localStorage` (`rmh-medschool-costs-v1`),
      nothing is stored on the account, no `me/costs` endpoint exists**; the travel default is a planning figure, not
      data (R5); no AI. Spec and roadmap lines. `pnpm i18n:extract`; check every `costs-` key landed and earlier keys
      stayed.
- [ ] **Step 3: Final gate.** `pnpm check:consistency --base main`, `pnpm test`,
      `GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 node node_modules/typescript-native/bin/tsc -b --singleThreaded`,
      `pnpm lint`, `pnpm exec tsx scripts/check-bundle-budget.ts`,
      `pnpm exec tsx scripts/check-entry-composition.ts --strict`, `pnpm api:routes:check`,
      `pnpm images:variants:check`. Expected: all green, no new warnings. Confirm `git status` shows no generated file
      staged.
- [ ] **Step 4: PR lines:** no migration, no new env variable, no worker change; two data files with the counts from
      Tasks 9 and 10 and the date checked; one new public endpoint (`/api/medschools/costs`); "all figures verified
      verbatim against the cited official pages by `verify-cost-quotes.ts`; unverified figures are null and shown as
      'Fee not published'"; "assumptions stay in the browser"; "merge only on green CI and only after Tasks 9 and 10
      produced data" (without data the section would say 'not published' for everything).
- [ ] **Step 5: Commit** — `docs(medschools): cost estimator documentation, budget record and the Steel gap note`.

---

## Self-review (against the brief; fixes applied above)

- **Brief coverage:** primary fees for AMCAS, AACOMAS, TMDSAS with first-plus-additional and FAP counts, as a curated,
  dated, sourced file with verbatim quotes and the verifier, no remembered numbers (Tasks 1, 8, 9, Global Constraints);
  per-school secondary fee and FAP waiver by a Haiku research pass then verification, joining as a sibling file, "Fee
  not published" for the rest (R2, Tasks 1, 10, 6); interview travel as a member estimate with a justified default and
  mode from the school page or SDN (D5, R5, R7, Tasks 3, 5, 6); privacy by client-side compute, no `me/**` endpoint, no
  new storage (R3, R4, Tasks 4, 5, 11); engine with unit tests (Task 2); data files and validator, no table (R1, Task
  1); UI on lists and tracker with total, breakdown, FAP and per-school lines (Tasks 6, 7); Steel, i18n, 320-1280 and
  `ar`, integration and visual tests (Tasks 6, 11); research-pass tasks with brief and verify step (Tasks 8-10);
  close-out with docs, gate, bundle budget and the typecheck command (Task 12).
- **Type consistency:** `CostService` and `InterviewModeId` are defined in `engine/costs/types.ts` (Task 2) and re-used
  by `costs-data.ts` (Task 1 declares the same literal union; the implementer imports it from `types.ts` once Task 2
  exists, and Task 1's test pins the literals), `MedCostsRes` (Task 4) maps to `ServiceRates` (Task 2) through `toCents`
  in `CostsSection` (Task 6); `EstimateSchool.mode` is `MedCostsRes.schools[].interview.mode`.
- **Step scan:** code appears only as signatures, shapes and the briefs the agents are given; the algorithms (D4, quote
  matching) are described, not written.
- **Proportion:** longer than the one roadmap row because it adds two data files, two research passes and a verifier;
  the engine, endpoint and UI are small and each is a task of its own.

## Facts an implementer must verify (do not assume)

1. **The official hosts.** Confirm the real domains of each service's fee and participating-school pages before fixing
   `SERVICE_HOSTS` (for example `aamc.org` for AMCAS; AACOMAS may live on `aacom.org` and a vendor host; TMDSAS on
   `tmdsas.com`) by opening the pages the agents cite. A host the operator really uses but the list lacks is added with
   a comment; a vendor host that is not the operator's is not.
2. **What SDN writes in `format`.** The only fixture value seen is `"Virtual"`
   (`adapters/sdn/__fixtures__/summary-small.html`). Query the production-shaped data (a scratch import,
   `MedInterviewProfile` where `source = 'SDN'`) for the distinct `format` values and use those spellings in Task 3's
   tests. `MedSchool.interviewFormat` holds Admit's `interview_format` (`STANDARD`, `MMI`: a style) and must not be read
   as modality.
3. **Whether `INTERVIEW` is a milestone type the tracker DTO carries** (`MILESTONE_TYPES` in `engine/tracker.ts`) and
   its exact name; Task 7 uses it for the default travel tick.
4. **`MedPrisma` fake and the SDN profile read.** The costs service reads `MedInterviewProfile` directly with `prisma`;
   confirm the test fake used in `secondaries.server.test.ts` expresses `findMany` with `where`/`select` on that model,
   and extend the fake rather than casting.
5. **Tracker and list order.** The estimate's "first school" and FAP order follow the order the page lists the schools
   (list `position`; tracker application order as `TrackerPage` renders it). Confirm that order is stable and use the
   rendered order in Task 7's mapper.
6. **`Switch` and `Input` primitive APIs** (`components/ui/switch.tsx`, `input.tsx`): label wiring, `inputMode`, 44 px
   touch height; follow `SharingRow.tsx` and `MilestoneForm.tsx`.
7. **`MEDSCHOOLS_COSTS_DATA_DIR`.** The test-only override must be inert in production (`NODE_ENV === 'production'`
   ignores it), and the integration test for it must fail if that guard is removed.
8. **`og-page-coverage.test.ts` and `route-table.test.ts`** are unaffected (no new page route; the one new API path is
   static and unshadowed). Re-run them anyway.
9. **`pdftotext`** is in the container for PDF pages (the school-pages pass used it); if it is missing, a PDF page is
   "unreachable", not guessed.

## Rulings (facilitator, 2026-11-24, owner-overridable; these override task text)

- **R1 Files, not a table.** Fees are about 230 small, dated facts that change once a year by a reviewed commit. A table
  adds a migration, an import job, an admin path and an erasure check for no reader benefit; the endpoint reads the
  validated JSON at load. This answers the roadmap's "shared school fact" note for item 3 only: each `Sourced` already
  has the `value / sourceUrl / quote / checkedOn` shape, so items 5, 7 and 8 can load it into one table later without
  re-collecting.
- **R2 A sibling file, not an extension of `school-pages.json`.** That file is strictly validated and imported into the
  database with its own checked date and a verify pass already behind it; adding fields would re-open it and mix two
  checked dates. The fee file joins by slug at read time.
- **R3 No `me/**` endpoint.** The calculation needs the member's schools (the page already has them from `me/lists` or
  `me/tracker`) and public facts. Computing in the browser means the member's list is not sent anywhere new, nothing
  needs a no-cache rule, and there is nothing to erase. Cost: the public payload carries fee facts for every school with
  data (tens of kilobytes, cached).
- **R4 Assumptions are device-local, not saved to the account.** The travel figure, FAP choice and per-school ticks are
  small, personal and cheap to re-enter; storing them would add a column on `MedUserPrefs` or a table, an erasure entry
  and a sync story, and a FAP flag is sensitive (it implies financial need). The cost is that they do not follow the
  member to another device. A reset button clears them. The owner may choose account storage (question 2); the engine
  and section would not change, only `storage.ts`.
- **R5 The travel default is 500 dollars per in-person interview, and it is a planning figure, not data.** It is a
  deliberately round number of the order of a domestic round trip plus a night, chosen so that it is not mistaken for a
  measurement, shown prefilled in an editable field with the line "RMH planning figure. It is not data; replace it with
  your own estimate.", and defined once as `DEFAULT_TRAVEL_USD`. We scrape no airfare and cite no source for it. A
  default of zero would understate every total; a figure from any travel source would imply data we do not have.
- **R6 Travel is the member's choice per school.** Lists default to none ticked (a list is a plan, not a set of
  invitations), so the travel row reads 0 until the member says where they expect to go; tracker applications with an
  interview milestone default to ticked. Nothing is multiplied by a guessed invitation rate.
- **R7 Unknown mode counts as in person; virtual never costs travel.** An estimate that under-counts hurts a member more
  than one that over-counts; the line says "counted as in person". The member can override a school's mode on its line.
  SDN's `format` is the modal report over all years (not recency weighted), so it is labelled "reported by applicants"
  and the school's own page, when it states a format, outranks it.
- **R8 Unknown is not zero.** A missing fee adds nothing and is counted, the total reads "At least", and nothing is
  shown as a total when nothing is priced. A secondary fee under FAP counts unless the school's page says it waives it.
- **R9 FAP is off until the member turns it on,** because we cannot know eligibility and the saving should be a choice.
  With it on, the first `fapSchools` schools of each service in the page's order are waived; the total with FAP is
  order-dependent only when the first-school fee differs from the additional fee, and the order is the member's own list
  order.
- **R10 One fee per school, whatever the program.** A school appearing as MD and MD-PhD is one designation and one
  secondary fee. Whether MD-PhD costs more is not modelled (question 3).
- **R11 The service of a school comes from the services' own participating lists,** never from the state; a school on
  none or on several lists is "service not confirmed" and stays out of the primary total until the data says otherwise.
  A name the matcher cannot place with certainty is left `null` and listed in the commit message.
- **R12 Cycle honesty.** Each service schedule states its cycle; the section prints the checked date and cycle label
  and, when the member's tracker cycle differs, one line saying the fees are for another cycle.
- **R13 Haiku reads, a script decides.** Agents are a reading aid; the verifier is the authority: a figure survives only
  when its quote is on the cited live page and contains the figure. Spot-check by eye (Task 10, Step 4) because a quote
  can be verbatim and still belong to a different cycle or program.
- **R14 Cache 300 s max-age, 900 s shared, 3600 s stale-while-revalidate** as the other static reads: the files change
  with a deploy.

## For the owner (short; the plan does the listed thing meanwhile)

1. **The travel default.** Is 500 dollars per in-person interview a figure you are comfortable showing as a planning
   default (R5), or would you rather start at zero or at a number you choose? Meanwhile: 500, labelled "not data".
2. **Save the assumptions to the account** (so they follow the member across devices, erased with the account) or keep
   them in the browser only (R4)? Meanwhile: browser only.
3. **MD-PhD and DO-PhD.** Do dual-degree applicants pay a second secondary fee or extra primary designations at some
   schools? Meanwhile: one fee per school (R10).
4. **Lists default to no travel ticked** (R6); would you prefer a "count every school that is not virtual" default so a
   list total reads fuller? Meanwhile: none ticked, with one tap to tick all in-person schools left out (YAGNI) unless
   you say so.
5. **FAP order.** The waiver is applied to the first schools in the member's own list order (R9). Do the services say
   which designations the waiver covers? If the pages say "the first N you submit", that is the member's order and
   nothing changes; if they say otherwise the data file will carry it. The collection pass quotes whatever the page
   says.
6. **Other fees** (MCAT, CASPer, PREview, transcripts, letters, AMCAS late fees): out of scope here; add them as further
   sourced rows in the same file later?
7. **Schools on more than one service** (R11) are left unpriced until you decide a rule; the commit message lists them.
8. **Fees for an earlier cycle.** If a service has published the next cycle's schedule but the old one is still the one
   on a member's tracker cycle, we show the newest published and say so (R12). Is that the behaviour you want?
