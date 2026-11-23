# RMH Med Schools — Phase 5 (statistics, the Forecast tab, personal conditional chance) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the statistics layer the spec promises: a pure TypeScript engine (`features/medschools/engine/stats/`)
for historical share curves, a current-cycle forecast with p10/p50/p90 bands, a Kaplan-Meier "complete to interview
invite" estimate and wave detection; a daily worker job `medschools.forecast` that writes the results; a public
**Forecast** tab on the school page; waves marked on the Activity chart and the live feed; and a **personal conditional
chance** ("P(invite by date X | none by today)") on the tracker and in the Forecast tab for a signed-in member with an
application at that school.

**Architecture:** Two new tables in one additive migration: `MedForecast` (per school x program x cycle x event type: the
band and summary, public) and `MedWaitCurve` (per school x program: an aggregate Kaplan-Meier survival step function from
the private tracker rows of members who share, written only when at least 20 distinct members contribute, **no user
column, no row-level data**). The worker job (a new exclusive pg-boss queue, same shape as `medschools.rmh-publish`)
reads the **public, floored** primary series through one shared where-clause and the pure functions of
`engine/public-read.ts`, runs the engine and upserts. The public `GET /api/medschools/schools/$slug/forecast` is a
registered `apiRoute` module that only reads `MedForecast` plus the floored observed series (user-independent,
publicly cached). The personal chance is `GET /api/medschools/me/chances` (auth required, never cached): it reads the
caller's own tracker rows and one pre-aggregated `MedWaitCurve` row per school, and **never reads another member's
row**. Waves are computed from data the public endpoints already read (no table): the Activity response gains `waves`
and the live feed rows gain a `wave` flag. No AI call anywhere in this phase.

**Tech Stack:** TanStack Start, React 19, React Query, TypeScript strict, Prisma 7, zod 4, pg-boss (via
`lib/jobs/scheduled-consumer.server.ts`), vitest, Playwright for the visual pass. No statistics library, no new
dependency.

**Spec:** `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` (§5 program, §6 anonymization, §7 `MedForecast`
and "Private tracker", §8 `medschools.forecast` daily 06:40, §10 statistics and forecasting, §11 Forecast tab and
"my conditional chances", §14 item 5). Earlier plans: phase 4 `docs/superpowers/plans/2026-11-23-rmh-medschool-phase4-tracker-lists.md`
(its rulings Q2 and Q7 and open question 7 carry over), phase 3
`docs/superpowers/plans/2026-11-22-rmh-medschool-phase3-public-pages.md`. Read `features/medschools/CLAUDE.md` first.

**Precedents cited (read before the task that uses them):**

- _A daily derived job with a persisted minimum interval:_ `features/medschools/scrape/run-rmh-publish.ts` (+ test),
  `closeStaleRuns` and `lastRealRunWithin` in `scrape/run-support.ts`, its registration in
  `server/medschools-worker/index.ts` (`RMH_PUBLISH_EXPIRY_S`, `rmhPublishTick = guarded(…, expiry * 1000)`,
  `startScheduledConsumer`, `pause()` in shutdown) and its pins in `server/medschools-worker/wiring.test.ts`.
- _The public read rules:_ `engine/public-read.ts` (`publicCell`, `applyKFloor`, `buildTypeSeries`, `resolveCycleYear`,
  `toCumulativeByDay`), `api/read.server.ts` (`floorWhere`, `publicSum`, `siteCycle`, `getActivity`, `getHistory`).
- _A public registered endpoint:_ `api/medschools.schools.$slug.history.server.ts` + `getMedSchoolHistoryApi` +
  `api/read-schemas.ts`. _A private one:_ `api/medschools.me.tracker.server.ts` + `api/me-http.server.ts`.
- _Charts:_ `ui/charts/CycleOverlay.tsx` (the closest: dates on the x axis, legend, probe, tween, data table),
  `ChartFrame.tsx`, `chartColors.ts`, `engine/chart-geometry.ts` (the only d3 importer), `ui/chartLabels.ts`.
- _A tab:_ `ui/HistoryTab.tsx`, `ui/SchoolPage.tsx`, `loadSchoolHead` in `medschools.queries.ts`.

## Global Constraints

- Stack of record is TanStack Start + Vite + React 19 + Nitro. **Not Next.js.** Out of scope: AI Q&A (phase 6), follows
  and wave notifications (phase 7: this phase only produces the wave definition and marks), any new route or page, any
  change to what phase 4 shares, any new scraper or adapter, **any AI or model call** (the model/AI cost rule: this
  phase adds no spend; `lib/ai` and `MEDSCHOOLS_AI_MONTHLY_USD` are not touched).
- **Anonymization (spec §6) is the hard invariant, and so is its k floor.** A forecast is a function of the public,
  floored primary series and nothing else: an RMH figure enters only through `publishedCount` /
  `publishedContributors` at k >= 3 and dated before today UTC (the same `floorWhere`, one definition). The personal
  chance rests on a school x program curve that exists only when **>= 20 distinct members** contribute; no response,
  table, log line or error carries a user, cycle or application id of another member, a date of another member's
  milestone, or a count that identifies one contribution.
- **Never sum sources (spec §10).** Forecasts are fitted per program (REG, PHD, never ALL) to the primary series
  (CycleTrack, then Admit, SDN, RMH; `PRIMARY_ORDER`). A history cycle contributes a **share curve** from the **same
  source** as the current primary; a source is never added to another.
- **Dates are UTC calendar days.** A "day of cycle" exists inside the engine (days since the cycle's `dayZeroOn`) and is
  converted to a calendar date before anything is drawn or written in words: no "day N" anywhere in the UI (owner O7.6).
  Day-only and exact-time events are the same at day granularity.
- **Public endpoints stay user-independent and publicly cacheable;** everything personal is under `me/**`, `auth:
  'required'`, no `cache` option (never stored anywhere).
- **API (CLAUDE.md §3):** contracts in `medschools.contract.ts`, `implement()` inside registered `apiRoute` modules under
  `features/medschools/api/`, `pnpm api:routes`, clients call `contractQuery`/`api()`, no raw `fetch('/api/…')`.
- **Steel:** flat (R1: **no translucent band fill**, bands are 1px dashed boundaries), rows on rules (R3), one ink primary
  per view (R4), nothing moves at rest (R5; the only motion is the existing y-scale tween, 280 ms, response to input),
  content arriving after paint fades 160 ms via `components/ui/arrive.tsx`/`SkeletonSwap` (M9), `t-*` classes, `--site-*`
  tokens, chart colours only through `chartColors.ts` (`--site-chart-1..5`), `components/ui` primitives, 44px controls on
  touch, notices are `t-meta` lines (Steel §18 D8 is open: no tinted box). **Do not resolve Steel plan §18 items by
  assumption**; this phase touches D10 (data tables/charts, stays under the O7 note) and D13 (RMH Med Schools gap) and
  answers neither.
- **i18n:** every string through `t()` in namespace `medschools`; new keys carry a prefix (`forecast-`, `wave-`,
  `chance-`, `share-wait-`); a reworded shipped string is a new key; no `{/* … */}` immediately before a `t()` call;
  check `locales/en/medschools.json` after `pnpm i18n:extract`. Numbers and dates through `Intl` with the page locale
  (`useLocaleFormat`, `formatUtcDay`); charts keep `dir="ltr"` so the time axis stays left to right in `ar`.
- **Bundle (OPT-01):** `engine/stats` is server and worker code; no `ui/` or route file imports it (Task 2 pins that);
  the new chart and tab live in the lazy page chunk with the other tabs; d3 stays contained in `engine/chart-geometry.ts`
  and `ui/charts/*`.
- **Worker rules:** guarded with `maxRuntimeMs` equal to the queue expiry, cron owned by the `jobs` timekeeper through
  `startScheduledConsumer`, persisted minimum interval read from `MedSourceRun`, `retryLimit: 0`, paused on shutdown.
- **Commands:** `tsc` in this container OOMs through `pnpm typecheck`; run
  `GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 node node_modules/typescript-native/bin/tsc -b --singleThreaded`. Unit tests:
  `pnpm exec vitest run <paths>`. **Commit gate:** stage first, commit separately, `pnpm check:consistency` before every
  commit, never `--no-verify`, no `RMH_SKIP_COMMIT_GATE`. Messages explain why and end with the trailer lines the session
  was given (`Co-Authored-By: …`, `Claude-Session: …`). No `any`, `@ts-ignore`, new lint or type warnings. Migrations are
  additive (`migrations-additive.test.ts`).

## Owner revisions carried over (still apply)

- **O3 Attribution:** every chart says "Reported events" and names its sources (the forecast names its one fitted source).
- **O5 Programs:** a school shows only its own degree's options; REG is the MD/DO process, PHD is MD-PhD/DO-PhD.
- **O6 Visual check** on phones and odd viewports (Task 15).
- **O7 Charts:** colour tokens, card + legend, 280 ms y tween, hover/touch/keyboard probe, dates on the axis, start at 0,
  `dir="ltr"`, native `<details>` data table. `ChartFrame`, `ResponsivePlot`, `useTween`, `chartColors.ts` are reused,
  not copied.
- **Phase 4 Q2:** tracker figures are public only through the daily snapshot. **Q7:** `SUBMITTED` and `COMPLETE` never
  leave the private tables as events; phase 5 aggregates them server-side under its own floor (this plan: Task 8).

## Decisions made in this plan (owner may override; open items are "For the owner" at the end)

- **D1 One floor definition.** `floorWhere` and `publicSum` move out of `api/read.server.ts` into the client-safe, pure
  `engine/floor.ts` (a plain object builder, no Prisma import) and both the request tier and the worker import them. A
  forecast built on a different floor than the charts would publish an unpublished or sub-k RMH figure through a band.
  `run-forecast.ts` is pinned (text test) to read counts only through it.
- **D2 The fitted series is the chart's series.** The job picks the current cycle's primary exactly as the Activity chart
  does (`primarySeriesOf` over `publicCell` -> `applyKFloor` -> `buildTypeSeries`, per program, per event type) so the
  Forecast tab's observed line is the same line the Activity tab draws.
- **D3 The model, exactly.** Day `d` = days since the cycle's `dayZeroOn` (`dayOfCycle`). `asOfDay` = yesterday UTC
  (today's counts are partial: CycleTrack regenerates hourly, Admit rolls up every 15 min). `C` = cumulative count through
  `asOfDay`. For each usable history cycle `h` (same source as the current primary, season total >= 10; newest first, at
  most 4): `share_h(d)` = cumulative(h, d) / season total(h), 1 after its last report. Recency weight of the k-th newest
  usable cycle is `0.5^k`, renormalised. **FULL mode** (weighted mean of `share_h(asOfDay)` >= 0.05, `C` > 0, and at least
  one cycle with share >= 0.02): the implied total `T_h = C / share_h(asOfDay)` for cycles with share >= 0.02; 600 draws,
  draw `i` takes cycle `h` by stratified inverse CDF on `(i + 0.5) / 600` (so the weights are exact, not sampled), draws
  the remaining count `R ~ Poisson(T_h * (1 - s0_h))`, and its path is `C + R * q_h(d)` with
  `q_h(d) = (share_h(d) - s0_h) / (1 - s0_h)`. The per-day quantiles over draws are p10/p50/p90. **EARLY mode** (otherwise,
  with at least one usable cycle): draw cycle `h` the same way, total `~ Poisson(total_h)`, `R = max(0, total - C)`, same
  path shape, and the p10/p90 distances from p50 are multiplied by 1.5 (the "wide bands" of the spec), clamped at `C`. **NONE**
  (no usable history): no band; the row still exists so the page can say so. The Poisson noise uses a seeded
  `mulberry32` whose seed is `fnv1a(schoolId|program|eventType|cycleYear|asOf)`: same inputs, same output, a re-run the same
  day changes nothing, and the unit tests use fixed fixtures.
- **D4 Summary.** `total` = p10/p50/p90 of each draw's final cumulative; `halfDay` = p10/p50/p90 over draws of the first
  day the cumulative (observed through `asOfDay`, drawn after) reaches half of that draw's final total ("the expected
  date of 50% of invites"), converted to calendar dates by the endpoint.
- **D5 Kaplan-Meier from private rows, aggregate only.** An observation is one tracker application with a `COMPLETE`
  milestone in a cycle with `shareAnonymously = true`. Time = days from `COMPLETE` to the `INTERVIEW` milestone (event);
  if there is none, censored at the earliest of its `REJECTION`/`WITHDRAWN`/`ACCEPTANCE` date, else at `asOf`; an
  `INTERVIEW` before `COMPLETE`, or a `COMPLETE` after `asOf`, is not an observation. Times are capped at 180 days (a longer
  wait is censored at 180). Standard product-limit estimate; events before censorings at a tied time. Pooled over cycles
  for one school x program. The curve is stored as `{ t: number[], s: number[] }` steps with survival rounded to 3 places.
- **D6 The floor is on distinct members.** A `MedWaitCurve` row exists only when at least 20 **distinct users** have a valid
  observation for that school x program (one member with two cycles counts once toward the floor). Below it the job deletes
  the row, and "data too thin" is the absence of a row. The row stores the user count and the invited count, nothing
  person-shaped. Why 20 distinct members and not 20 observations: the spec says 20 "observations" as a privacy floor,
  and two observations from one person is one person.
- **D7 Why the worker precomputes the curve, not the request.** (a) A request that computed the curve would read other
  members' raw `COMPLETE`/`INTERVIEW` rows inside a user-facing, per-user handler: one bug in a `where` clause, or a
  logged error, and a stranger's row is on the wire. The worker is the batch tier that already holds the secret and reads
  the tracker for the publish job, and what it writes is the aggregate. (b) It gives the curve the same once-a-day
  stability as the RMH snapshot (Q2): a member who back-dates a milestone cannot move a curve a neighbour is looking at
  in real time, which would reveal who just shared (the differencing attack Q2 closes for counts). (c) Cost: a per-request
  scan is O(all tracker rows) for every tracker view. The price is a lag of up to a day, shown as "estimate as of {{date}}".
- **D8 What the request computes.** `getChances(userId, …)` reads the caller's own applications (the tracker service) and
  at most one `MedWaitCurve` row per school x program, then turns `S(t)` into
  `P(invite by elapsed+h | none by elapsed) = 1 - S(elapsed + h) / S(elapsed)` for h in 7, 14, 30, 60 days, returned
  as calendar dates and whole percents. Null when `S(elapsed) < 0.02` (nobody comparable is still waiting) or
  `elapsed + h` is beyond the curve's `maxDay`.
- **D9 Per-event sources do not enter the curve.** An Admit/SDN/RMH event row has no person on it by design (§6: random
  ids, no author), so a `COMPLETE` date and an invite cannot be paired for one person from any of them, and none of them
  carries a complete date. The brief's "per-event sources only where they carry complete dates" therefore selects nothing
  today; the engine's input type is `{ days, event }` per observation so a future source that does carry pairs
  can be added without a model change. Recorded so nobody tries to "fix" it by joining events (which would link rows to
  people).
- **D10 Waves.** On the INTERVIEW series of the primary source, summed REG + PHD within that source (what the Activity chart
  draws for `ALL`): a day is a wave when `count > 3 x median(previous 14 days, zeros included)` **and** `count >= 5` and at
  least 7 previous days exist. The floor of 5 is mine: with a median of 0 the bare rule makes every first invite a "wave".
  Today (partial) is included. Activity gets `waves: { date, count, baseline }[]`; live rows get `wave: boolean` (an
  INTERVIEW row whose school has a wave on the row's UTC day).
- **D11 Current cycle for forecasts** is `siteCycle` (the site-wide cycle `resolveCycleYear` picks): a school is never given
  its own newest cycle. Rows for earlier cycles are kept (not recomputed), a record of what was predicted.
- **D12 The Forecast tab with `program=ALL`** shows REG and says so in one `t-meta` line; the program control stays the
  school's own pair. Forecasts are per program, never summed; PHD usually has no usable history and shows the empty state.

## Review Focus

Inputs the spec implies but no obvious task test reaches; each has its test in the named task.

1. **A suppressed or unpublished RMH figure must not move a band.** A school whose only source is RMH, one cell at 2
   published contributors, one cell with `publishedCount = null`, one cell dated today: none of them is in the observed
   line, the implied total or the share. Task 6, Task 7.
2. **Degenerate fits.** No history, one history cycle, a history cycle with total 9 (excluded) or share 0 at `asOfDay`,
   `C = 0`, `asOfDay < 0` (cycle not started), `asOfDay >= endDay`, `share = 1` at `asOfDay` (nothing left), an implied
   total below `C`. No `NaN`, no negative, band monotone, `p10 <= p50 <= p90`, `p10 >= C`. Task 3.
3. **Calendar edges.** `dayOfCycle` across Dec 31/Jan 1 and Feb 29, a cycle whose `dayZeroOn` is estimated (June 1) or an
   AMCAS opening date, the June 1 rollover (a new cycle with no data: status `no-data`, no stale last-cycle band). Task 3,
   Task 7, Task 9.
4. **KM on awkward data.** Ties between an event and a censoring, all observations censored, everyone invited on day 0,
   invite before complete (dropped), `COMPLETE` in the future (dropped), rejected before any invite (censored, not an
   event), a wait past 180 days, `S(elapsed) = 0`. Task 4.
5. **The floor at exactly 19, 20, 21 distinct members**, one member with two cycles, members who do not share, a member
   who turns sharing off (gone from the next run), deleted accounts (rows cascade away). Task 8.
6. **Nothing person-shaped leaves.** The chances response has the pinned key set, no other member's date, no `userId`;
   `MedWaitCurve` and `MedForecast` have no person column; the job logs counts only. Task 1, Task 8, Task 11, Task 15.
7. **Waves on thin data.** Median 0, exactly 3x the median (not a wave: strict), 4 invites on a quiet day (not a wave),
   fewer than 7 previous days, sparse input with missing zero days, today's partial count. Task 5, Task 10.
8. **Caching and identity.** The forecast response is byte-identical for any viewer (cookie or none); every `me/**`
   response has no cache header; the tab is server-rendered with scripting off. Task 9, Task 12, Task 15.
9. **A deactivated school** (`active: false`) with a forecast row: 404 like the other tabs; a tracker application at an
   inactive school gets no chance and no link. Task 9, Task 11.
10. **`ar` and 390 px.** Dates through `Intl` in the page locale, chart left to right, legend and toggles wrap, no sideways
    scroll, 44px controls. Task 12, Task 15.

## File Structure

| Path | Responsibility |
| --- | --- |
| `prisma/schema/medschools.prisma`, `prisma/migrations/20261202090000_medschools_forecast/` | `MedForecast`, `MedWaitCurve`, `MedForecastMode`, back-relations on `MedSchool` |
| `features/medschools/engine/stats/{days,random,shares,forecast,km,waves,input,constants}.ts` (+tests, `fixtures.ts`) | The pure engine. No I/O, no d3, no `node:`, not imported by `ui/` |
| `features/medschools/engine/floor.ts` (+test) | `floorWhere`, `publicSum`: the one public floor, shared by readers and the worker |
| `features/medschools/scrape/run-forecast.ts` (+test), `scrape/run-wait-curves.ts` (+test) | The job: forecasts, then wait curves; ledger, min interval |
| `features/medschools/scrape/types.ts` | `MedPrisma` gains the calls the job makes |
| `server/medschools-worker/index.ts`, `wiring.test.ts`, `.env.example`, `server/CLAUDE.md` | Queue `medschools.forecast`, cron `40 6 * * *` |
| `features/medschools/medschools.contract.ts` | `MedSchoolForecastRes`, `MedChancesRes`, `getMedSchoolForecastApi`, `getMedChancesApi`; `waves` on activity, `wave` on live rows |
| `features/medschools/api/read-schemas.ts`, `read.server.ts` | `forecastQuery`, `getForecast`, waves in `getActivity`/`getLive` |
| `features/medschools/api/medschools.schools.$slug.forecast.server.ts` | Public registered endpoint |
| `features/medschools/api/chances.server.ts`, `medschools.me.chances.server.ts`, `me-schemas.ts` | Private service + endpoint |
| `features/medschools/engine/public-read.ts`, `engine/search.ts` | `'forecast'` in `SCHOOL_TABS` |
| `features/medschools/medschools.queries.ts` | `forecastQuery`, `chancesQuery`, loader prefetch for the tab |
| `features/medschools/ui/ForecastTab.tsx`, `ui/charts/ForecastBand.tsx`, `ui/SchoolChances.tsx`, `ui/tracker/ChanceLine.tsx`, `ui/WaveNote.tsx` | UI |
| `features/medschools/ui/{SchoolPage,ActivityTab,LiveRow,tracker/ApplicationRow,tracker/SharingRow}.tsx`, `ui/charts/{CategoryLines,DailyBars}.tsx` | Wiring and wave marks |
| `testing/integration/medschools-public.test.ts`, `medschools-private.test.ts`, `testing/integration/lib/medschools-fixture.ts`, `scripts/medschools/{seed-visual.ts,visual-check.mjs}` | Verification |
| `features/medschools/CLAUDE.md`, `server/CLAUDE.md`, spec §14, `locales/en/medschools.json` | Docs |

---

### Task 1: Schema and migration

**Files:**

- Modify: `prisma/schema/medschools.prisma` (add `forecasts MedForecast[]` and `waitCurves MedWaitCurve[]` to `MedSchool`;
  header comment names the two models as aggregate-only)
- Create: `prisma/migrations/20261202090000_medschools_forecast/migration.sql` (sorts after
  `20261201130000_medschools_admit_forum_thread`; re-check `ls prisma/migrations | tail` first)
- Modify: `features/medschools/engine/schema.test.ts`

**Interfaces:** produces (copy the existing file's style, `@@map` snake_case):

```prisma
enum MedForecastMode { FULL EARLY NONE }
model MedForecast {
  id; schoolId; program MedProgram; cycleYear Int; eventType MedEventType; modelVersion Int; mode MedForecastMode;
  source MedSource?   // the primary the fit used; null when mode NONE and no source
  asOf DateTime @db.Date; computedAt DateTime @default(now());
  curve Json    // { days: number[], p10: number[], p50: number[], p90: number[] } from asOfDay to the cycle's last day
  summary Json  // { observed, meanShare, total:{p10,p50,p90}|null, halfDay:{p10,p50,p90}|null, basis:[{cycleYear,source,weight}] }
  school MedSchool (Cascade); @@unique([schoolId, program, cycleYear, eventType]); @@index([cycleYear]); @@map("med_forecast") }
model MedWaitCurve {
  id; schoolId; program MedProgram; asOf DateTime @db.Date; computedAt DateTime @default(now());
  members Int; invited Int; maxDay Int; curve Json  // { t: number[], s: number[] }
  school (Cascade); @@unique([schoolId, program]); @@map("med_wait_curve") }
```

- [ ] **Step 1: Write the failing tests** in `schema.test.ts`: `MedForecast` and `MedWaitCurve` exist; neither has a column
      matching `PERSON_LIKE` or named `userId` (the existing generic rule must pass with `USER_OWNED` unchanged: do not add
      them to it); `MedForecast @@unique([schoolId, program, cycleYear, eventType])` and
      `MedWaitCurve @@unique([schoolId, program])` are pinned (the job upserts on them); `MedWaitCurve` has exactly the
      columns `id schoolId program asOf computedAt members invited maxDay curve` (no per-observation field can be added
      silently); the migration text creates both tables and the enum and contains no `DROP` or `ALTER ... DROP`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/schema.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** the schema; generate the SQL with
      `pnpm exec prisma migrate dev --create-only --name medschools_forecast` against a scratch DB and rename the
      directory to the timestamp above (as phase 1 Task 2 and phase 4 Task 1 did). No account-erasure registry entry is
      needed: neither model has a `User` relation, and `lib/account/__tests__/erasure-coverage.test.ts` must stay green.
- [ ] **Step 4: Verify:**
      `pnpm exec prisma validate && pnpm exec prisma generate && pnpm exec prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema --exit-code`,
      then Step 2's command plus `lib/__tests__/migrations-additive.test.ts lib/account/__tests__/erasure-coverage.test.ts`.
      Expected: PASS, "No difference detected".
- [ ] **Step 5: Commit** — `feat(medschools): forecast and wait-curve tables (aggregate-only, no person column)`.

---

### Task 2: Engine foundations (days, random, shares, constants, boundary test)

**Files:**

- Create: `features/medschools/engine/stats/{constants,days,random,shares}.ts` and `.test.ts` for each,
  `stats-boundary.test.ts`

**Interfaces:**

- Consumes: `MedSource` from `../types`.
- Produces (pure; **imports only `../types`, `../cycle`, `../public-read` and siblings**):

```ts
// constants.ts
export const MODEL_VERSION = 1;
export const DRAWS = 600;
export const EARLY_SHARE = 0.05;            // weighted mean share below this: EARLY (spec §10)
export const IMPLIED_MIN_SHARE = 0.02;      // a cycle with less than this at asOf gives no implied total
export const MIN_HISTORY_TOTAL = 10;        // season total below this: the cycle is not usable
export const MAX_HISTORY = 4;
export const RECENCY_RATIO = 0.5;
export const EARLY_WIDEN = 1.5;
export const WAVE_FACTOR = 3; export const WAVE_WINDOW = 14; export const WAVE_MIN_COUNT = 5; export const WAVE_MIN_HISTORY = 7;
export const KM_MIN_MEMBERS = 20; export const KM_MAX_DAY = 180; export const KM_MIN_SURVIVAL = 0.02;
export const CHANCE_HORIZONS = [7, 14, 30, 60] as const;
// days.ts
export function dayIndex(date: string): number;               // whole UTC days since 1970-01-01; throws on a bad date
export function dateOfIndex(i: number): string;               // inverse, YYYY-MM-DD
export function addDays(date: string, n: number): string;
// random.ts
export function fnv1a(s: string): number;                     // uint32
export function mulberry32(seed: number): () => number;       // [0,1)
export function poisson(lambda: number, rnd: () => number): number;  // Knuth below 30, rounded normal (Box-Muller) above, never < 0
export function quantile(sorted: readonly number[], q: number): number;  // linear interpolation (type 7); NaN-free for an empty array -> 0
// shares.ts
export interface DayCount { day: number; count: number }      // day = days since the cycle's day zero; sparse is fine
export function cumulativeAt(days: readonly DayCount[], day: number): number;
export function seasonTotal(days: readonly DayCount[]): number;
export function shareAt(days: readonly DayCount[], day: number): number;   // 0 when total 0; 1 after the last day
export function recencyWeights(n: number): number[];          // 1, .5, .25 ... normalised to sum 1
```

- [ ] **Step 1: Write the failing tests.**
  - `days.test.ts`: `dayIndex('1970-01-02') === 1`; `addDays('2024-02-28', 2) === '2024-03-01'` (leap) and
    `addDays('2023-12-31', 1) === '2024-01-01'`; `dateOfIndex(dayIndex(x)) === x` for 2024-02-29 and 2026-11-23;
    `dayIndex('2026-02-30')` throws; `dayOfCycle('2027-01-01', '2026-06-01') === dayIndex(...) - dayIndex(...)` (consistency
    with `engine/cycle.ts`).
  - `random.test.ts`: `fnv1a('a') === 3826002220` and is stable; `mulberry32(1)` first three values are equal to the values
    pinned from the first run (write them down once; the point is determinism) and all in `[0,1)`; the mean of 20 000
    `poisson(4, rnd)` is within 0.05 of 4 and of `poisson(100, rnd)` within 0.5 of 100; `poisson(0, rnd) === 0`;
    `quantile([1,2,3,4], 0.5) === 2.5`, `quantile([5], 0.9) === 5`, `quantile([], 0.5) === 0`.
  - `shares.test.ts`: for days `[{0,2},{3,3},{10,5}]`: `cumulativeAt(…, 2) === 2`, `cumulativeAt(…, 3) === 5`,
    `seasonTotal === 10`, `shareAt(…, 3) === 0.5`, `shareAt(…, 99) === 1`, `shareAt(…, -1) === 0`;
    `shareAt([], 5) === 0`; `recencyWeights(3)` is `[4/7, 2/7, 1/7]` to 12 places, `recencyWeights(1) = [1]`,
    `recencyWeights(0) = []`.
  - `stats-boundary.test.ts`: every non-test file under `engine/stats/` has no import of `d3-*`, `chart-geometry`,
    `node:*`, `@/`, `@prisma/*` or `zod`; and no file under `features/medschools/ui/` or `app/routes/_site/rmh-medschool/`
    imports `engine/stats` (the bundle rule).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/stats`. Expected: FAIL.
- [ ] **Step 3: Implement** the files with the signatures above. `dayIndex` parses `YYYY-MM-DD` with `Date.UTC` and rejects a
      date that does not round-trip. Do not import `chart-geometry`'s `addUtcDays` (it pulls d3 into the worker).
- [ ] **Step 4: Run to verify pass,** same command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): stats engine foundations: day math, seeded noise, share curves`.

---

### Task 3: The forecast model

**Files:**

- Create: `features/medschools/engine/stats/forecast.ts`, `forecast.test.ts`, `fixtures.ts` (test-only builders)

**Interfaces:**

- Consumes: Task 2 (`DayCount`, `cumulativeAt`, `shareAt`, `seasonTotal`, `recencyWeights`, `poisson`, `mulberry32`,
  `quantile`, constants), `MedSource`.
- Produces:

```ts
export interface HistoryCycle { cycleYear: number; source: MedSource; days: DayCount[] }   // newest first
export interface ForecastInput {
  current: DayCount[];      // the primary series' daily counts through asOfDay (days since THIS cycle's day zero)
  asOfDay: number;          // yesterday; the last fully reported day
  endDay: number;           // dayOfCycle(cycleEndOn(cycleYear), dayZeroOn)
  history: HistoryCycle[];  // raw: the engine drops cycles under MIN_HISTORY_TOTAL and keeps at most MAX_HISTORY
  seed: number;
}
export interface BandPoint { day: number; p10: number; p50: number; p90: number }   // asOfDay .. endDay, step 1
export interface Quantiles { p10: number; p50: number; p90: number }
export interface ForecastBasis { cycleYear: number; source: MedSource; weight: number; total: number; shareAtAsOf: number; impliedTotal: number | null }
export interface ForecastResult {
  mode: 'FULL' | 'EARLY' | 'NONE';
  observed: number; meanShare: number | null; basis: ForecastBasis[];
  band: BandPoint[];                 // [] when NONE or when asOfDay >= endDay
  total: Quantiles | null; halfDay: Quantiles | null;    // halfDay in days since day zero
}
export function forecastCycle(input: ForecastInput): ForecastResult;
```

`fixtures.ts` exports `triangleCycle(opts: { total: number; startDay: number; peakDay: number; endDay: number }): DayCount[]`
(integer counts that sum exactly to `total`, deterministic) and `scale(days, factor)`.

- [ ] **Step 1: Write the failing tests** (fixtures: history A total 200, B total 100, C total 8; all peak around day 150):
  - FULL, exact weights: current series equal to history A's first `asOfDay` days scaled to 40% share with `C = 80` ->
    `mode 'FULL'`, `basis[0].weight` is `2/3` with two usable cycles, `basis[0].impliedTotal` is `C / shareAtAsOf` within
    1e-9, `total.p50` within 3% of the weight-mixed implied total, `observed === 80`.
  - Band invariants over every point: `p10 <= p50 <= p90`; each of the three series is non-decreasing in `day`;
    `band[0].day === asOfDay` and `band[0].p10 === band[0].p90 === observed` (nothing left to draw at the first point);
    `p10 >= observed`; last point `day === endDay`.
  - Determinism: the same input twice is deep-equal; seeds 1 and 2 differ but their `total.p50` are within 5%.
  - More share, narrower band: the same scenario with `C` at 60% share has `(p90 - p10)` at `endDay` smaller than at 40%.
  - EARLY: share 3% at `asOfDay` -> `mode 'EARLY'`; `total.p50` within 10% of the weighted median of the history totals;
    `(p90 - p10)` at `endDay` is at least 1.4 x the FULL band of a matched scenario; `C = 0` is EARLY, not a division by zero.
  - NONE: `history = []` -> `mode 'NONE'`, `band = []`, `total === null`, `basis = []`; history with only cycle C (total 8,
    under 10) is NONE.
  - One cycle: history `[A]` -> FULL, `basis.length === 1`, `weight === 1`.
  - A cycle with share 0 at `asOfDay` (its first report is after) is in `basis` with `impliedTotal === null` and never
    divides.
  - `share = 1` at `asOfDay` for every cycle (season over in the history): `band` is flat at `observed`, no `NaN`.
  - Implied total below `C`: the band's `p10` is still `>= C`.
  - `asOfDay >= endDay` or `asOfDay < 0`: `band = []`, `mode` still computed, no throw.
  - `halfDay`: when `C` already exceeds half the implied total, `halfDay.p50 <= asOfDay` and equals the first observed day
    whose cumulative reaches half of the final total (check against a hand count in the fixture); otherwise `> asOfDay`.
  - No output value is `NaN` or non-finite in any scenario above (one helper walks the result).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/stats/forecast.test.ts`.
- [ ] **Step 3: Implement `forecastCycle`** exactly as D3/D4. Algorithm notes the signature does not fix: usable history =
      the first `MAX_HISTORY` cycles with `seasonTotal >= MIN_HISTORY_TOTAL`, weights from `recencyWeights`; stratified pick
      uses the cumulative weights of the cycles eligible for that mode (renormalised over those with share >= 0.02 in FULL);
      the per-day arrays are computed once per history cycle (`q_h`) and reused by the 600 draws; quantiles are taken per day
      over the sorted draw values; in EARLY widen p10/p90 around p50 then clamp to `>= observed` and apply a running max so
      the three series stay non-decreasing. `halfDay` scans observed days first (`cumulativeAt(current, d)`), then the draw's
      future path.
- [ ] **Step 4: Run to verify pass,** same command, plus `pnpm exec vitest run features/medschools/engine/stats`. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): current-cycle forecast with recency-weighted implied paths and Poisson noise`.

---

### Task 4: Kaplan-Meier and the conditional chance

**Files:**

- Create: `features/medschools/engine/stats/km.ts`, `km.test.ts`

**Interfaces:**

- Consumes: Task 2 (`dayIndex`, constants).
- Produces:

```ts
export interface Obs { days: number; event: boolean }                     // days from COMPLETE; event = invited
export interface SurvivalCurve { t: number[]; s: number[] }               // steps: after time t[i] survival is s[i]; both ascending in t
export function observationOf(a: { completeOn: string; inviteOn: string | null; endOn: string | null }, asOf: string): Obs | null;
export function kaplanMeier(obs: readonly Obs[]): SurvivalCurve;          // survival rounded to 3 places; t capped at KM_MAX_DAY
export function survivalAt(c: SurvivalCurve, t: number): number;          // 1 before the first step
export function maxDayOf(c: SurvivalCurve, obs: readonly Obs[]): number;  // the largest observed follow-up, capped at KM_MAX_DAY
export function inviteChance(c: SurvivalCurve, maxDay: number, elapsed: number, horizon: number): number | null;
```

- [ ] **Step 1: Write the failing tests.**
  - Textbook case: `obs = [(2,e),(3,e),(3,c),(5,e),(8,c)]` gives `t = [2,3,5]`, `s = [0.8, 0.6, 0.3]` (event before censoring at the
    tied time 3).
  - All censored `[(4,c),(9,c)]`: `t = []`, `s = []`, `survivalAt(curve, 100) === 1`. Everyone invited on day 0
    `[(0,e) x 5]`: `t=[0]`, `s=[0]`. A wait of 400 days with an event is capped: becomes censored at 180, `t` never exceeds 180.
  - `survivalAt`: 1 before the first step, the step value at and after it. Input order does not matter (shuffle the fixture).
  - `observationOf` (asOf `2026-11-23`): complete 11-01, invite 11-11 -> `{days:10, event:true}`; complete 11-01, no invite, rejected
    11-09 -> `{days:8, event:false}`; complete 11-01, none -> `{days:22, event:false}`; invite before complete -> `null`;
    complete `2026-11-24` (after asOf) -> `null`; invite after a rejection date is still the invite (the invite wins if both exist);
    a 200-day gap -> `{days:180, event:false}`.
  - `inviteChance` on the textbook curve, `maxDay = 8`: `elapsed 3, horizon 2` is `0.5` (1 - 0.3/0.6); `elapsed 3, horizon 6` is
    `null` (beyond `maxDay`); `elapsed 0, horizon 2` is `0.2`; `S(elapsed) < 0.02` (a curve ending at 0.01) is `null`; the result is
    always in `[0, 1]`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/stats/km.test.ts`.
- [ ] **Step 3: Implement** the product-limit estimator on sorted observations (group by time; at risk = observations with
      `days >= t`; events at `t` first). `observationOf` uses `dayIndex` differences.
- [ ] **Step 4: Run to verify pass.** Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): Kaplan-Meier estimate and the invite chance given none by today`.

---

### Task 5: Wave detection

**Files:**

- Create: `features/medschools/engine/stats/waves.ts`, `waves.test.ts`

**Interfaces:** consumes `DayCount`, `WAVE_*`. Produces:

```ts
export interface Wave { day: number; count: number; baseline: number }     // baseline = trailing 14-day median
export function detectWaves(days: readonly DayCount[], range?: { from: number; to: number }): Wave[];  // ascending by day
export function trailingMedian(days: readonly DayCount[], day: number, window?: number): number;       // zeros included
```

- [ ] **Step 1: Write the failing tests:** constant 2/day for 20 days then 12 on day 20 -> one wave `{day:20, count:12, baseline:2}`;
      6 on a baseline of 2 is not a wave (strict `>`: `6 > 6` is false); 4 invites on a median of 0 is not (under 5), 5 on a median
      of 0 is; the day itself is excluded from its own baseline; sparse input (missing days) counts the missing days as zeros
      (`trailingMedian` of seven zeros and seven nines is `4.5`); fewer than `WAVE_MIN_HISTORY` previous days -> no wave; `range`
      limits the returned days but the baseline still looks back past `from`; two consecutive big days after a flat 2/day run are
      both waves (the median resists the first); empty input -> `[]`.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** by densifying to zeros over `[min, max]`. **Step 4: Run to pass.**
- [ ] **Step 5: Commit** — `feat(medschools): wave detection (more than 3x the trailing 14-day median)`.

---

### Task 6: The shared public floor and the series input

**Files:**

- Create: `features/medschools/engine/floor.ts`, `floor.test.ts`, `features/medschools/engine/stats/input.ts`, `input.test.ts`
- Modify: `features/medschools/api/read.server.ts` (delete the local `floorWhere` and `publicSum`, import them from
  `../engine/floor`)

**Interfaces:**

- Consumes: `K_FLOOR`, `utcDayOf`, `publicCell`, `applyKFloor`, `buildTypeSeries`, `StoredCountRow`, `CountCell` from `./public-read`.
- Produces:

```ts
// floor.ts  (pure, no Prisma import; the objects are Prisma where fragments)
export const floorWhere: (now: Date) => { OR: [{ source: { not: 'RMH' } }, { source: 'RMH'; publishedContributors: { gte: number }; date: { lt: Date } }] };
export const publicSum: (source: MedSource, s: { count: number | null; publishedCount: number | null }) => number;
// stats/input.ts
export interface PrimarySeries { source: MedSource; days: { date: string; count: number }[] }
export function primarySeriesOf(rows: readonly StoredCountRow[], today: string): PrimarySeries | null;   // floor, then PRIMARY_ORDER
export function seriesOfSource(rows: readonly StoredCountRow[], today: string, source: MedSource): { date: string; count: number }[];
export function toDayCounts(days: readonly { date: string; count: number }[], dayZeroOn: string): DayCount[];
```

- [ ] **Step 1: Write the failing tests.**
  - `floor.test.ts`: `floorWhere(new Date('2026-11-23T10:00:00Z'))` deep-equals the object the readers used before this task
    (copy the literal from `read.server.ts` into the test as the golden), and `publicSum('RMH', {count: 9, publishedCount: 4}) === 4`,
    `publicSum('CYCLETRACK', {count: 9, publishedCount: null}) === 9`, `publicSum('RMH', {count: 9, publishedCount: null}) === 0`. The
    whole `read.server.test.ts` and `read-routes.server.test.ts` suites stay green unchanged.
  - `input.test.ts` (Review Focus 1): an RMH-only school with cells `{publishedContributors: 2}`, `{publishedCount: null}` and one dated
    today -> `primarySeriesOf` returns `null`; with a fourth cell at `publishedContributors 3` dated yesterday it is the primary
    with exactly that day; CycleTrack and RMH both present -> CycleTrack, RMH never added; `seriesOfSource(rows, today, 'ADMIT')`
    returns Admit's days only; an RMH row's `count` (live) never appears, only `publishedCount`; `toDayCounts` maps
    `2026-06-03` against `2026-06-01` to day 2 and drops nothing.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/floor.test.ts features/medschools/engine/stats/input.test.ts`.
- [ ] **Step 3: Implement** by moving the two definitions verbatim (same text, same doc comment) and composing the existing pure
      functions; `read.server.ts` imports them.
- [ ] **Step 4: Run to pass,** plus `pnpm exec vitest run features/medschools/api`. Expected: PASS.
- [ ] **Step 5: Commit** — `refactor(medschools): one public floor for the readers and the forecast job`.

---

### Task 7: The `medschools.forecast` job

**Files:**

- Create: `features/medschools/scrape/run-forecast.ts`, `run-forecast.test.ts`
- Modify: `features/medschools/scrape/types.ts` (add to `MedPrisma`: `medForecast.upsert`, `medWaitCurve` (Task 8),
  `medCycleCount.findFirst({ where, orderBy, select })` and a `select`-aware `findMany` if not present, `medCycle.findMany`),
  `server/medschools-worker/index.ts`, `server/medschools-worker/wiring.test.ts`, `.env.example`, `server/CLAUDE.md`

**Interfaces:**

- Consumes: `engine/stats/*`, `engine/floor` (`floorWhere`), `engine/cycle` (`defaultDayZero`, `cycleEndOn`, `dayOfCycle`),
  `resolveCycleYear`, `closeStaleRuns`, `lastRealRunWithin`, `brief`.
- Produces:

```ts
export const FORECAST_JOB = 'forecast';
export const FORECAST_CRON = '40 6 * * *';                      // spec §8, daily 06:40 UTC
export const FORECAST_MIN_INTERVAL_MS = 20 * 3_600_000;
export interface ForecastDeps { prisma: MedPrisma; db: PrismaClient; now?: () => Date; log: Logger; shouldStop?: () => boolean }
export interface ForecastSummary {
  runId: string; status: 'OK' | 'PARTIAL' | 'FAILED'; outcome: 'ran' | 'skipped-min-interval';
  cycleYear: number | null; schools: number; fitted: number; early: number; none: number; unchanged: number;
  curves: number; curvesRemoved: number;                         // filled by Task 8
}
export function runForecast(deps: ForecastDeps, opts: { trigger: 'CRON' | 'MANUAL' }): Promise<ForecastSummary | null>;
export function fitSchool(args: {...}): ForecastRow[];           // exported pure-ish step so the matrix test needs no database
```

Behaviour (the ledger, the interval and the stale-run close copy `run-rmh-publish.ts`; the ledger `source` is `'RMH'`, the
enum has no "derived" value and adding one touches every exhaustive source map):

1. Cycle: `resolveCycleYear({ latestWithData, now })` where `latestWithData` is the newest `cycleYear` of a floored INTERVIEW
   count anywhere (`floorWhere(now)`); `dayZeroOn` from `MedCycle` or `defaultDayZero`; `asOf = utcDayOf(now) - 1 day`;
   `asOfDay = dayOfCycle(asOf, dayZeroOn)`; `endDay = dayOfCycle(cycleEndOn(cycleYear), dayZeroOn)`.
2. One school at a time (sequential, the pool is 3): read that school's count rows for the cycle and the 4 before it (REG/PHD,
   the five `CHARTED_TYPES`, `floorWhere(now)`, explicit `select` including `publishedCount` and `publishedContributors`).
   For each program x type: `primarySeriesOf(current rows)`; none -> no row for that key. History cycle `y`: the same source
   via `seriesOfSource`; if its total is under 10 and an `MDAPPLICANTS` series with at least 30 reports exists for that cycle,
   use that for the **share shape only** (never added to anything; there is no MDApplicants data today, no adapter is written);
   else the cycle is skipped. Run `forecastCycle`, then upsert on `schoolId_program_cycleYear_eventType` with
   `modelVersion = MODEL_VERSION`, `mode`, `source`, `asOf`, `curve`, `summary`. A row whose JSON would equal the stored one is
   counted `unchanged` and not rewritten.
3. Seed = `fnv1a(\`${schoolId}|${program}|${eventType}|${cycleYear}|${asOf}\`)`.
4. `shouldStop()` is checked between schools; a stop ends the run `PARTIAL`. The log lines carry counts only.

- [ ] **Step 1: Write the failing tests** (`run-forecast.test.ts`, in-memory fake in the style of `run-rmh-publish.test.ts`):
  - A seeded school (CycleTrack current cycle, two history cycles) gets one `FULL` row for INTERVIEW REG with `source
    'CYCLETRACK'`, `asOf` yesterday, `curve.days` from `asOfDay` to `endDay` and arrays of equal length; a PHD key with no
    data gets no row.
  - Review Focus 1 end to end: an RMH-only school with a 2-contributor cell and a null-published cell gets no row; flipping the
    live `contributors` to 5 without a published value changes nothing (a second run is `unchanged: all`).
  - Idempotent: a second `MANUAL` run on the same day writes nothing new (`unchanged` equals the first run's `fitted + early +
    none`) and a third with a different `now` the next day changes `asOf`.
  - Minimum interval: a `CRON` run within 20 h of an OK run is `skipped-min-interval` and reads no counts; `MANUAL` bypasses it; a
    ledger read error fails closed (skipped) as in rmh-publish.
  - A history cycle under 10 events is not in `summary.basis`; no usable history writes a `NONE` row with `curve.days = []`.
  - June 1 rollover: with `now = 2027-06-02` and no data in the new cycle, no rows are written for it and the previous cycle's rows
    are untouched.
  - Stop: `shouldStop` true after the first school -> status `PARTIAL`, the second school untouched.
  - Text pins: `run-forecast.ts` imports `floorWhere` from `../engine/floor` and contains no `medCycleEvent` and no `.count)`
    read of a live RMH column (the file never selects `count`/`contributors` of an RMH row without the floor), and contains no
    import of `lib/ai`, `fetch(` or `createPoliteHost` (no network, no model).
  - `wiring.test.ts` (extend, same style as the rmh-publish pin): `const FORECAST_QUEUE = 'medschools.forecast'`, `const
    FORECAST_EXPIRY_S = 20 * 60`, `forecastTick = guarded('forecast', …, FORECAST_EXPIRY_S * 1000)`, `queue: FORECAST_QUEUE, cron:
    FORECAST_CRON`, `expireInSeconds: FORECAST_EXPIRY_S`, `retryLimit: 0`, `handler: forecastTick`, `forecastConsumer?.pause()`,
    `process.env.MEDSCHOOLS_FORECAST_CRON?.trim() || FORECAST_CRON`, and `.env.example` names `MEDSCHOOLS_FORECAST_CRON`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/run-forecast.test.ts server/medschools-worker`.
- [ ] **Step 3: Implement** `run-forecast.ts`, the `MedPrisma` additions, and the worker wiring (a new tick next to
      `rmhPublishTick`, passing `shouldStop: stopAfter(FORECAST_EXPIRY_S * 1000 - 60_000)`; add the queue to the "Started" log and
      the shutdown `pause()` list; the job is not behind a source flag and needs no dedupe secret: it reads figures already in the
      database). `server/CLAUDE.md`: one paragraph beside the rmh-publish one (queue, cron, expiry, 20 h interval, no AI).
- [ ] **Step 4: Run to pass,** plus `GOMEMLIMIT=2GiB GOGC=10 GOMAXPROCS=1 node node_modules/typescript-native/bin/tsc -b --singleThreaded`.
      Expected: PASS, no new errors.
- [ ] **Step 5: Commit** — `feat(medschools): daily forecast job (queue medschools.forecast, 06:40 UTC, no AI)`.

---

### Task 8: Wait curves in the same job

**Files:**

- Create: `features/medschools/scrape/run-wait-curves.ts`, `run-wait-curves.test.ts`
- Modify: `features/medschools/scrape/run-forecast.ts` (call it after the forecasts; its failure makes the run `PARTIAL`, never
  hides the forecasts), `features/medschools/scrape/types.ts` (`medWaitCurve.upsert/deleteMany/findMany`)

**Interfaces:**

- Consumes: `observationOf`, `kaplanMeier`, `maxDayOf`, `KM_MIN_MEMBERS`, `$queryRaw` on the real client.
- Produces:

```ts
export interface TrackerObservationRow {          // one flat row per application with a COMPLETE date, sharing cycles only
  schoolId: string; program: 'REG' | 'PHD'; member: string;   // member = the user id; lives in memory for one run, never stored, logged or thrown
  completeOn: string; inviteOn: string | null; endOn: string | null;
}
export function loadObservationRows(db: Pick<PrismaClient, '$queryRaw'>): Promise<TrackerObservationRow[]>;
export function buildWaitCurves(rows: readonly TrackerObservationRow[], asOf: string):
  { schoolId: string; program: 'REG' | 'PHD'; members: number; invited: number; maxDay: number; curve: SurvivalCurve }[];
export function runWaitCurves(deps: { prisma: MedPrisma; db: PrismaClient; asOf: string; log: Logger }): Promise<{ curves: number; removed: number }>;
```

`loadObservationRows` is one SQL statement joining `med_tracker_cycle` (`shareAnonymously = true`) -> `med_tracker_application` ->
`med_tracker_milestone` (`COMPLETE` required; `INTERVIEW` as `inviteOn`; the earliest of `REJECTION`, `WITHDRAWN`, `ACCEPTANCE` as
`endOn`) for active schools. Verify the real column names in the migration SQL (camelCase quoted, as `run-rmh-publish.ts` uses).

- [ ] **Step 1: Write the failing tests** (pure `buildWaitCurves`, then the runner with a fake):
  - Floor (Review Focus 5): 19 distinct members -> no curve; 20 -> one; 21 -> one with `members: 21`. One member with two cycles
    at the same school counts once toward the 20 (19 members + a repeat = no curve) but both observations feed the curve when it
    exists. Observations dropped by `observationOf` (invite before complete) do not count toward the floor.
  - The row set is only what the SQL returned: a test that the SQL text contains `"shareAnonymously" = true` and `'COMPLETE'`,
    and that a fixture member with sharing off (modelled as absent from the rows) changes nothing; switching one member out
    drops 20 to 19 and the next run **deletes** the stored row (`removed: 1`), and a school x program that never reached 20 has no
    row to delete.
  - Stored shape: `curve` has exactly the keys `t` and `s`; the upsert `data` has exactly `schoolId, program, asOf, members,
    invited, maxDay, curve` (key-set assertion: no member, application or date field can ride along); `members` is a count.
  - Privacy of the run: with a fake `db` whose `$queryRaw` throws an error containing a user id, the logged line and the returned
    summary do not contain it (errors are `brief`ed to a fixed message); no `log.*` call receives a string containing any
    fixture `member` value or `completeOn` date.
  - `runForecast` integration: curves are built with the run's `asOf`; a throw in `loadObservationRows` -> status `PARTIAL`, forecasts kept.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/scrape/run-wait-curves.test.ts features/medschools/scrape/run-forecast.test.ts`.
- [ ] **Step 3: Implement.** `buildWaitCurves` groups by `schoolId|program`, maps each row through `observationOf`, counts
      distinct `member` among valid observations, applies the floor, runs `kaplanMeier`, `maxDayOf`. `runWaitCurves` upserts on
      `schoolId_program` and `deleteMany`s the (school, program) pairs that are no longer eligible, in one transaction.
- [ ] **Step 4: Run to pass,** plus the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): aggregate wait curves from sharing members' tracker rows, floor 20 distinct members`.

---

### Task 9: The public forecast endpoint

**Files:**

- Modify: `features/medschools/medschools.contract.ts`, `api/read-schemas.ts`, `api/read.server.ts`,
  `features/medschools/api/read.server.test.ts`, `api/read-routes.server.test.ts`
- Create: `features/medschools/api/medschools.schools.$slug.forecast.server.ts`; regenerate `lib/api/route-table.server.ts`
  (`pnpm api:routes`)

**Interfaces:** produces (client-safe, in the contract file):

```ts
export interface MedSchoolForecastRes {
  program: 'REG' | 'PHD';                         // resolved: ALL -> REG (D12)
  eventType: MedChartedTypeId; cycleYear: number;
  dayZeroOn: string; dayZeroEstimated: boolean; endOn: string;          // YYYY-MM-DD
  /** 'ready' band drawn; 'early' band drawn, wide; 'no-history' observed only; 'no-data' nothing reported; 'pending' not computed yet. */
  status: 'ready' | 'early' | 'no-history' | 'no-data' | 'pending';
  source: MedSourceId | null;
  asOf: string | null;                            // the day the model saw
  observed: { day: number; cumulative: number }[];                       // days since dayZeroOn, through asOf, zero-start is the UI's
  band: { day: number; p10: number; p50: number; p90: number }[];
  summary: { total: { p10: number; p50: number; p90: number }; halfOn: { p10: string; p50: string; p90: string } } | null;
  basis: { cycleYear: number; source: MedSourceId; weight: number }[];   // weight to 2 places
}
export const getMedSchoolForecastApi = endpoint<{
  query: { program?: MedProgramFilter | undefined; type?: MedChartedTypeId | undefined };
  res: MedSchoolForecastRes;
}>()({ method: 'GET', path: '/api/medschools/schools/$slug/forecast' });
// read.server.ts
export function getForecast(slug: string, q: ForecastQuery, now?: Date): Promise<MedSchoolForecastRes | null>;   // null -> 404
```

- [ ] **Step 1: Write the failing tests.**
  - `read.server.test.ts` (fake Prisma, as the history tests): a `MedForecast` FULL row plus counts -> `status 'ready'`, `source`
    from the row, `observed` is the cumulative of the floored primary series through the row's `asOf` (not through today),
    `band` equals the row's curve, `summary.halfOn` are calendar dates (`dayZeroOn + day`), `basis` weights sum to within 0.01 of
    1. `EARLY` -> `'early'`; `NONE` -> `'no-history'` with `band: []`; no row but floored data -> `'pending'` with `observed`
    through yesterday; nothing floored -> `'no-data'` with `observed: []`. `program: 'ALL'` and an absent program both resolve to
    `REG` and the body says so; `PHD` reads the PHD row. The cycle is `siteCycle` (a June 1 rollover with no data is `'no-data'`,
    never last cycle's band). An unknown or inactive slug is `null`.
  - Floor (Review Focus 1): an RMH-only school with an unpublished and a sub-3 cell has `observed: []`; the response never contains
    `contributors`, `publishedCount`, `userId`, `dedupeHash`.
  - `read-routes.server.test.ts`: `GET` is `auth: 'none'`-style user-independent (two requests with different cookies return
    identical bodies), sends `Cache-Control: public, max-age=300, s-maxage=600, stale-while-revalidate=1800`, 404 for a bad slug
    (`SLUG_RE`), 400 for `type=BOGUS`; the key set of the response and of each `band` point is pinned.
  - The registered module: `lib/api/__tests__/route-table.test.ts` stays green after `pnpm api:routes` (one wrapped handler for
    the path and method).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api`.
- [ ] **Step 3: Implement.** `forecastQuery = z.object({ program: program.optional(), type: chartedType.optional() })` (reuse the
      `historyQuery` pieces); `getForecast` reads the school, `siteCycle`, `MedCycle`, the `MedForecast` row (explicit `select`),
      the floored counts for the row's source (or the primary when there is no row) with `floorWhere`, and shapes the DTO;
      `observed` uses `toCumulativeByDay`. The module mirrors `medschools.schools.$slug.history.server.ts` with the cache above.
      Run `pnpm api:routes`.
- [ ] **Step 4: Run to pass,** plus `pnpm api:routes:check` and the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): public forecast endpoint (user-independent, cached, floored observed series)`.

---

### Task 10: Waves in the Activity response and the live feed

**Files:**

- Modify: `medschools.contract.ts` (`MedSchoolActivityRes.waves`, `LiveEventDto.wave`), `api/read.server.ts`
  (`getActivity`, `getLive`), `api/read.server.test.ts`, `api/read-routes.server.test.ts`, `engine/types.test.ts` or the live row
  key-set pins that exist, `testing/integration/medschools-public.test.ts` (key sets; edited in Task 15)

**Interfaces:**

```ts
// contract
export interface WaveDto { date: string; count: number; baseline: number }   // date YYYY-MM-DD (UTC)
// MedSchoolActivityRes gains:  waves: WaveDto[];     // on the INTERVIEW primary series of THIS response's program filter
// LiveEventDto gains:          wave: boolean;        // INTERVIEW rows only; false otherwise
```

- [ ] **Step 1: Write the failing tests** (Review Focus 7): `getActivity` with an INTERVIEW primary series of 2/day for 20 days and
      12 on one day returns `waves: [{ date, count: 12, baseline: 2 }]`; the same shape from a source that is not primary is
      ignored; `waves: []` when there is no INTERVIEW series; the dates are calendar days. `getLive`: an INTERVIEW row at a school
      with a wave on that UTC day has `wave: true`, a SECONDARY row at the same school and day, and an INTERVIEW row on a quiet day,
      have `wave: false`; the extra read is one batched query for the page's schools over the window (assert the fake saw one
      `medCycleCount.findMany` for the whole page, not one per row); a live page with no INTERVIEW rows makes no extra read; the live
      response key set is `{ id, eventType, program, school, occurredAt, source, wave }`. The activity `waves` are floored the same as
      the chart (an RMH-only series with sub-k cells has none).
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement** with `detectWaves` over `toDayCounts` of the already-floored
      primary series (`getActivity` has it in memory: no new read); for the live feed read the school ids' INTERVIEW rows for the
      15 days up to the newest row's day with `floorWhere(now)`, build the primary per school, `detectWaves`, and look the row's
      day up. `engine/stats` is imported only here (server). **Step 4:** run `pnpm exec vitest run features/medschools/api` and
      the `tsc` command; fix every existing pinned key set deliberately (the change is the point).
- [ ] **Step 5: Commit** — `feat(medschools): waves on the Activity response and live rows (more than 3x the trailing median)`.

---

### Task 11: The personal chance endpoint

**Files:**

- Create: `features/medschools/api/chances.server.ts`, `chances.server.test.ts`,
  `features/medschools/api/medschools.me.chances.server.ts`
- Modify: `medschools.contract.ts`, `api/me-schemas.ts`, `api/me-routes.server.test.ts`; `pnpm api:routes`

**Interfaces:**

```ts
// contract (client-safe)
export type ChanceStatus = 'estimate' | 'thin' | 'invited' | 'closed' | 'no-complete' | 'beyond';
export interface ChanceDto {
  applicationId: string;                        // the caller's own
  school: { slug: string; shortName: string; name: string; active: boolean }; program: 'REG' | 'PHD';
  status: ChanceStatus;
  completeOn: string | null;                    // the caller's own date
  invitedOn: string | null;                     // status 'invited'
  asOf: string | null;                          // the curve's day, 'estimate' only
  basis: number | null;                         // members, floored to a multiple of 10, at least 20; 'estimate' only
  points: { on: string; percent: number }[];    // calendar dates, whole percents; 'estimate' only
}
export interface MedChancesRes { cycleYear: number | null; chances: ChanceDto[] }
export const getMedChancesApi = endpoint<{ query: { school?: string | undefined; cycle?: number | undefined }; res: MedChancesRes }>()({
  method: 'GET', path: '/api/medschools/me/chances' });
// chances.server.ts
export function getChances(userId: string, q: { school?: string; cycle?: number }, now?: Date): Promise<MedChancesRes>;
```

Status rules, in order, per application of the caller's cycle (default newest, as `getTracker`): has an `INTERVIEW` milestone ->
`invited` (with `invitedOn`); has `REJECTION`/`WITHDRAWN`/`ACCEPTANCE` and no invite -> `closed`; no `COMPLETE` -> `no-complete`;
school inactive -> omitted from the list; no `MedWaitCurve` row for school x program -> `thin`; `elapsed = today - completeOn` (never
negative); at least one horizon from `CHANCE_HORIZONS` where `inviteChance` is non-null -> `estimate` with those points
(date = today + h, `percent = Math.round(100 * chance)`); none -> `beyond`. `school` filters by slug. `basis = max(20, floor(members /
10) * 10)`.

- [ ] **Step 1: Write the failing tests.**
  - Each status from fixtures: complete 20 days ago + a curve with `maxDay 90` and survival 0.7 at 20 days and 0.5 at 27 -> points
    for h=7 with `percent 29` (1 - 0.5/0.7 = 0.2857); h=60 omitted when beyond `maxDay`; no curve row -> `thin`; the curve's
    `S(elapsed) < 0.02` -> `beyond`; an INTERVIEW milestone -> `invited` with the date and no points; a rejection with no invite ->
    `closed`; no COMPLETE -> `no-complete`; a school with `active: false` is absent.
  - Privacy (Review Focus 6): the response of a caller whose school has a curve contains no key beyond the pinned `ChanceDto`/`MedChancesRes`
    key sets; `basis` is 20 for `members` 20 to 29 and 30 for 30 to 39; the service reads `medWaitCurve` for the caller's school x
    program pairs only (assert the `where`), never `medTrackerMilestone` with a user other than the caller (the in-memory fake records
    every read; assert none outside the caller's cycle ids); another member's application id is not reachable (the service takes no id).
  - Route (`me-routes.server.test.ts`): anonymous -> 401 with no public cache header; signed in -> 200 with no `Cache-Control: public`, no
    `ETag`; `school=BAD SLUG!` -> 400; `cycle` outside the tracker window -> 400 (reuse `cycleYearProblem`); rate limit uses the existing
    `READ_LIMIT`.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/api/chances.server.test.ts features/medschools/api/me-routes.server.test.ts`.
- [ ] **Step 3: Implement** using `getTracker` for the caller's own rows (do not duplicate its reads), `inviteChance`, the
      `medWaitCurve` read with an explicit `select`, and the module in the shape of `medschools.me.tracker.server.ts`. `pnpm api:routes`.
- [ ] **Step 4: Run to pass,** plus `pnpm api:routes:check`, the `tsc` command. Expected: PASS.
- [ ] **Step 5: Commit** — `feat(medschools): personal invite chance from the aggregate wait curve (auth required, never cached)`.

---

### Task 12: The Forecast tab

**Files:**

- Modify: `engine/public-read.ts` (`SchoolTab`, `SCHOOL_TABS = ['activity', 'history', 'forecast', 'interviews']`; remove the "Phase 5
  adds" comment), `medschools.queries.ts` (`forecastQuery(slug, { program, type })`, loader prefetch for `tab === 'forecast'`),
  `ui/SchoolPage.tsx` (label + one switch branch; the `HistoryTab`-style controls row), `engine/search.test.ts`,
  `ui/school-page.test.tsx`, `ui/charts/charts.test.tsx`
- Create: `ui/ForecastTab.tsx`, `ui/charts/ForecastBand.tsx`, `ui/SchoolChances.tsx`

**Interfaces:**

```ts
// charts/ForecastBand.tsx
export function ForecastBand(p: {
  eventType: MedChartedTypeId; sourceName: string; dayZeroOn: string;
  observed: { day: number; cumulative: number }[];
  band: { day: number; p10: number; p50: number; p90: number }[];
  labels: ChartLabels; legendLabels: { observed: string; median: string; range: string };
}): JSX.Element;
// ForecastTab.tsx
export function ForecastTab(p: { slug: string; detail: MedSchoolDetailDto; search: SchoolSearch; setSearch: SetSchoolSearch; programControl: ReactNode }): JSX.Element;
// SchoolChances.tsx   (signed-in only; renders null otherwise)
export function SchoolChances(p: { slug: string }): JSX.Element | null;
```

Chart rules: the observed line is the event type's colour (`CATEGORY_STYLE[eventType]`, solid, 2px); the median is the same colour,
dash `'6 3'`, 2px; the 10th and 90th percentile boundaries are the same colour, 1px, dash `'2 3'`, **no fill, no opacity, no
gradient** (R1); `withZeroStart` on the observed line; x is days since `dayZeroOn` printed as calendar dates
(`formatUtcDay(addUtcDays(dayZeroOn, x))`, never "day N"); y starts at 0 and `niceMax` takes the largest p90; the y scale tweens with
`useTween`; legend `ChartLegend` (three items); probe rows (observed or median, p10, p90) with the date; data table with one row per
7 days plus the last day; `dir="ltr"` through `ChartFrame`; the sources line names the fitted source (`SOURCE_NAMES`) and the
unit is "Reported events".

Tab: category `OptionGroup` (`CHARTED_TYPES`, default INTERVIEW via the existing `type` param) beside `programControl`; under
the chart `t-meta` lines: "Forecast as of {{date}}.", "Based on {{n}} earlier cycles from {{source}}." (one cycle: a second line
"Based on one earlier cycle, so the range is narrower than the real uncertainty."), early: "Early in the cycle, so the range is wide and
rests on the totals of earlier cycles."; a summary block in rows on rules: "Expected total {{p50}} reported {{type}}, likely between
{{p10}} and {{p90}}" and "Half of them by {{date}}, likely between {{from}} and {{to}}"; the program note for `ALL` (D12);
`SkeletonSwap` while loading, `EmptyState` per status (`no-history`: "Earlier cycles do not have enough reported events for a
forecast." and the observed line only; `no-data`; `pending`: "The forecast is computed once a day."). `SchoolChances` renders under
the chart for a signed-in member (reads `chancesQuery({ school: slug })`, signed out or empty renders nothing).

- [ ] **Step 1: Write the failing tests.**
  - `search.test.ts`: `?tab=forecast` parses; an unknown tab falls back to `activity`; `SCHOOL_TABS` order pinned.
  - `charts.test.tsx` (SSR render to string, the style of the existing chart tests): `ForecastBand` markup has the observed path
    with a solid stroke, a `stroke-dasharray` on median and both boundaries, **no `fill` other than `none`, no `fill-opacity`,
    no `opacity` attribute on any path, no `<linearGradient>`**; axis labels are month-day strings (match `/^[A-Z][a-z]{2} \d{1,2}$/`)
    and none contains "day"; the first y tick is `0`; the chart is inside a `dir="ltr"` wrapper; band points that are `[]` render
    the observed line only; an all-empty input renders the `EmptyNote`; the colour is a `var(--site-chart-n)` and the file contains
    no `#` hex and no raw palette class (`ui-rules.test.ts` covers the Steel greps for the new files automatically; keep it green).
  - `school-page.test.tsx`: the tab strip has four tabs in the new order; selecting Forecast writes `?tab=forecast`; with a `ready`
    forecast the page shows the summary rows; per status the empty states; `program=ALL` shows the one-line program note and
    queries `REG`; signed out makes no `me/chances` request (the query is not issued; assert on the fake client); signed in with an
    application renders the chance rows (Task 14 owns their copy; here only that the component mounts).
  - The server render (SSR string of the loaded page) contains the chart `<svg` with scripting off (the loader prefetch ran).
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/engine/search.test.ts features/medschools/ui`.
- [ ] **Step 3: Implement.** `loadSchoolHead` prefetches `forecastQuery(slug, { program: program === 'ALL' ? 'REG' : program, type })`
      for the tab (the same key the component asks for, so there is no second fetch). `ForecastBand` is built from `CycleOverlay`'s
      pieces (`ChartFrame`, `ChartLegend`, `ResponsivePlot`, `YAxis`, `XAxis`, `PlotClip`, `DataTable`, `useTween`, `yTicksTween`,
      `linePath`, `xTicks`, `niceMax`, `withZeroStart`, `plotX`, `plotY`); extend `chartLabels.ts` only if a label is missing.
      Keys: `forecast-title`, `forecast-legend-observed|median|range`, `forecast-total`, `forecast-half`, `forecast-asof`,
      `forecast-basis`, `forecast-basis-one`, `forecast-early`, `forecast-program-note`, `forecast-empty-no-history|no-data|pending`,
      `forecast-load-failed`, `school-tab-forecast`. Run `pnpm i18n:extract`.
- [ ] **Step 4: Run to pass,** plus the `tsc` command and `pnpm exec vitest run features/medschools/ui/ui-rules.test.ts lib/__tests__/steel-flat.test.ts`.
      Rough look: `pnpm dev`, `/rmh-medschool/<slug>?tab=forecast` at 390 and 1280, Day.
- [ ] **Step 5: Commit** — `feat(medschools): Forecast tab with observed line and dashed p10/p50/p90 boundaries`.

---

### Task 13: Wave marks on the Activity chart and the live feed

**Files:**

- Modify: `ui/charts/CategoryLines.tsx`, `ui/charts/DailyBars.tsx`, `ui/ActivityTab.tsx`, `ui/LiveRow.tsx`, `ui/rail/*` (the rail
  renders `LiveRow`; verify it needs no change), `ui/charts/charts.test.tsx`, `ui/pages.test.tsx`
- Create: `ui/WaveNote.tsx`

**Interfaces:** `CategoryLines` and `DailyBars` take `waves?: { date: string; count: number }[]`. `WaveNote({ waves }: { waves: WaveDto[]
}): JSX.Element | null` renders a `t-meta` line.

Mark: a 1px vertical tick at each wave date from the x axis up 8 units, stroke `--site-text-muted`, **no fill**, drawn only while the
INTERVIEW category is switched on (`CategoryLines`) or the chosen type is INTERVIEW (`DailyBars`); a legend entry "Wave" with a tick
swatch; the probe tooltip at a wave date gains a row "Wave: N invites"; `WaveNote` lists the three latest ("Waves: Nov 4 (41 invites),
Oct 28 (37 invites)"), which is also the non-visual reading of the marks. `LiveRow`: when `event.wave` a `t-meta` suffix "Part of a wave"
(no colour, no icon).

- [ ] **Step 1: Write the failing tests:** the tick appears at the right x for a fixture wave and is absent when INTERVIEW is toggled
      off; `waves` empty draws nothing and adds no legend entry; tick markup has `fill="none"` or none, no opacity; `WaveNote` with three
      waves lists them newest first as calendar dates through the page locale; with none renders `null`; `LiveRow` with `wave: true`
      contains the suffix text and `wave: false` does not; the probe row text.
- [ ] **Step 2: Run to verify failure:** `pnpm exec vitest run features/medschools/ui`. **Step 3: Implement**, keys `wave-legend`,
      `wave-probe`, `wave-note`, `live-wave`. **Step 4: Run to pass,** `tsc`, `pnpm i18n:extract`.
- [ ] **Step 5: Commit** — `feat(medschools): mark waves on the Activity chart and the live feed`.

---

### Task 14: Personal chance on the tracker, and the sharing copy

**Files:**

- Create: `ui/tracker/ChanceLine.tsx`
- Modify: `medschools.queries.ts` (`chancesQuery`, key under `ME_KEY`), `ui/SchoolChances.tsx` (fill in the rows),
  `ui/tracker/ApplicationRow.tsx`, `ui/tracker/SharingRow.tsx`, `ui/tracker/tracker-page.test.tsx`, `ui/lists`/`SaveToList` untouched

**Interfaces:**

```ts
export const chancesQuery: (q?: { school?: string; cycle?: number }) => QueryOptions<MedChancesRes>;   // ['medschools','me','chances', q]
export function ChanceLine(p: { chance: ChanceDto | undefined }): JSX.Element | null;                  // one application's rows
```

Copy, by status (all `t-meta` lines, rows on a rule, calendar dates through the locale, no exclamation marks, never "day N"):
`estimate` -> "If you have not heard by today, the chance of an interview invite is {{percent}}% by {{date}}" per point, then "Estimate
as of {{date}}, from at least {{n}} members' applications at this school."; `thin` -> "Not enough data yet for an estimate here. It
needs at least 20 members at this school."; `no-complete` -> "Add the date your application was complete to see an estimate.";
`invited` -> "Invited on {{date}}."; `beyond` -> "Too few comparable applications are still waiting at this point for an estimate."; `closed`
renders nothing. `SharingRow` gains **one new t-meta line** (new key `share-wait-note`, the shipped `share-explanation` is not reworded):
"When sharing is on, the time between your complete date and an invite also feeds an estimate shown for this school once at least 20
members contribute. Only the estimate is shown, never a date or a row." (The wording is the owner's to confirm: see the owner list.)

- [ ] **Step 1: Write the failing tests:** `tracker-page.test.tsx`: the tracker query and the chances query are both issued; an
      application with `estimate` shows a row per point with the formatted percent and date and the basis line; each other status shows
      its line and `closed` shows nothing; chances for a cycle with no applications are not requested; a failed chances request leaves
      the tracker intact (no error banner, no line); a 401 on chances after load behaves like the existing session-expiry path; the
      sharing row shows the new line both when sharing is on and off; mutating a milestone invalidates `['medschools','me']` so the line
      refreshes. `SchoolChances` renders only for applications of that school (any program), the estimate rows as above, and nothing for
      a signed-out viewer or a member with no application there.
- [ ] **Step 2: Run to verify failure.** **Step 3: Implement**, keys `chance-estimate`, `chance-basis`, `chance-thin`,
      `chance-no-complete`, `chance-invited`, `chance-beyond`, `share-wait-note`; `pnpm i18n:extract`.
      **Step 4: Run to pass,** `tsc`, `pnpm exec vitest run features/medschools/ui/ui-rules.test.ts`.
- [ ] **Step 5: Commit** — `feat(medschools): personal invite chance on the tracker and the Forecast tab`.

---

### Task 15: Black-box tests, seeded visual pass

**Files:**

- Modify: `testing/integration/medschools-public.test.ts`, `testing/integration/medschools-private.test.ts`,
  `testing/integration/lib/medschools-fixture.ts`, `scripts/medschools/seed-visual.ts`, `scripts/medschools/visual-check.mjs`,
  `.github/workflows/web-ci.yml` (only if the integration job lists files)

- [ ] **Step 1: Public black box** (fixture school and rows written by the test itself; CI's database is empty): the live key set now
      includes `wave`; the Activity key set includes `waves`; `GET …/forecast` for the fixture school has the pinned key set, a
      `pending` status before a forecast row exists, `ready` after `runForecast` is run directly (as the private test runs
      `runRmhPublish`), the band's first point equals the last observed value, and the body contains no `contributors`,
      `publishedCount`, `userId`, `dedupeHash` and no RMH figure while the fixture RMH cells sit below 3 published contributors; the
      same URL fetched with a session cookie and without is byte-identical; an unknown slug and an inactive slug are 404; `?tab=forecast`
      server HTML contains the chart `<svg` and the legend text with scripting off.
- [ ] **Step 2: Private black box** (alice, bob, carol plus 17 more fixture members created through the fixture helper, all with `shareAnonymously`
      on and a `COMPLETE` date at the fixture school, some with invites): after `runForecast` with 19 sharing members `GET
      /api/medschools/me/chances` answers `thin` for the 20th-member candidate, with the 20th it answers `estimate` with percents in
      0..100, non-decreasing in the horizon, `basis` 20; turning one member's sharing off and re-running drops it to `thin`; anonymous
      is 401 and no response has a public cache header; bob's response never contains alice's dates (assert alice's `completeOn` is
      absent from bob's body when they differ); the stored `med_wait_curve` row has no column that could hold a user and its `curve`
      has only `t` and `s`; the response key set is pinned.
- [ ] **Step 3: Seed and visual:** `seed-visual.ts` writes FIXTURE history cycles, a current cycle at about 40% share, one wave day,
      20 sharing members' rows and runs the forecast and curves functions (scratch DB only; the script's refusal rule stays).
      `visual-check.mjs` adds the Forecast tab (FULL, EARLY, NONE, pending), the Activity tab with a wave tick, the live page with a "Part of a
      wave" row, and the tracker with an estimate and a thin line at 320x568, 390x844, 844x390, 768x1024, 1024x600, 1280x800, 1920x1080,
      2560x1080 in Day and Night plus `ar` at 390 and 1280; it asserts no sideways scroll, chart text at least 11 px below 1024, 44 px
      controls on touch, `dir=rtl` in `ar`, and that the forecast chart's SVG has no element with `fill-opacity` or a gradient. Remember the
      account edition note in `features/medschools/CLAUDE.md` (set the appearance through `PUT /api/preferences/appearance` before the Night pass).
- [ ] **Step 4: Run:** `pnpm exec vitest run features/medschools server/medschools-worker`, then the integration suite as phase 4 Task 13 did
      (`pnpm test:integration` against a throwaway Postgres with `MEDSCHOOLS_DEDUPE_SECRET` set), then the visual script against `pnpm dev`
      with the scratch seed. Expected: PASS; screenshots read by eye in both editions (a green gate is not "looks right").
- [ ] **Step 5: Commit** — `test(medschools): forecast and chance black-box tests, seeded visual pass for phase 5`.

---

### Task 16: Budget, docs, final gate

**Files:**

- Modify: `scripts/check-bundle-budget.ts` (only as measured), `features/medschools/CLAUDE.md`, `server/CLAUDE.md` (confirm Task 7's
  paragraph), `docs/plans/2026-11-11-steel-design-implementation.md` §18 (the D13 row: one sentence naming the Forecast tab and
  chance rows; **not answered**), `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md` §14 (phase 5 status line),
  `docs/_generated/facts.json`, `locales/en/medschools.json`

- [ ] **Step 1: Measure** as phase 4 Task 14: baseline on `main` in a second worktree (`pnpm build:frontend`, `pnpm exec tsx
      scripts/check-bundle-budget.ts --json`), then the branch (`pnpm build:frontend:sourcemap`, same command,
      `pnpm exec tsx scripts/check-entry-composition.ts --strict`). Record `siteCssBrotli`, `entryRaw`, `criticalPathRaw`,
      `criticalPathBrotli` and the delta. Expect no entry growth (nothing new in a route file; `engine/stats` is not in the client
      graph, which `stats-boundary.test.ts` holds).
- [ ] **Step 2:** Replace arbitrary-value utilities with existing classes if the site CSS grew; raise a budget line only by the measured
      remainder with a dated comment in the existing form; change nothing if nothing exceeds.
- [ ] **Step 3: Docs.** `features/medschools/CLAUDE.md`: replace "Adding the Forecast tab (phase 5)" (its "needs no other change" is wrong:
      `SchoolPage` has a switch) with a "Statistics, the Forecast tab and the personal chance (phase 5)" section: the model in D3/D4 with
      its constants, "fitted per program to the primary series, never summed", the shared `engine/floor.ts`, the job and its queue, the
      `MedForecast`/`MedWaitCurve` tables and why `MedWaitCurve` is worker-precomputed (D7), the opt-in basis and the 20-distinct-member floor
      (D5, D6), why per-event sources do not enter (D9), waves (D10), the endpoint list (`forecast`, `me/chances`), and update "What is
      public" (the endpoint count is now seven, `SCHOOL_TABS` has four). Spec §14: a phase 5 status line with the decisions. Run
      `pnpm i18n:extract` and check `locales/en/medschools.json` gained every `forecast-`, `wave-`, `chance-`, `share-wait-` key and kept the
      earlier ones; `pnpm facts:generate`.
- [ ] **Step 4: Final gate.** `pnpm check:consistency --base main`, `pnpm test`, the `tsc` command above, `pnpm lint`,
      `pnpm exec tsx scripts/check-bundle-budget.ts`, `pnpm exec tsx scripts/check-entry-composition.ts --strict`, `pnpm api:routes:check`,
      `pnpm images:variants:check`. Expected: all green, no new warnings.
- [ ] **Step 5: PR lines:** the migration (two tables, additive), the new queue and cron, `MEDSCHOOLS_FORECAST_CRON`, "no AI call, no new
      dependency", the live row and Activity response gained a field, the sharing switch gained one line of copy, budget (if raised).
- [ ] **Step 6: Commit** — `docs(medschools): phase 5 documentation, budget record and the Steel gap note`.

---

## Self-review (against the spec; fixes applied above)

- **Spec coverage:** §10 historical share curves, current forecast (implied-total paths, recency, Poisson, p10/p50/p90, early fallback
  at 5%), KM complete-to-invite censored at no invite, waves (3x trailing 14-day median), pure TS in `engine/stats/` with fixed
  fixtures, no stats library -> Tasks 2-5; "forecasts fitted to the primary series, never summing" -> D2, D3, Task 6, 7; §7 `MedForecast` ->
  Task 1; §8 `medschools.forecast` daily 06:40 -> Task 7; §11 Forecast tab, dashed band boundaries, tracker "my conditional chances" -> Tasks
  12, 14; §6 floor and anonymization -> D1, D6, D7, Tasks 6, 8, 11, 15; §14 item 5 -> all; the brief's waves on the Activity chart and the live feed ->
  Tasks 10, 13; phase 4 Q7/open question 7 -> D5, D6, Task 8.
- **Brief items:** pure engine; per-program primary fit; `MedForecast` additive migration; guarded job registered like the others with
  expiry = max runtime, timekeeper cron, persisted interval; no AI; tab via `SCHOOL_TABS` + the switch in `SchoolPage`; public cacheable user-independent
  endpoint through a contract + `implement()` + registered module; charts reuse `ui/charts/*`, tokens, tween, dates, zero start, dashed bands, no "day N";
  personal chance under `me/**` with the >=20 floor and "too thin"; worker-precomputed aggregate, justified (D7); i18n, Steel, both editions, 390/1280/`ar`,
  integration tests, commit gate, the `tsc` command.
- **Step scan:** code appears as signatures and the Prisma shapes; the model is fixed by D3/D4 and its tests, not transcribed. Every constant is in
  `constants.ts` once.
- **Type consistency:** `DayCount` (Task 2) is what `forecastCycle` (3), `detectWaves` (5) and `toDayCounts` (6) use; `SurvivalCurve` (4) is the
  stored `{ t, s }` (8) and what `getChances` reads (11); `MedSchoolForecastRes` (9) is what `ForecastBand`/`ForecastTab` read (12);
  `WaveDto` (10) is what `WaveNote` and the chart marks read (13); `ChanceDto` (11) is what `ChanceLine`/`SchoolChances` read (14).
- **Gaps found and flagged, not resolved:** see "For the owner".

## Facts an implementer must verify (do not assume)

1. **Column names in the raw SQL.** `run-rmh-publish.ts` quotes camelCase columns on `med_cycle_count`; confirm the same for
   `med_tracker_*` in `prisma/migrations/*phase4*` before writing `loadObservationRows`, and that `MedMilestoneType` casts as
   `'COMPLETE'::"MedMilestoneType"`.
2. **`MedPrisma` can express the job's reads** (`findFirst` with `orderBy`/`select`, `findMany` with `select`) or extend the structural type and
   its in-memory fake (`features/medschools/scrape/types.ts`, the fakes under `scrape/*.test.ts`); extend the fake, do not cast around it.
3. **`siteCycle` for a school with no data this cycle:** it returns the site cycle, so the Forecast response is `no-data` with that cycle's
   `dayZeroOn`, matching what the Activity tab shows.
4. **`useTween` rAF allowlist** (`lib/__tests__/raf-loop-allowlist.test.ts`) covers `ForecastBand` because it calls the hook and adds no frame loop
   of its own; confirm no new file needs an entry.
5. **`lib/api/route-table.server.ts` is regenerated** (`pnpm api:routes`) and `$.ts` serves both new modules; check the static `.../forecast` path
   does not shadow or get shadowed by `schools/$slug` siblings (`route-table.test.ts` holds it).
6. **`MedRunStatus` has `PARTIAL`** (yes) and `closeStaleRuns(prisma, 'RMH', 'forecast', …)` is keyed by the job name so it never closes the
   publish job's rows.
7. **Existing pinned key sets** for activity and live (`read.server.test.ts`, `read-routes.server.test.ts`, `testing/integration/medschools-public.test.ts`,
   `engine/types.test.ts`) change on purpose in Task 10; update each, do not loosen them.
8. **The in-memory fake of the tracker service** supports the flat reads `getChances` makes; do not use a nested relation filter (the phase 4 note in
   `tracker.server.ts`).

## Rulings (facilitator, 2026-11-23, owner-overridable; these override task text)

The owner asked for the remaining phases to be completed without stopping, so each open point is settled with the privacy-safe,
smaller option and recorded for override.

- **R1 The wait curve counts only members who share.** Rows count only when the cycle's `shareAnonymously` is true. Spec §6: "First-party data
  contributes to public aggregates only if the user opted in, and only through aggregates"; phase 4's sharing switch is that opt-in, and its
  7-day account-age rule already guards it. A non-sharer's private rows therefore never feed anything. The switch's copy gets one new line
  (Task 14) because the shipped copy says complete dates are never shared, which stays true of events but not of this aggregate.
- **R2 Every signed-in member sees the chance, sharer or not.** Reciprocity would turn privacy into a paywall and leak who shares; the
  curve is an aggregate over >= 20 others, and the member's own rows are used locally for "none by today".
- **R3 Per-event sources are not used in the curve** (D9): none carries a complete date, and joining events to people is exactly what §6 forbids.
- **R4 The floor counts distinct members, 20, on the worker's snapshot** (D6, D7). The shown basis is rounded down to a multiple of 10 so the
  published number does not reveal each new member.
- **R5 REG is shown when the program filter is ALL** (D12). The spec fits per program and never sums; a third "ALL" fit would be a sum in
  effect, and PHD seldom has history (>= 10 events in a past cycle).
- **R6 `asOf` is yesterday UTC** (D3): today is partial for every source, and a partial day would bias the share downward and the total upward.
- **R7 Waves need at least 5 invites** (D10): the bare "3x the median" fires on the first invite of a quiet school; the spec's rule is kept as the
  main test and the floor is the only addition. Today's partial count is included so a live wave can show during the day.
- **R8 The ledger uses source `RMH`** for `medschools.forecast` (as `rmh-publish` does): adding a `MedSource` value would break every exhaustive
  source map and read as a data source.
- **R9 Rows for finished cycles are kept** (D11), so a later phase can score forecasts against outcomes without a new table.
- **R10 The 180-day cap and the horizons 7, 14, 30, 60** (D5, D8): admissions waits beyond six months are not a "chance by date" a member can act
  on; the cap keeps the curve small and the tail honest.
- **R11 One earlier cycle is enough to forecast, with a warning:** a one-cycle fit is shown with a "narrower than the real uncertainty" note rather than hidden, because a
  school's second year of data is the common case in this product's first season.
- **R12 No MDApplicants adapter is written** for "depth": the enum exists but nothing stores it; the loader accepts it generically (share shape
  only, >= 30 reports) so adding the source later changes no forecast code.

## For the owner (short; the plan does the listed thing meanwhile)

1. **Opt-in basis and copy (R1).** Is "sharing on" the right consent for feeding the aggregate wait curve, and is the one new line on the sharing
   switch acceptable? Alternative: all tracker rows count (more data sooner, but non-sharers' dates feed an aggregate, against §6's opt-in sentence).
   Meanwhile: sharing members only, with the line.
2. **Floor shape.** 20 distinct members per school x program (D6). Raise it, or add a minimum number of invites in the 20, so a curve that is a
   flat 100% "not invited" line is not shown? Meanwhile: 20 distinct members only, as the spec says.
3. **Forecast for "All programs" (R5).** Show REG with a note, as built, or add a summed ALL fit?
4. **Wave floor (R7).** Keep the minimum of 5 invites, or the bare 3x rule?
5. **Wave on the live feed.** It adds a field to the live row (`wave`); acceptable for the public key set, or a separate "waves today" strip instead?
6. **Steel §18.** D10 (charts and data tables) and D13 (RMH Med Schools gap) are touched, not answered.
