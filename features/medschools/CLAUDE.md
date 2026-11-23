# features/medschools — RMH Med Schools

> Scope: `features/medschools/`. Repo-wide context: [`/CLAUDE.md`](../../CLAUDE.md), [`../CLAUDE.md`](../CLAUDE.md).
> Spec: `docs/superpowers/specs/2026-11-20-rmh-med-schools-design.md`. Phase 3 plan:
> `docs/superpowers/plans/2026-11-22-rmh-medschool-phase3-public-pages.md` (its "Owner revisions" O1-O6 override its
> tasks).

Anonymized US MD and DO admissions-cycle data: counts and reported events, never people. A worker (phases 1-2b, in
`server/medschools-worker/`, code in `scrape/`) collects it from CycleTrack, Admit.org and Student Doctor Network; the
public pages (phase 3) read it.

## What is public (phase 3)

Signed-out readable, in the `_site` shell (Steel), not a full-screen app:

| Route                  | Page                                                                    |
| ---------------------- | ----------------------------------------------------------------------- |
| `/rmh-medschool`       | School index (rows on rules) with search, degree, state and program     |
| `/rmh-medschool/live`  | Live feed of recent reported events, 60 s refetch, "show older" paging  |
| `/rmh-medschool/$slug` | One school: Activity, History, Forecast, Interviews tabs (`?tab=`, `?program=` …) |

Eight anonymous `GET` endpoints (`api/medschools.*.server.ts`, registered `apiRoute` modules, `auth: 'optional'`, read
rate limit, public cache): `schools`, `schools/$slug`, `schools/$slug/activity`, `schools/$slug/history`,
`schools/$slug/arrivals`, `schools/$slug/forecast` (phase 5), `live`, `today`. Contracts live in `medschools.contract.ts`; loaders in `api/read.server.ts`; query factories in
`medschools.queries.ts` (no `createServerFn`). Route loaders seed React Query with `contractQuery`, so the charts exist
in the server HTML with scripting off.

**The public endpoints stay user-independent (phase 4).** Nothing under `/api/medschools/schools*` or `live` reads a
session, a preference or a list; a signed-in member's preferences are applied in the route loader, which prefetches the
same public queries with explicit parameters, so the public cache keys and bodies are what any anonymous caller can type
(`medschools-private.test.ts` holds that a session changes no public byte). `me/ask` is the exception that is personal
but not an aggregate of tracker rows: see "AI Q&A (phase 6)".

**Placement (owner O1):** listed in the Services hub (`app/routes/_site/services/index.tsx`) and site search
(`lib/search/catalog.ts`), **not** in the games/apps catalog. There is no `catalog.ts`, no card art, no image manifest
row; the manifest has `catalog` unset and `listed: false`; `ui/ui-rules.test.ts` pins this. `/rmh-medschool` and
`/rmh-medschool/live` are `STATIC_ROUTES` in `lib/sitemap.ts`; school pages are the `medschools` sitemap chunk.

## The read rules (`engine/public-read.ts`, pure and client-safe)

- **k floor (spec §6):** `K_FLOOR = 3`. RMH tracker count rows are dropped when `contributors` is null or under 3 (fail
  closed); other sources show as published (their `contributors` is null today). An in-state/out-of-state split is
  returned only when both sides are at least 3; `MedSchoolStats` rows with `residence != GLOBAL` follow the same floor.
  The live feed excludes `source = RMH` entirely. **Tracker figures update once a day (phase 4, Q2):** a public read of
  an RMH row uses `publishedCount` / `publishedContributors` only (`publicCell` in `engine/public-read.ts`, `floorWhere`
  and `publicSum` in `api/read.server.ts`); null published (never published) means absent, and the k floor applies to
  `publishedContributors`. The live `count` / `contributors` follow the tracker and are never public. The daily job
  `medschools.rmh-publish` (00:05 UTC, `scrape/run-rmh-publish.ts`, an exclusive pg-boss queue in
  `server/medschools-worker/`, last run persisted in `MedSourceRun`) copies live to published for every RMH row in one
  statement and deletes rows whose live count is 0 (the writer keeps those at 0 so a cell never vanishes mid-day). Why:
  a back-dated milestone changes a PAST cell, so a date hold-back alone would reveal who just shared. Cells dated today
  (UTC) or later are still dropped (`applyKFloor`, `floorWhere(now)`). **Turning sharing off (or deleting a milestone)
  removes the event at once but leaves the public totals until the next daily update.** The share-sync reconcile never
  writes `published*`; only the job does.
- **What the anonymity claim is:** the public pages and the `med_cycle_event` / `med_cycle_count` tables alone link to
  no one (random UUID ids, a hash recomputed from the server secret, `ingestedAt = occurredAt`). Someone with access to
  the database can still match shared figures against the private tracker tables in the same database. Do not write it
  stronger than that.
- **Never sum sources (spec §10):** the primary series per school x program x cycle x event type is the first present
  source in `PRIMARY_ORDER` (CycleTrack, Admit, SDN, RMH, MDApplicants), after the floor. Others are comparison series.
  Every chart says "Reported events" and names its sources; reported events are never called applicants.
- **Programs (O5):** `ProgramFilter` is `ALL | REG | PHD`; "All" sums REG + PHD **within one source** per day. A school
  shows only its own degree's options (an MD school never offers DO). Null-program events are in no series, total or
  chart: a muted line counts them, the live feed labels them "Program not reported".
- **Explicit `select` on every Prisma read.** `inState`, `dedupeHash`, `ingestedAt` and `MedSdnThread.cursorPostHash`
  are never selected; attribution links point at a school page or a thread, never a post. A live row is
  `{ id, eventType, program, school, occurredAt (minute), source }`; the key set is pinned by the black-box test.
- **Dates are UTC calendar days** (`@db.Date`); format with `formatUtcDay`, never the viewer's zone.
- **Source attribution (O3):** "Source: CycleTrack", "Source: Admit.org", "Source: Student Doctor Network", each linking
  to the school's page on that source where a URL is known (`api/source-links.ts`, names in `SOURCE_NAMES`).

## Charts (`engine/chart-geometry.ts`, `ui/charts/`)

React SVG, server-rendered (the charts are in the HTML with scripting off). **Owner O7 (2026-11-23)** supersedes O2's
ink-only style for these pages; Steel §18 D13 carries the note, and D10 stays open for the rest of the site.

- **Colour (O7.1).** `--site-chart-1`..`-5` in `app/globals/tokens-themes.css` (Day and Night, exact values pinned in
  `lib/__tests__/steel-tokens.test.ts`, which also holds that only this feature reads them). The slots are the first
  five of the dataviz skill's reference palette, validated with its `validate_palette.js` against `--site-surface` (the
  chart card) in each edition: adjacent CVD 9.1 Day / 8.4 Night, normal-vision 19.6 / 19.3; all five are at least 3:1 in
  Night, and three (aqua, yellow, magenta) are 2.2-2.8:1 in Day, which the relief rule allows because every chart has a
  legend, a dash cue and a data table. The mappings are fixed in `ui/charts/chartColors.ts` and never depend on rank or
  on what is switched on: Interview 1 (blue), Rejection 2, Acceptance 3, Secondary 4, Waitlist 5; sources (per-type
  charts) CycleTrack 1, Admit 2, SDN 3, RMH 4, MDApplicants 5; History cycles newest first 1..5. A component writes
  `var(--site-chart-n)` through those maps, never a hex or a raw palette class. Dash and weight stay as the secondary
  cue. Text is always `--site-text` / `--site-text-muted`, never a series colour. A bought theme does not restyle the
  chart tokens (they follow the edition).
- **Card and legend (O7.2).** `ChartFrame` is a card: `--site-surface`, 1px `--site-border`, `rounded-site`, `p-3`
  (phone) / `sm:p-4`; caption, legend, plot, native `<details>` table. A legend (`ChartLegend`: a line swatch per
  series) is present for two or more series; the Activity category legend IS the toggle row (`CategoryToggles` passed as
  `legend`: aria-pressed buttons in a `role="group"`, each with its swatch, the swatch dimmed when off, at least one
  stays on). There are no end labels. The daily bars are one series, named by the title and the sources line.
- **Tween (O7.3).** `tween.ts` (pure, injected scheduler) and `useTween.ts`: the y scale moves from the old to the new
  top in 280 ms, ease-out (`easeOutCubic`), when a toggle, program or source changes it. Lines, bars and gridlines
  follow the animated scale (`yTicksTween`: shared ticks stay, new ones fade in, old ones fade out); an interrupted
  tween continues from where it is drawn. The server render and first client render return the target as is, one frame
  is requested at a time and the last requests none (the `useTween.ts` entry in
  `lib/__tests__/raf-loop-allowlist.test.ts`), and `prefers-reduced-motion: reduce` makes it instant, which is M7's rule
  applied to this tween and nothing more. A clip keeps a mid-tween line inside the plot.
- **Zero start (O7.4).** `withZeroStart` prepends a 0 at the cycle's first day (or the first report, if earlier) to
  every cumulative series, History included.
- **Probe (O7.5).** Hover, touch or focus on the plot (`ResponsivePlot` in `ChartFrame.tsx`): a crosshair at the nearest
  stop (`nearestIndex`), a dot per series, and a tooltip with the date and each visible series' value and swatch on
  `surface-overlay` (it flips and stays inside the card). The plot is a focusable `role="group"` named by the summary;
  Left/Right (and Home, End, PageUp, PageDown, Escape) move the crosshair, and the tooltip is a `role="status"` while
  the keys drive it. Touch scrubs horizontally (`touch-pan-y`) and a tap outside clears it.
- **Dates (O7.6).** History aligns cycles by calendar: `calendarX` maps a date to days after June 1 on a reference
  calendar (so Jun 1 of every cycle is x 0, equal month-days agree across leap years, earlier days are negative), the
  axis prints "Jun 1", "Aug 15" (no year), and a series is named by its cycle ("2026\u20132027").
  `HistoryCycleDto.dayZeroOn` carries each cycle's own day zero. There is no "days since cycle start" anywhere.
- **Button groups (O7.7).** `OptionGroup` is a single-select `role="radiogroup"` of `role="radio"` buttons (roving
  tabindex, arrows move and select and wrap, left and right swap in RTL, wraps on a phone, `Button` styles so 44px on
  touch): Activity's category, History's category and source. It filters, it does not navigate, so it is not `Tabs`;
  `design-consistency.test.ts` did not need to change for it. `ProgramToggles` is the school page's program control, a
  multi-select pair for the school's own degree; the URL param stays `ALL | REG | PHD`. `ProgramSelect` and
  `DegreeProgramSelect` remain for the index and live pages.

The first Activity chart is `CategoryLines` with `CategoryToggles` (O4: `?show=`); then `DailyBars` for one chosen type
(in that type's colour), `CumulativeLine` (per-source colours), then a native `<details>` table. Each chart is wrapped
in `dir="ltr"` so the time axis stays left to right in `ar`. Each width gets its own viewBox (phone 252, mid 420, wide
640 units: the phone one is sized so a 320 px phone shows it at about 1:1 inside the card), all rendered, CSS shows one.

**d3 containment:** only `engine/chart-geometry.ts` imports `d3-scale` / `d3-shape`; only `ui/charts/*` imports that;
only page components import `ui/charts`. Route files must not (`ui-rules.test.ts`), so d3, zod and the charts stay in
the lazy page chunk. `scripts/check-entry-composition.ts --strict` has tripwires for both; `validateSearch` is
hand-rolled (`engine/search.ts`) because zod is forbidden in the entry.

## School crests

`public/images/medschools/crests/<slug>.webp` (96x96) are downloaded once from Admit's `crest_url` by
`scripts/medschools/fetch-admit-crests.ts` (`scrape/crests.ts`), committed as static files and listed in
`data/medschools/crests.json`. The site never calls Admit for an image at request time. `engine/crests.ts` looks one up;
`ui/SchoolCrest.tsx` draws it (a school with no crest draws nothing).

## Ingest changes that affect what the pages show

- **SDN timing (13aca4241):** an SDN event reported the day it was posted ("got an II today") takes the post's own
  timestamp, so the live feed's "time ago" is the post time. An earlier stated date stays a calendar day (UTC midnight).
  Dedupe and count cells still key on the day.
- **SDN dedupe (f576b1169):** one SDN member counts once per event type per school per cycle: events key on
  `hash(author:<member>:<school>:<cycle>:<type>)`, the member id read from the post header and hashed with the dedupe
  secret inside the `eventKey` closure, so nothing person-shaped crosses the adapter boundary. The first report wins.
  Posts with no member id keep the per-post key.
- **Admit member dedupe and the whole-cycle backfill (owner 2026-11-23).** The live feed is only ~6 h deep, so Admit
  data was thin. Every Admit event now keys on `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<eventType>)` (the
  dedupe secret, inside a closure in `adapters/admit/client.ts`; the id never leaves the adapter and is never stored),
  so one member counts once per type per school per cycle whichever path saw it first: the live feed or the
  profile-history backfill (`scrape/run-admit-history.ts`, queue `medschools.admit-history`). A feed row with no author
  keeps the per-update key. **First report wins, earliest day kept** (`scrape/admit-events.ts`, `replacesTime`): when a later
  sighting of an existing key falls on an earlier calendar day (UTC), the stored date moves back; a smaller timestamp
  on the same day never does (a profile-history date is day-only, stored at UTC midnight by the adapter, and must not
  displace an exact live-feed time; on the same day an exact time replaces a midnight). Arrivals leave out ADMIT and
  SDN events stored at exactly 00:00 UTC (day-only), so the live feed's own exact times still count. When it moves, the roll-up re-rolls both days; the
  roll-up now deletes a cell whose events are gone, so a moved event is never counted on two days (the key holds the
  cycle year, so a move never changes cycle). A stored event with no program takes the program a later sighting
  resolved. The history job discovers members from `getAllCycleResults` (each status filter, paged, user id only),
  fetches each unseen member's profile (`md_phd` plus the history's school slug and secondary/interview/decision dates,
  nothing else), maps every entry to an event (SECONDARY, INTERVIEW, and the decision as
  ACCEPTANCE/WAITLIST/REJECTION/WITHDRAWN/HOLD; a decision with no date or an unknown decision is counted, never
  guessed) with `cycleYearOf` and the alias matching, and rolls up. The live feed ingests the history of any member it
  meets for the first time from the lookup it already made. Progress is `MedAdmitMember` (a keyed hash of the member id,
  a different HMAC input from any event key, plus DONE/FAILED and attempts; pruned after 400 days); the raw id lives in
  memory for one run, discovery is repeated each run, and DONE members are skipped, so a deploy resumes. Three failed
  lookups park a member for a week.
- **One-time ADMIT re-key (`scrape/admit-rekey.ts`).** Old ADMIT rows used the per-update key and would be recounted by
  the backfill. Before the first live write under the new key and before the first history run, `ensureAdmitRekey`
  deletes every ADMIT `MedCycleEvent` and ADMIT `MedCycleCount` cell (an ADMIT cell holds nothing but its events) and, in the same
  transaction, every `MedAdmitMember` progress row and `MedAdmitForumThread` cursor (progress that says "already read"
  would otherwise stop the events refilling: a DONE member is never re-fetched, a caught-up thread never re-read), and
  records a `MedSourceRun` (job `admit-rekey`, status OK) as the done flag, inside that transaction too. At most once; a failed attempt is retried
  and the Admit event jobs write nothing until it succeeds. Mention it in the PR text: public Admit series are empty
  until the feed and the backfill refill them (the first history run is queued at worker start).
- **Politeness budgets (owner 2026-11-23).** The history job uses `backfillSpacingMs` 3 s plus 0-1 s random jitter
  (`createPoliteHost` takes `jitterMs`; live sessions keep their spacing); the SDN forums host is 3 s plus jitter for
  every session. Every host has a persisted DAILY request budget (`scrape/request-budget.ts`, `MedRequestBudget`, UTC
  day, retries and robots.txt included) shared by all its jobs; spent budget halts the session (`BudgetExhaustedError`)
  and the job ends PARTIAL until the next UTC day. The history job also has its own daily quota of profile lookups
  (default 600). Env overrides are in `.env.example`.
- **Admit school forums (owner 2026-11-23, `scrape/run-admit-forums.ts`, queue `medschools.admit-forums`, every 3
  hours).** From June 1 through August 31 the run lists and reads the previous cycle's threads too (`forumYearsFor`:
  decisions roll over only on September 1), inside the same per-run request cap. Admit's school forums are a native
  thread per school per cycle (GraphQL `getAllSchoolThreads` and
  `getSchoolThread`, oldest first; findings in the endpoint inventory). The job lists every thread's post count (three
  requests), and reads a thread only from its persisted cursor (`MedAdmitForumThread`: `cursorOffset` plus a keyed hash
  of the last post, read one post early as an anchor; no text, author or id stored). Rules a reader of the data depends
  on: (1) a post mirrored from SDN is skipped (`isSdnMirror` in `adapters/admit/forum.ts`; Admit has no source field, so
  it is a fail-closed content-and-shape check) because SDN already counts it; (2) a native post's events key on
  `hash(admit:author:<user id>:<schoolId>:<cycleYear>:<type>)`, built by `adapters/admit/member-key.ts` which the feed
  and the history now share, so one member counts once per type per school per cycle across the tracker, the history and
  the forum (the writer is `admit-events.ts`: first report wins, earliest date kept, a known program is kept); a post
  with no author id (anonymous, deleted) falls back to a per-post key; (3) program is the SDN text rule (MD unless the
  post says MD-PhD), no profile lookup per author; (4) the model runs off-peak only: at peak the run lists the threads
  and persists their counts (the count past the cursor is the held state, nothing is stored or fetched twice) and the
  next off-peak run reads them; (5) its own AI share (`admit-forums-budget.ts`, label `medschools-extract:admit-forums`,
  default 40% of `MEDSCHOOLS_AI_MONTHLY_USD`); (6) the Admit host budget default is now 3500 (the forums add a 600/day
  quota of their own). Tests: `forum.test.ts` (the adapter boundary), `run-admit-forums.test.ts` (hostile fixtures:
  names, ids, SDN mirrors, quotes, injection), `admit-forums-budget.test.ts`.
- The SDN live queue runs daily (SDN forum activity is slow); AI extraction is capped monthly. Detail:
  `server/CLAUDE.md`.

## Statistics, the Forecast tab and the personal chance (phase 5)

Model and privacy first, then the UI. The plan's decision numbers (D1-D12) and rulings (R1-R12) are in
`docs/superpowers/plans/2026-11-23-rmh-medschool-phase5-forecast.md`.

- **One floor.** `engine/floor.ts` (`floorWhere`, `publicSum`; pure, no Prisma) is the only definition of what is public;
  the readers and the forecast job both import it, and `run-forecast.ts` is pinned to read counts only through it. A band
  fitted on a looser floor would publish an unpublished or sub-k RMH figure.
- **The model (D3, D4; `engine/stats/`, pure, server-side only; `stats-boundary.test.ts` keeps it out of the client
  graph).** Fitted **per program to the primary series, never summed** (REG and PHD; `ALL` on the page reads REG, D12).
  Day `d` is days since the cycle's `dayZeroOn`; the fit sees counts through yesterday UTC (`asOf`, a partial day biases
  the share down). For up to 4 earlier cycles of the same source with a season total of at least 10, the share of the
  season reported by day `d` is weighted `0.5^k` (newest first, renormalised). FULL (weighted share at `asOf` at least
  0.05): the implied total is the count so far over that share; 600 draws with a stratified cycle choice and a Poisson
  remainder, paths `C + R * q(d)`, per-day p10/p50/p90, a summary of the total and the day half of the invites are in
  (`halfDay`). EARLY: the same with the cycle's own total as the Poisson mean and p10/p90 widened 1.5x around the median.
  NONE: no band, the row still exists. A seeded `mulberry32` (`fnv1a` of school, program, type, cycle, `asOf`) makes a
  re-run the same day change nothing. Constants: `engine/stats/constants.ts`, `MODEL_VERSION` 1.
- **The job** is the queue `medschools.forecast` (`FORECAST_CRON`, 06:40 UTC, `MEDSCHOOLS_FORECAST_CRON`; no flag, no
  secret, no model call; detail `server/CLAUDE.md`). It writes `MedForecast` (one row per school, program, cycle and
  type; rows for finished cycles stay, a record of what was predicted, D11) and then `MedWaitCurve`.
- **`MedWaitCurve` is precomputed by the worker (D7).** A request that computed the curve would read other members'
  `COMPLETE` and `INTERVIEW` rows inside a per-user handler (one bad `where` and a stranger's row is on the wire), a member
  back-dating a milestone could move a curve a neighbour is looking at (the once-a-day publish closes only same-day
  differencing; R13 closes the rest), and the scan would be O(all tracker rows) per view. The row holds `members`,
  `invited`, `maxDay` and `{ t, s, n }` steps (`n` = members at risk at the step); nothing about one contribution.
- **R13: the curve is coarse (privacy review).** Times are whole weeks (`7 * ceil(t/7)`, `binObs`) before Kaplan-Meier, so
  steps sit only at multiples of 7; `maxDay` is the last week with at least 10 members at risk (`KM_MIN_AT_RISK`), and
  `inviteChance` is null for a target past it (which also puts 10 at risk at the caller's week); the request maps
  `elapsed` to its week and the horizon to whole weeks, so every day of a week has one answer. No curve with fewer than 10
  invite events (`KM_MIN_INVITES`) on top of 20 members. `runWaitCurves` replaces a stored row only when invites or members
  moved by at least 3 (`KM_REFRESH_DELTA`, `worthRefreshing`); below any floor the row is deleted at once, and a row in an
  older shape is rebuilt. The chance is rounded to the nearest 5%, the basis down to 10. An end date before COMPLETE drops
  the observation; a COMPLETE in the future is status `not-complete-yet`. All constants in `engine/stats/constants.ts`.
- **Each category ends on its own day.** `cycleEndOn(cycleYear, type)` is the day before `cycleYearOf` rolls the type over:
  secondaries May 31, interviews June 30, decisions (acceptance, waitlist, rejection) August 31. The forecast job draws each
  category to its own end, so the path, the total and `halfDay` match the implied total; the response's `endOn` is the
  category's, and the chart's x axis follows the stored band.
- **The observed line and the band agree.** `getForecast` cumulates the live series through the row's `asOf`; when a source
  revised past days since the job ran, the band (and the total) shifts by the difference, never below what is observed.
- **Live and Activity waves agree.** Both read REG + PHD summed, the primary source chosen over the whole cycle; the live
  feed reads the page schools' cycle rows from the cycle's first report (a window would miss a burst after a quiet spell).
- **Opt-in, and 20 distinct members (D5, D6, R1, R4).** Only cycles with `shareAnonymously` feed the curve; a pair with
  fewer than 20 distinct members with a valid observation has no row (a member with two cycles counts once). The basis
  shown is rounded down to a multiple of 10 so it does not reveal each new member. Every signed-in member sees the chance,
  sharer or not (R2); the sharing switch's copy says the wait between complete date and invite feeds an aggregate.
- **Per-event sources do not enter the curve (D9).** An Admit, SDN or RMH event has no person and no complete date;
  joining events to people is exactly what spec section 6 forbids. The engine's input is `{ days, event }` per
  observation, so a future source that carries pairs needs no model change.
- **Waves (D10).** A day of the INTERVIEW primary series whose count is more than 3x the median of the previous 14 days
  (zeros included), at least 5, with 7 previous days of data. Today's partial count is included.
- **Endpoints.** The public ones are now eight (`schools/$slug/forecast` joined) and `SCHOOL_TABS` has four tabs. Private: `me/chances`, which is one more `me/**` route, signed in, never cached, no id parameter.

## The Forecast tab, waves and the personal chance (phase 5, UI and endpoints)

A school tab is four edits, not one: the id in `SCHOOL_TABS` (`engine/public-read.ts`, which `parseSchoolSearch` reads),
a query factory and the loader's prefetch branch in `medschools.queries.ts` (so the chart is in the server HTML), a
label and a branch of the switch in `ui/SchoolPage.tsx` (the strip comes from `SCHOOL_TABS`, the body does not), and the
tab component in `ui/`. The Forecast tab is `ui/ForecastTab.tsx` with `ui/charts/ForecastBand.tsx`.

- **Endpoints.** Public `GET schools/$slug/forecast` (`getForecast` in `api/read.server.ts`: the stored `MedForecast`
  row plus the floored observed series cumulated through the row's `asOf`; `ALL` reads REG; status `ready | early |
  no-history | no-data | pending`). Private `GET me/chances` (`api/chances.server.ts`: the caller's own applications
  from `getTracker`, one `MedWaitCurve` row per school x program, no id parameter, never cached).
- **Chart.** The observed line is the category's colour, solid 2px; the median is dashed 2px; the 10th and 90th
  percentiles are 1px dotted boundaries; nothing is filled or translucent (R1). The x axis is calendar dates, the y
  axis starts at 0 and tweens. `ui/charts/charts.test.tsx` holds the markup.
- **Waves.** `waves` on the Activity response and `wave` on live rows come from `engine/stats/waves.ts` (server only).
  Ticks sit on `CategoryLines` (only while Interview is on) and `DailyBars` (Interview only); `WaveNote` is the
  non-visual reading; a live row says "Part of a wave".
- **The chance** shows on the tracker (`tracker/ChanceLine.tsx`, one query for the cycle under `ME_KEY`) and under the
  Forecast chart (`SchoolChances.tsx`, which passes the site cycle the tab shows, not the newest tracker cycle). It is an addition: signed out, loading or failed, the page is whole without it.

## AI Q&A (phase 6)

`/rmh-medschool/ask` and a panel at the foot of every school page (signed in; signed out the page is the sign-in prompt
and sends nothing). Plan: `docs/superpowers/plans/2026-11-23-rmh-medschool-phase6-ai-qa.md` (rulings R1-R19).
`POST/GET /api/medschools/me/ask` (`api/medschools.me.ask.server.ts`), never cached.

- **Two model calls, one task (R2, R3).** `runTaskJson` under the `medschools-qa` `AiTask` (`lib/ai/provider.server.ts`,
  prompts `MEDSCHOOLS_QA_ROUTE` and `MEDSCHOOLS_QA_ANSWER`): route (`{intent, schools, cycle, filters}`, temperature 0),
  then answer (`{segments:[{text, cites}], thin}`). The model names schools as written; the server resolves them against
  the active schools (`engine/qa/route.ts`). An unresolved school or intent `other` ends before the second call. The
  runner is a seam (`api/qa/runner.server.ts`) so every test scripts the model.
- **Retrieval only through the public readers (R5, R6).** `api/qa/retrieve.server.ts` calls `getSchool`, `getActivity`,
  `getHistory` and `getForecast`, so the one floor (`K_FLOOR`, the daily RMH snapshot, in-state splits) and the
  primary-source rule are inherited, never re-implemented. It imports no tracker module and no user id
  (`retrieve.server.test.ts` pins it). A fact's `updatedAt` is the source's last successful run for a count (the
  citation says "source refreshed"), `fetchedAt` for a profile, `computedAt` for a forecast; unknown stays unknown.
- **The validator is the guarantee (R7, R17).** `engine/qa/ground.ts` keeps a segment only when every cite is a
  retrieved fact, it cites at least one, every number in it is in a cited numeric fact, it holds no link, bare domain or
  markup, and a segment citing only forum text (`untrusted`) holds no number. A number is every maximal digit run
  whatever precedes it (CJK and Arabic glue digits to letters; `engine/qa/numbers.ts`), digits normalised, percents
  (`%`, `percent`, `per cent`), `k`/`m` suffixes and a leading minus part of the token, dates, years, ranges; and a
  spelled-out number (`engine/qa/number-words.ts`: English parsed to its value, "a dozen", "half"; es/fr/pt/ru/ar/hi/zh/ja
  listed best-effort as unverifiable, so those sentences are dropped). Bidi and zero-width characters (`\p{Cf}`) are
  removed from the sentence before it is checked and shown; lookalike dots (`。` `．` `﹒` `[.]` `(dot)`, `evil . com`)
  count as dots for the domain check. A sentence citing facts of several schools takes a number only from a cited fact
  of a school it names (`schoolNames`). **What it does not guarantee:** that digit-free prose is true. A sentence may
  paraphrase member-reported text (interview questions, feedback, the profile's style and length notes, all
  `untrusted`), because that is what such an answer is; the page says members wrote it and RMH checks figures, not
  words. Dropped segments are not repaired or re-asked: `notice: 'removed-ungrounded'`, and nothing left is `no-data`.
  No derived figures: a computed number is simply not found.
- **Injection (R8).** Facts reach the model only inside `asData(...)`; forum text is cleaned again (`cleanForPrompt`),
  capped and flagged untrusted. A model that obeys planted text still produces nothing the validator keeps
  (`testing/integration/medschools-ask.test.ts` proves it end to end with a fake provider).
- **My chance (R4).** Only on a `my-chance` question: the server runs `getChances(userId, ...)` for the resolved schools
  and returns the rows as `mine`; the model never sees a milestone, date or percent from the tracker. `mine: []` means
  no application; `mine: null` with `notice: 'mine-unavailable'` means the read failed (R18); the UI renders it through `ChanceLine` even when the answer is thin. This is the one personal read in
  `me/**` that is not an aggregate of tracker rows, and it reads only the caller's own.
- **Ceilings (R9-R11, R18), in this order before any model call.** Rate limit `ai` 6 per minute per user;
  `isAiConfigured` (503 `AI_UNAVAILABLE`); the shared gate (503 `MEDSCHOOLS_QA_PAUSED`: Q&A may spend
  `MEDSCHOOLS_QA_AI_SHARE`, default 0.25, of `MEDSCHOOLS_AI_MONTHLY_USD`; the scrape gates get the rest,
  `features/medschools/ai-budget.ts`); `assertAiBudget` (402); then the atomic reservation (`reserveQuestion` in
  `api/qa/budget.server.ts`): one transaction under `pg_advisory_xact_lock` on the member writes a `medschools-qa-ask`
  row (the day's count, the tier's cap since UTC midnight, below: 429 `MEDSCHOOLS_QA_DAILY_CAP`) and a
  `medschools-qa-lock` row (the in-flight lease, 60 s, deleted when the question ends: 429 `MEDSCHOOLS_QA_BUSY`).
  Both are zero-token, zero-cost, text-free `AiUsage` rows, so the cap and the lease hold across every web process and do
  not depend on the provider's metering write. Any ledger error fails closed (503 paused, unavailable). The one thing a
  lost provider metering write can still do is under-count spend (it is logged by `meter`); the daily count cannot slip.
  The whole question has a 50 s deadline (`QA_DEADLINE_MS`, under the client's 60 s `AI_TIMEOUT_MS`) plus the request's
  own `signal`; both model calls take it and never retry. The web tier needs `DEEPSEEK_API_KEY`.
- **Limit tiers, the admin bypass and limit requests (R19).** The daily cap depends on the caller's tier, resolved on the
  server per request by `resolveQaTier` (`api/qa/budget.server.ts`): **admin** is the session's `isAdmin` (the
  `defineHandler` ctx field, the same flag `auth: 'admin'` checks), **member** is `getUserTier(userId) !== 'free'` (the
  Stripe subscription or a gift membership, the source `assertAiBudget` uses; automatic, highest after admin), **approved**
  is an `APPROVED` `MedQaLimitRequest` row, else **free**. Caps: free 25 `MEDSCHOOLS_QA_DAILY_CAP`, approved 40
  `..._APPROVED`, member 100 `..._MEMBER` (invalid closes that tier). An admin skips the daily cap, the one-in-flight
  lease, the 6 per minute rate limit (`rateLimitExemptAdmin: true` on the ask `POST`) and the member's own monthly
  allowance, and writes no daily-count row; the shared monthly pause (R11) still applies, and so does a ceiling of 3 questions in flight per admin (`QA_ADMIN_MAX_IN_FLIGHT`, `medschools-qa-admin-lock` leases under an advisory lock keyed on the admin; 429 `MEDSCHOOLS_QA_BUSY`). A decision (approve, decline, revoke) sends the applicant a notice; a revoke is recorded in `revokedAt/By/Note` and leaves the approval fields alone; the admin list always includes every `APPROVED` row as `active`. `GET me/ask` returns
  `{ tier, remainingToday, dailyCap }`, null and null for an admin ("Admin: no daily limit"). Limit requests
  (`MedQaLimitRequest`, `api/qa-limit.server.ts`, outside `api/qa/` so the privacy pins on that folder stay literal): one
  PENDING and one APPROVED per member (partial unique indexes in the migration), reason at most 500 characters, a decline
  or revoke blocks a new request for 30 days, admins and paying members never see the form (`LimitRequest.tsx`, under the
  Ask form, not an ink button). Endpoints `me/qa-limit-request` (GET, POST) and `admin/medschools/qa-limit-requests`
  (GET, POST: approve, decline, revoke with an optional note), reviewed in the "Q&A limits" tab of `/admin/medschools`.
  Erased with the account; the schema test pins the model's exact columns, none of which can hold a question.
- **What is and is not kept (R12).** The question and the answer exist in memory for the call. No table, no cache, no
  response micro-cache, no log line holds them (logs carry intent, counts and status). The only trace is the `AiUsage`
  row every AI call already writes (user id, task, prompt id, tokens, cost, time; no text), kept under that table's
  existing erasure decision (`lib/account/erasure-registry.ts`). So no erasure operation was added for it (the limit request of R19 is its own model with its own erasure op). Pinned by
  `engine/schema.test.ts` (no `Med*` column can hold a question), `api/qa/privacy.server.test.ts` (no writes, no caches,
  no logging of text) and `scripts/medschools/verify-erasure.ts`. The provider receives the question text; the form says
  so in one line.
- **UI (`ui/ask/`).** `AskPanel` (page or section, pins `slug`), `AskForm` (the one ink button, counter, suggestions),
  `AnswerView` (rows on rules with source numbers), `Citations`, `MyChance`; `askRun.ts` is the pure run controller
  (cancel, one at a time). `ui/` imports `engine/qa` as types only (`qa-boundary.test.ts`). Strings are `ask-*` keys.
  The admin page is `ui/AdminMedSchoolsPage.tsx` (tabs: Aliases, Q&A limits). Not streamed (R1); embeddings deferred (R13): a question may name a state and an interview format instead.
- **Tests.** Unit:
  `pnpm exec vitest run features/medschools/engine/qa features/medschools/api/qa features/medschools/ui/ask`. Black box:
  `testing/integration/medschools-ask.test.ts` with `testing/integration/lib/fake-deepseek.ts` (the app is started with
  `DEEPSEEK_API_KEY=integration-fake`, `DEEPSEEK_BASE_URL=http://127.0.0.1:$INTEGRATION_AI_FAKE_PORT/v1`; the
  model-dependent cases skip without `INTEGRATION_AI_FAKE_PORT`, and CI sets it). Visual: `visual-check.mjs --fake-ai`.

## Testing and verification

- Unit: colocated `*.test.ts(x)` (`pnpm exec vitest run features/medschools`); `ui/ui-rules.test.ts` holds Steel, i18n
  and bundle rules for every ui file and the three routes.
- Black box, public: `testing/integration/medschools-public.test.ts` (pinned key sets, no RMH or `contributors` in
  responses, no hashes in the HTML, the `programs` set on the index and live feed, the removed "today" block, 404 for
  unknown slugs, sitemap). It writes its own fixture school; CI's database is empty.
- Black box, private: `testing/integration/medschools-private.test.ts` (two schools of its own and the global cast's
  alice, bob and carol; needs `MEDSCHOOLS_DEDUPE_SECRET` in the app and in the test, `ci-checks.yml` sets both).
  Anonymous 401 on every `me/**` route with no public cache header; foreign ids 404; sharing through the publish job
  (run directly with `runRmhPublish`) and only at 3; off removes the event at once and the figure at the next publish;
  edits, deletes and 20 mixed requests from two clients end equal to a recompute; nothing person-shaped in the event
  row; list caps, default-list race and preference round trip; the arrivals and live (`q`, `state`, `types`, `programs`)
  key sets.
- **Erasure and audit scripts (scratch or read-only).** `scripts/medschools/verify-erasure.ts` (scratch database only)
  seeds three members, kills the erasure pre-step midway through a failing database wrapper (injected in the script, not
  in the product), re-runs it, runs the real `anonymizeAccount` and checks events, counts, rows and `auditRmh`.
  `scripts/medschools/check-rmh-events.ts` runs `auditRmh` against any database, read-only, and prints `orphanEvents`,
  `mismatchedCells` and `missingEvents` (exit 1 unless all are zero). **Run it after rotating
  `MEDSCHOOLS_DEDUPE_SECRET`** (every event reads as an orphan until the hashes are recomputed; see Private, below).
- Seed: `scripts/medschools/seed-visual.ts` writes **FIXTURE** rows (never real figures) into a scratch Postgres (it
  refuses any database whose name lacks `scratch` or whose host is not localhost). Use it for screenshots and
  `pnpm audit:pages --routes …`.
- **Visual pass (O6): `scripts/medschools/visual-check.mjs`** signs up one member, fills a tracker, two lists and
  preferences through the real endpoints, and shoots index, live, a school (activity with a tooltip open, history with
  arrivals, the three Interviews sub-tabs), a DO school's program toggles, the tracker and the lists page at 320x568,
  390x844, 844x390, 768x1024, 1024x600, 1280x800, 1920x1080 and 2560x1080 in Day and Night, plus `ar` at 390 and 1280.
  It asserts no sideways scroll, that the edition asked for is the edition painted, chart text of at least 11 px below
  1024, 44 px controls on touch and `dir=rtl` in `ar`. **Night and a signed-in page:** the pre-paint script reads
  `localStorage['rmh-style']` (`graphite` is Night), but a signed-in visit paints the ACCOUNT's saved edition over the
  device's (`lib/prepaint/account-seed.ts`), and the idle sync saves whatever the last visit used, so a Night pass that
  follows a Day pass paints Day on the tracker and lists pages unless the account is set first
  (`PUT /api/preferences/appearance`; the script does). Nothing is wrong with Night on these routes: they are ordinary
  `_site` pages and `lib/prepaint/theme-routes.ts` does not exclude them.
- **Ask pages in the visual pass (phase 6).** `visual-check.mjs --fake-ai` also shoots the Ask page (signed out, idle,
  answered, partial, declined, my-chance, the wait, the cap reached and the 429 refusal) and the school page's panel (idle,
  answered). It hosts the fake DeepSeek of `testing/integration/lib/fake-deepseek.ts` itself, so the app must be started
  with `DEEPSEEK_API_KEY=integration-fake DEEPSEEK_BASE_URL=http://127.0.0.1:7798/v1` and `RATE_LIMIT_MULTIPLIER=50`, and
  `DATABASE_URL` must name the scratch database (it clears and plants the member's `ai_usage` rows). It asserts no
  sideways scroll, 44 px controls, and Steel R1 on the page content (no shadow, gradient, filter or backdrop filter).
  Without the flag only the signed-out and idle pages run. It found that the grounding validator dropped every sentence
  naming "Admit.org" (a domain-shaped source name); a domain is now allowed when it is in our own fact text.
- i18n: namespace `medschools`; new keys carry a prefix (`index-`, `live-`, `school-`, `chart-`, `event-`, `program-`,
  `source-`); the hub row's two strings are `nav-rmh-medschools` and `services-medschools-desc` in `feed`.

## Programs, lists, the activity rail and arrivals (owner 2026-11-23)

- **Program set.** `engine/programs.ts` is the one definition: four keys (`md`, `md-phd`, `do`, `do-phd`), the URL param
  `programs=md,do-phd` (canonical order; the old `degree` and `program` links still parse onto it), the preference
  (`MedUserPrefs.programs`, text[]; empty means "not chosen" and the older `programFilter` and `degree` columns still
  answer for old rows), and the three public readers (`programs` on the list, live and rail queries). All four on is no
  filter and the only set that includes events with no program reported. The index, live page, rail and preferences use
  `ProgramSetToggles`; the school page keeps `ProgramToggles` for its own degree (`ALL | REG | PHD`).
- **Preferences and lists on the public pages (plan task 12).** Each route loader awaits `loadPrefs` first, then
  prefetches the public queries with explicit parameters, so the public cache keys never carry a list, user or
  preference. `?list=<id>|all` on the index is a client filter over the returned schools. `/rmh-medschool/lists` holds
  the lists and the preferences (`#preferences`).
- **Activity rail.** `components/shell/margin-takeover.ts` maps a path prefix to a lazy rail that replaces the shell
  margin's search and lists (>= 1280px only; neither rendered nor fetched below). `ui/rail/ActivityRail.tsx` uses
  `useLiveFeed` (60 s head refetch, M9 fade) and one `IntersectionObserver` on the sentinel through `useSentinel` to
  load older pages: data loading only, so B3's no-decorative-observer rule is untouched. Server side it is the live
  endpoint with `q` (name, short name or an exact state code), `state` and `types`.
- **When results arrive.** `GET /schools/$slug/arrivals`: weekday and Eastern-hour counts and per-cycle first and median
  report days, aggregated in SQL from ADMIT and SDN events with an exact time (SDN midnights are day-only and excluded).
  Aggregates only; a cycle needs 3 events; the arrays are empty (and the section hidden) under 10 events.
- **Interviews** has `?itab=overview|questions|format`; Overview compares reported invites with Admit's yearly interview
  count (labelled "Source: Admit.org", hidden when unknown) and keeps the floored stats.

## Private: the tracker, sharing, lists and preferences (phase 4)

Pages `/rmh-medschool/tracker`, `/rmh-medschool/lists` and (phase 6) `/rmh-medschool/ask` (signed out they show a sign-in prompt, `noindex`; neither is
a school slug). Endpoints, all signed in, `Cache-Control` never public, no DTO with a user, cycle or event id:
`me/tracker` (GET), `me/tracker/cycle` (PUT, DELETE), `me/tracker/applications` (POST), `.../applications/$id` (PATCH,
DELETE), `.../applications/$id/milestones/$type` (PUT, DELETE), `me/lists` (GET, POST), `me/lists/$id` (PATCH, DELETE),
`me/list-order`, `me/list-items` (save a school, creating "My schools" on first use), `me/lists/$id/items/$itemId`,
`me/lists/$id/item-order`, `me/lists/$id/add-to-tracker`, `me/prefs` (GET, PUT). Another member's id is a 404, never
a 403.

- **One writer (D1).** `api/share-sync.server.ts` is the only module that writes the tracker rows or an RMH event or
  count (`share-ratchet.test.ts`). The database cascade deletes milestones without application code seeing it, and an
  event is found only through a milestone id, so every delete path reads the ids first.
- **The hash is recomputed, never stored (D2, D3).** `dedupeHash(secret, 'RMH', 'milestone:<id>')`; storing it on the
  milestone would let a database dump join events to the tracker without the secret. An event's id and a RMH count row's
  id are random UUIDs (a cuid carries its minute), `ingestedAt = occurredAt`, `inState` null, program the application's.
- **`contributors` is exact (D4):** a cell's count is its events, and the schema's uniques (milestone per application
  and type, application per cycle, school and program, cycle per user and year) make them distinct people.
- **Reconcile, do not patch (D5).** Every write that can change shared state runs `reconcileShared`: the user lock, read
  the flag and milestones, compute the wanted events, school locks in sorted order, write, recompute the touched cells.
  Rapid toggles and two tabs end equal to the final flag and milestones.
- **What is shared:** the school, the program, the type (secondary, interview, waitlist, rejection, acceptance,
  withdrawn, hold) and the calendar day. Never submitted or complete dates, home state, notes, or any link to the
  member. Sharing needs an account at least 7 days old and `MEDSCHOOLS_DEDUPE_SECRET` set (503
  `MEDSCHOOLS_SHARING_UNAVAILABLE` otherwise; the tracker still works). Public tracker figures update once a day (see
  the read rules above).
- **Account deletion (D9, Q3).** `eraseSharedMedEvents` runs at the deletion request and again before the erasure
  transaction (idempotent; a missing secret with events present fails loudly and leaves the account scheduled);
  `medschoolsErasureOps` deletes the four user-keyed models (`MedTrackerCycle`, `MedSchoolList`, `MedUserPrefs`, `MedQaLimitRequest`), children by cascade, and nulls `decidedBy` and `revokedBy` on the limit requests the member decided or revoked as an admin. `pnpm docs:deletion` lists them.
- **Preferences (D13, D14).** They apply only where the URL is silent, decided in the route loader; `?program=ALL` is an
  explicit choice and beats a stored `PHD`. A page whose defaults came from preferences says so in one line.
- **Rotating `MEDSCHOOLS_DEDUPE_SECRET` orphans every shared event** (the hashes are keyed by the old secret). Do it
  deliberately: set the new value on the web and `jobs` tiers, then run `check-rmh-events.ts`; expect `orphanEvents` to
  equal the number of shared events, and delete them (or re-share) before the next daily publish.
