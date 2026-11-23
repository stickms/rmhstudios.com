# RMH Med Schools — design

Date: 2026-11-20 · Status: approved by owner 2026-11-20

## 1. Intent

A new RMH app, **RMH Med Schools**, for US medical school applicants. It shows the current admissions cycle as it
happens (interview invites, acceptances, waitlists, rejections, per school, per day), past cycles for comparison, and a
**predicted** rest-of-cycle built with real statistics. It collects interview questions and interview dates, answers
natural-language questions about schools and cycles with AI, and gives each signed-in applicant a private tracker of
their own cycle. Anyone, signed in or not, can browse per-school results and live activity.

Why: applicants refresh three separate sites (CycleTrack, Admit.org, SDN) to answer one question — "has my school
started sending invites, and what does that mean for me?" RMH Med Schools puts the three together, adds forecasting none
of them offer, and keeps the applicant's own timeline beside it.

**Data permission.** The owner obtained written permission from CycleTrack, Admit.org and SDN for this service,
conditional on anonymization (no usernames etc.). That condition is a hard invariant of this design (§6), not a
preference.

Scope of that permission, as the owner reported it on 2026-11-20: **all data from all three sources is fine, as long as
it is anonymized.** That includes the archives (MDApplicants, SDN prior-year forums), AI processing of SDN post text,
and storing reworded interview questions. No source set a rate limit, User-Agent or attribution wording, so the defaults
in §8 (≥1 s per request, descriptive User-Agent, thread-level attribution) apply; a term that arrives later goes in
`sources.ts`.

## 2. Goals, non-goals, anti-goals

Goals

- G1 Every US MD and DO school has a public page: current-cycle daily activity, the prior cycles, the forecast,
  interview questions, interview dates/format, links to sources.
- G2 A live activity view (all schools, filterable by event type and school) that updates within ~5 minutes of an event
  appearing at a source.
- G3 Historical depth: CycleTrack current + 2 prior cycles, the MDApplicants archive (1998–2024), Admit.org's feed
  history, SDN prior-year threads.
- G4 Forecasts per school and event type with uncertainty bands, plus a personal "chance of an invite by date X given no
  invite yet" for tracker users.
- G5 Private per-user tracker: schools applied to, milestone dates, notes; optional, anonymous contribution of
  milestones to the public aggregates.
- G6 AI Q&A grounded in RMH's stored data, with citations to the source rows/pages.
- G7 Follow a school and get a notification when it sends a wave of invites (later phase).

Non-goals

- Canadian schools, residency, college, dental/pharmacy (same sources carry them; out of scope now — the registry has a
  `country` column so this stays possible).
- A social layer (comments, profiles, DMs) — RMHarks already exists.
- Essay advising, school-list building, paid tiers.

Anti-goals (failure even if it "works")

- Anything that lets a viewer re-identify an applicant: a stored username, avatar, source user id, SDN post author, post
  permalink, or a public cell built from fewer than 3 people.
- Hammering a source: polling faster than needed, refetching unchanged pages, parallel bursts. Losing a permission is
  losing the product.
- A page that looks like it came from another site: off-token colours, chart.js defaults, shadows, gradients (Steel
  R1–R5).
- Presenting reported events as applicant counts. CycleTrack's own caveat holds: these are reported milestones, not
  unique applicants, and sources overlap.

## 3. Constraints (from the repo)

- Stack: TanStack Start, Prisma 7 multi-file schema, pg-boss via `lib/jobs/scheduled-consumer.server.ts` (no
  `setInterval`/node-cron — `lib/__tests__/scheduler-ratchet.test.ts`), contracts + `implement()` + `apiRoute()` for
  every endpoint, `t()` for every string, Steel design for `_site` pages.
- AI goes through `lib/ai/provider.server.ts` (`runTask` / `runTaskJson`, task-keyed, DeepSeek backend, `AiUsage` rows,
  `assertAiBudget`). Nothing new routes to Anthropic.
- pgvector exists but only `embeddings.server.ts` may touch vector columns.
- Charting deps present: `d3` and `chart.js`. No stats library.
- Postgres connection budget is tracked (`docker-compose.yml` comment, `scripts/db-connection-budget.mjs`); the worker
  takes a pool of 3.

## 4. Approaches (decided)

Considered for the ingest/compute tier:

- A. Run the jobs on the existing `jobs` worker, following RMHHomes' adapters. Cheapest, but backfills (hundreds of
  thousands of MDApplicants rows, LLM extraction of SDN posts) would share a process and failure domain with the Discord
  bot and every other job.
- **B. A dedicated `medschools-worker` process** beside `ladder-worker`/`homes-worker`, its own compose service, memory
  limit and pg pool. — **Owner's pick.** Isolates long backfills and source outages; the cost is one more service to
  wire (checklist §11).
- C. A Go service. Ruled out: the repo ported Go workers back to Node (D3).

## 4a. MD and MD-PhD are separate admissions (owner, 2026-11-20)

MD (or DO) and MD-PhD (or DO-PhD) are different admissions processes with different timelines, and the product never
mixes them. Every count, stat, forecast, interview figure and tracker application carries `program` (`REG` = MD/DO,
`PHD` = MD-PhD/DO-PhD). Pages show the two side by side as separate series or a program switch, defaulting to `REG`;
forecasts and the personal conditional chance are fitted per program; the live feed labels each event's program. A
per-event source that does not say which program an event belongs to stores `program = null`, and those events are shown
as "program not reported" — never assigned to MD by default and never counted in either program's curves or forecasts.

**Admit.org program (owner, 2026-11-20).** Admit's feed rows do not name the program directly; the program is whether
the posting applicant is marked as MD/PhD on Admit. The Admit adapter therefore derives `program` from that
applicant-type flag — from the feed row if the API exposes it there, otherwise from the applicant's public profile — and
the flag is the only thing taken from it. The lookup is anonymization-safe only under these rules: the flag is read in
memory and mapped straight to `REG`/`PHD`; no username, user id or profile field is stored, logged or hashed; profile
lookups are cached in memory for the current run only (so one applicant costs one request per run, under §8's politeness
limits) and the cache is discarded when the run ends. If the flag cannot be read, `program = null`. Phase 2's
feasibility spike finds where the flag lives before the adapter is planned.

**SDN program (2026-11-20, by analogy with the owner's Admit.org rule).** SDN threads are per school, not per program. A
post counts as MD-PhD/DO-PhD only when the extractor reports it and the post text itself says MD-PhD, DO-PhD, MSTP or
"PhD track"; every other SDN post counts as MD/DO, as an unflagged Admit.org applicant does.

## 5. Architecture

```
 CycleTrack ─┐             medschools-worker (pg-boss queues)            web (SSR + API)
 Admit.org  ─┼─ adapters ─► normalize ─► anonymize ─► upsert ─► Postgres ◄─ /rmh-medschool pages
 SDN        ─┘   (per source)                         │                  ◄─ contracts/api
                                       aggregate + forecast (nightly/hourly) ◄─ AI Q&A (RAG)
```

Code layout (copying RMHHomes, using the feature-folder form of redesign A1):

- `features/medschools/` — `feature.ts`, `catalog.ts` (AppInfo, `href: '/rmh-medschool'`, `usesSiteTheme: true`,
  `authGate: false` because the public pages need no account), `engine/` (pure logic: normalize, anonymize, stats,
  forecast — unit-tested, no I/O), `ui/` (components), `api/` (`*.server.ts` endpoint modules), `scrape/adapters/`.
- `server/medschools-worker/index.ts` — the process.
- `prisma/schema/medschools.prisma` — the models.
- `app/routes/_site/rmh-medschool/` — thin pages.
- i18n namespace `medschools`, added to `NAMESPACES` in `lib/i18n/config.ts`.

## 6. Anonymization invariant

The single rule: **no identifier of a person crosses the adapter boundary.**

- Each adapter's raw response type is private to the adapter. It emits only the `NormalizedEvent` / `NormalizedQuestion`
  types, which have no field that could hold a username, display name, avatar URL, source user id, author, or free post
  text.
- Dedupe keys from sources (Admit `cycle_update_id`, SDN post id) are stored only as
  `HMAC-SHA256(MEDSCHOOLS_DEDUPE_SECRET, source + ':' + id)`. Never raw. (Admit's `user_id` is never read, not even
  hashed — a stable per-person hash would let rows be linked into a timeline.)
- SDN post bodies exist only in memory during extraction; what is stored is the extracted event (type, date, school,
  cycle, optional in-state flag) and interview-question text rewritten by the extractor to drop names and first-person
  details. Attribution links point to the **thread**, never a post permalink.
- Admit's interview questions are stored as text (they are already anonymous questions); feedback bullets likewise.
- First-party (RMH tracker) data contributes to public aggregates only if the user opted in, and only through
  aggregates.
- **k-anonymity floor (enforced at read time, from `contributors`):** any public figure built from RMH tracker data
  (daily counts, score medians) and any in-state/out-of-state split from any source is suppressed when it rests on fewer
  than 3 contributors — CycleTrack's own rule. The in-state split is suppressed independently of the count it splits.
  Admit and SDN events are already public one-by-one at their source, so their anonymous per-event rows and daily counts
  are shown; CycleTrack's counts are shown as published.
- Tests: an adapter-boundary test feeds fixture payloads containing usernames and asserts none of those strings appear
  in anything written to the database; a schema test asserts no `medschools.prisma` column is named like
  `user*name|author|avatar|display`. (Exception: the private tracker models carry the RMH `userId` of their owner, like
  `HomeWatch`. They are never read by public endpoints.)

## 7. Data model (`prisma/schema/medschools.prisma`)

- `MedSchool` — id, slug, name, shortName, degree (`MD`|`DO`), city, state, country, website, interviewFormat?,
  interviewType?, active.
- `MedSchoolAlias` — schoolId, source (`CYCLETRACK`|`ADMIT`|`SDN`|`MDAPPLICANTS`), sourceKey (CycleTrack name, Admit
  slug, SDN thread title stem / thread id), unique on (source, sourceKey). Unmatched source names land in a
  `MedSchoolAliasMiss` table for the admin, never auto-created.
- `MedCycle` — cycleYear (entry year), amcasOpensOn, amcasSubmitOn, aacomasOpensOn, start of day-of-cycle `d` (§10).
  Seeded for recent cycles from AMCAS/AACOMAS published dates; for archive years without a known date, `d` is counted
  from June 1 of the application year (marked `dateEstimated`).
- `MedCycleCount` — the canonical activity fact: schoolId, program (`REG`|`PHD`), cycleYear (entry year, CycleTrack's
  convention: 2026-2027 → 2027), date, eventType (`SECONDARY`|`INTERVIEW`|`WAITLIST`|`REJECTION`|`ACCEPTANCE`), source,
  count, contributors (distinct-reporter count where known; null for CycleTrack, which suppresses upstream). Unique on
  (school, program, cycle, date, type, source). CycleTrack daily counts write it directly; the aggregate job rebuilds
  the per-event sources' rows from `MedCycleEvent`. **Sources are never summed** (they overlap — an applicant may report
  on all three); see §10.
- `MedCycleEvent` — individual anonymous events from per-event sources (Admit feed, SDN extraction, opted-in tracker):
  schoolId, cycleYear, program (`REG`|`PHD`, null when the source does not say), eventType, occurredAt, source,
  dedupeHash (unique), inState?, ingestedAt. Feeds the live view; rolled up into `MedCycleCount`. No person fields.
- `MedInterviewQuestion` — schoolId, text, source, votes?, cycleYear?, dedupeHash.
- `MedInterviewProfile` — per school per source: format, fileType, avgDifficulty, interviewCount, feedback
  (positive/negative/before arrays).
- `MedInterviewDate` — interview dates: schoolId, cycleYear, date, kind (`INTERVIEW_DAY`|`SECOND_LOOK`…), origin
  (`ADMIN` — entered by an RMH admin from a school's published calendar, with `sourceUrl`; or `REPORTED` — rolled up
  from tracker milestones and SDN extraction, shown as a count per date under the k≥3 floor). School websites are
  **not** scraped; that would be a fourth, unpermitted source.
- `MedSchoolStats` — per school per cycle per program: GPA/MCAT medians and ranges, interview-to-acceptance %, as
  published by CycleTrack (already suppressed upstream).
- `MedForecast` — schoolId, program, cycleYear, eventType, modelVersion, computedAt, curve JSON (day → p10/p50/p90
  cumulative), summary (expected total, expected date of 50% of invites).
- `MedSourceRun` — source, job, trigger, startedAt, finishedAt, status, stats JSON, error. Observability, like
  `HomeScrapeRun`.
- Private tracker: `MedTrackerCycle` (userId, cycleYear, shareAnonymously bool, inState data: home state),
  `MedTrackerApplication` (cycleId, schoolId, program, notes), `MedTrackerMilestone` (applicationId, type incl.
  `SUBMITTED`/`COMPLETE`, date). Owner only; sharing writes an anonymous `MedCycleEvent` (source `RMH`) per milestone
  and deletes it if sharing is turned off.
- `MedSchoolFollow` (userId, schoolId) — phase 7.
- **School lists and preferences (owner, 2026-11-22; phase 4, with the tracker).** Owner only, never public, deleted
  with the account (`onDelete: Cascade` on the user), never an input to any public figure.
  - `MedSchoolList` (id, userId, name ≤ 60 chars, position, createdAt, updatedAt): a user's named lists ("Applying",
    "Reach", "Maybe"). One list, "My schools", is created on first use; at most 20 lists per user.
  - `MedSchoolListItem` (id, listId, schoolId, program `ANY|REG|PHD` (non-null enum `MedListProgram`, `ANY` = either;
    not a nullable `MedProgram`, so the unique key is a plain unique, since Postgres treats NULLs as distinct; phase 4
    ruling Q10, 2026-11-23), position, note ≤ 500 chars, addedAt; unique `[listId, schoolId, program]`; at most 200
    items per list).
  - `MedUserPrefs` (userId as the id, program filter `ALL|REG|PHD`, degree `MD|DO|null`, homeState `String?`, chart
    categories `MedEventType[]` (the Activity toggles), updatedAt).
  - Behaviour: signed-in users get "Save to list" on the school page and on index rows (a menu of their lists plus "New
    list"), a lists view under `/rmh-medschool/lists` (rename, reorder, notes, remove), "Show my lists only" on the
    index, and "Add this list to my tracker" (creates `MedTrackerApplication` rows; the two stay separate records).
    Preferences fill in a page's defaults only when the URL does not say otherwise (a URL parameter always wins, so
    shared links read the same for everyone); the public read endpoints stay user-independent and publicly cached, and
    lists and preferences come from their own `auth: 'required'` endpoints that are never cached publicly.
  - The anonymization schema test allows `userId` on `MedSchoolList` and `MedUserPrefs` (owner-only models) as it does
    on `MedTracker*`; `MedSchoolListItem` has no `userId` (it reaches its owner through the list).

## 8. The worker and its jobs

`server/medschools-worker/index.ts` follows `server/homes-worker/index.ts`: own PrismaClient (pool 3),
`installProcessGuards`, one `startScheduledConsumer` per queue, overlap guard, graceful shutdown, `MEDSCHOOLS_*_ENABLED`
per source, cron env overrides. Bootstrap on first start: seed the school registry, then queue the backfills.

| Queue                   | Cron (UTC)                    | What                                                                                                                                                                                                     |
| ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `medschools.admit-live` | every 5 min                   | Admit `getRecentSchoolCycleUpdates(allSchools)`; insert unseen events by hash. The live feed.                                                                                                            |
| `medschools.sdn-live`   | daily (12:20 UTC)             | Poll the two current-cycle forum RSS feeds; for threads whose activity changed, fetch only the new last page(s); extract (§9).                                                                           |
| `medschools.cycletrack` | hourly at :20                 | CycleTrack regenerates hourly; per school, fetch the explorer page / its summary JSON; upsert daily counts, stats, first-dates. Walk schools sequentially, ~1 req/s.                                     |
| `medschools.interviews` | daily                         | Admit interview overview/questions/feedback per school.                                                                                                                                                  |
| `medschools.aggregate`  | every 15 min                  | Roll `MedCycleEvent` into `MedCycleCount`; refresh the materialized "today" view.                                                                                                                        |
| `medschools.forecast`   | daily 06:40                   | Recompute `MedForecast` for every school × event type (§10).                                                                                                                                             |
| `medschools.backfill`   | manual (`runNow`) + bootstrap | Resumable, cursor-in-`MedSourceRun`: MDApplicants archive, CycleTrack `?view=historical`, Admit `getAllCycleResults` offset paging, SDN prior-year forums (nodes 962/603). Runs at the polite rate only. |

Politeness, every adapter: one request at a time per host, ≥1 s spacing (backfill ≥2 s), a stable descriptive User-Agent
naming RMH Studios and a contact URL (no personal address), honour `Retry-After`/429 with exponential backoff,
conditional GET where the host supports it, stop the source for the run after 3 consecutive failures. Rates and any
terms the permissions specify go in `features/medschools/scrape/sources.ts` as the one place they are written down.

Phase 1 opens with a feasibility spike that captures fixtures from every endpoint named here (all were reached
anonymously during design research on 2026-11-20, but none is a documented API). If an endpoint proves unusable, that
source's adapter is re-planned, not forced.

School matching: each adapter maps a source name to a `MedSchool` through `MedSchoolAlias`; misses are recorded, not
guessed. The seed registry includes the aliases for all three sources (CycleTrack's 238 names including its typos, Admit
slugs, SDN thread titles), built once with a script from CycleTrack's explorer list (its `/explorer/first` table gives
MD/DO) cross-checked against Admit's school list, then reviewed by hand. Alias misses are listed on a small admin page
(`auth: 'admin'`, phase 2) where an admin maps a miss to a school.

## 9. SDN extraction

New posts only (post id hash not yet seen). Strip `blockquote` (quoted replies) before anything else. A cheap regex
prefilter (`\bII\b|interview|accept|\bA\b|waitlist|\bWL\b| reject|\bR\b|question|secondary|2ndary`, secondary terms
added 2026-11-20) skips chatter. Survivors go to `runTaskJson` (new `AiTask` `medschools-extract`) with a strict zod
schema: `{ events: [{ type, date (ISO, resolved against post date), inState? }], questions: [string] }`. The prompt
instructs: report only the poster's own event, resolve relative dates ("today") against the post timestamp, rewrite
questions without names. The post's school and cycle come from the thread, not the model. Batched per thread page;
costed into `AiUsage` under a system budget (`MEDSCHOOLS_AI_MONTHLY_USD`, default 20) with a per-run cap on LLM calls;
when the month's budget is spent, extraction pauses and resumes next month from its cursor. Estimate: ~500 school
threads per cycle × a few hundred posts, ~40% surviving the prefilter, a few hundred tokens each — tens of millions of
tokens for the full prior-year backfill, a few dollars at DeepSeek prices — so the full backfill is in scope, newest
cycles first.

Event dedupe is author-scoped: the parser keys each event by
`HMAC(author:<member id or lower-cased handle>:<school>:<cycle>:<type>)`, held in memory only, so one forum member
counts at most once per event type per school per cycle (first post wins), with the per-post `postId:type:day` key as
the fallback when a post carries no member id.

## 10. Statistics and forecasting

Day-of-cycle `d` = days since the cycle's AMCAS/AACOMAS submission opening (stored per cycle). For each school × program
× event type:

- **Historical curves:** cumulative share of the season's total events by day `d`, one curve per past cycle (CycleTrack
  2 prior cycles; MDApplicants for depth where the school has ≥30 reports in a year).
- **Current-cycle forecast:** observed cumulative count `C(d_now)`; for each historical cycle `h`, the implied season
  total `C(d_now) / share_h(d_now)` and the implied future path `total_h × share_h(d)`. Weight cycles by recency; the
  spread of the implied paths plus a Poisson term for count noise gives p10/p50/p90 bands. Early in a cycle (share < 5%)
  fall back to the historical median total with wide bands. Shown as an observed line plus a shaded-free band drawn with
  a 1px dashed boundary (Steel: no fills that read as translucency — band edges are dashed rules).
- **Personal conditional chance:** from first-party tracker data and per-event sources, a Kaplan–Meier estimate of time
  from application-complete to invite for that school, censored at "no invite yet". The user sees P(invite by date X |
  none by today). Shown only when the school has ≥20 complete-date observations; otherwise the page says the data is too
  thin.
- **Waves:** a day with invites > 3× the school's trailing 14-day median is marked as a wave (feeds the live view and
  phase-7 follow alerts).
- All of this is pure TypeScript in `features/medschools/engine/stats/`, unit-tested with fixed fixtures; the worker
  writes the results, pages read them. No stats library added.

**Combining sources.** Counts are never summed across sources. Each chart has one primary series — CycleTrack, the
largest and already deduplicated per day — with Admit, SDN and RMH available as comparison series. Forecasts are fitted
to the primary series; where CycleTrack has no data for a school, the next source in the order CycleTrack → Admit → SDN
→ RMH is primary and the chart says so.

Every chart labels its unit as "reported events" and names its sources.

## 11. Web

Pages (`app/routes/_site/rmh-medschool/`, Steel, `PageLayout`, per-route `head()` with `buildMeta`, OG cards via
`ogCardPath('med-school', slug)` plus a section card in `lib/og/static-cards.ts`):

- `index.tsx` — search/filter the school list (MD/DO, state), today's live activity at the top, "schools that sent
  invites today".
- `live.tsx` — the live feed: rows of "Interview invite · Duke · 4 min ago" (no person), filter by type and school;
  React Query refetch every 60 s, new rows fade in via `components/ui/arrive.tsx` (M9). No animation at rest.
- `$slug.tsx` — school page: header facts; tab strip (via the shared tab primitive, not a hand-rolled one) for Activity
  · History · Forecast · Interviews; links out to the school's CycleTrack, Admit.org and SDN pages with the attribution
  each source requires ("Source: Student Doctor Network" + canonical link).
- `tracker.tsx` (signed-in) — my cycle: schools, milestones, the sharing switch, my conditional chances.
- `ask.tsx` — AI Q&A (also embedded as a panel on the school page).

School crests (owner, 2026-11-22): Admit.org's school crests, fetched by `scripts/medschools/fetch-admit-crests.ts` into
static 96×96 WebPs under `public/images/medschools/crests/<slug>.webp` (listed in `data/medschools/crests.json`, kept
out of the image-variant manifest), drawn by `ui/SchoolCrest.tsx` with an empty alt because the school name is always
beside it.

Charts: SVG drawn with `d3-scale`/`d3-shape` in a small `ui/charts/` set (daily bars, cumulative line with forecast
band, cycle-over-cycle overlay), coloured only with `--site-text`, `--site-text-muted`, `--site-border`; rendered on the
server so they appear without scripting. Not chart.js (canvas, its own palette).

API: one contract file `features/medschools/medschools.contract.ts`; modules under `features/medschools/api/` via
`apiRoute` + `implement`. Public read endpoints use `auth: 'optional'` and a read rate limit; tracker endpoints
`auth: 'required'` and scope every query by `session.user.id`; `pnpm api:routes` regenerates the table.

## 12. AI Q&A

New `AiTask` `medschools-qa`. Retrieval is structured first: the question is routed (`runTaskJson`) to {schools, cycle,
intent}; the server then loads the relevant rows (counts, stats, forecast summary, interview profile and top questions,
recent events) and passes them as data (`asData`) with source labels. Answers stream over SSE (pattern:
`lib/wiki/wiki.contract.ts`) and cite the rows they used ("CycleTrack, updated 2026-11-20 02:16"). Interview questions
also get embeddings (through `embeddings.server.ts`) so "what do they ask at MMI schools in Texas" can search across
schools. Signed-in only, under `assertAiBudget` (cost control); anonymous visitors see a sign-in prompt in its place.
The model is told to say when data is thin, and never to estimate an individual's admission chance beyond the §10
figures.

## 13. Wiring checklist (new worker)

`package.json` (`dev` concurrently list, `medschools-worker:dev`, `build` esbuild entries, `start`), `Dockerfile`
esbuild list + `test -f`, `docker-compose.yml` service (`mem_limit` 512m — LLM extraction batches — `cpus` 0.5,
`DATABASE_POOL_SIZE=3`), `deploy.sh` `WORKER_SERVICES`, `scripts/db-connection-budget.mjs`, `.env.example`
(`MEDSCHOOLS_*_ENABLED`, `MEDSCHOOLS_*_CRON`, `MEDSCHOOLS_DEDUPE_SECRET`), `server/CLAUDE.md`, `CLAUDE.md`,
`docs/architecture.md` diagram + table, `docs/_generated/facts.json` via `pnpm facts:generate`.

## 14. Delivery phases (each its own plan and PR)

1. Foundation: schema, registry + aliases seed, worker skeleton and wiring, CycleTrack adapter + historical backfill,
   anonymization tests.
2. Admit.org adapter (live + backfill + interviews; phase 2a, shipped with the alias-miss admin page) and SDN adapter
   (RSS live, prior-year backfill, LLM extraction). Phase 2b (SDN) shipped as three queues in the medschools worker:
   `medschools.sdn-live` (daily, owner 2026-11-22: SDN forum activity is slow), `medschools.sdn-backfill` (its own queue
   rather than the shared backfill queue, queued by the live tick while owed, no bootstrap trigger) and
   `medschools.sdn-interviews` (weekly). Program is MD unless MD-PhD, DO-PhD or MSTP is stated (section 4a SDN
   paragraph); extraction is capped by `MEDSCHOOLS_AI_MONTHLY_USD` (20, backfill 80%), pauses in DeepSeek peak hours and
   backs off after failed runs; phone numbers and email addresses are redacted before the model, names may reach the
   model but are never stored. Detail: `server/CLAUDE.md`.
3. Public pages: index, live, school page Activity/History/Interviews, OG, i18n. Phase 3 shipped at `/rmh-medschool`,
   `/rmh-medschool/live` and `/rmh-medschool/$slug`, listed under RMH Services and site search, not the games/apps
   catalog (O1). Decisions: D4 primary series by `PRIMARY_ORDER` after the floor; D5 k floor (RMH rows need 3
   contributors, splits need both sides at 3, live feed excludes RMH); D6 null-program events in no series; D7 charted
   types; D8 live row privacy (minute precision, opaque id); D9 `today` endpoint; D10 current cycle; D11 source
   attribution wording; D13 charts keep a left-to-right axis in `ar`; D14 index as rows on rules. Owner revisions: O1
   Services placement; O2 chart style approved for these pages; O3 attribution approved; O4 toggleable category lines;
   O5 program filter All / MD / MD-PhD (or DO); O6 visual checks across phone and odd viewports. Also shipped: school
   crests (static 96x96 WebP from Admit, committed, never fetched at request time); SDN events reported the same day
   carry the post's time; one SDN member counts once per event type per school per cycle.
4. Private tracker with anonymous sharing, saved school lists and preferences (section 7).
5. Statistics + forecast tab + personal conditional chance.
6. AI Q&A.
7. Follow a school + wave notifications.

## 15. Calls made by the designer (owner may override)

- App lives in the `_site` shell (Steel) at `/rmh-medschool`, not a full-screen app.
- US MD + DO only; MD-PhD/DO-PhD kept as `program = PHD`.
- AI Q&A needs sign-in; public pages don't.
- Source attribution links point at threads/school pages, never posts.
- Sources never summed; CycleTrack is the primary series, others are comparison series; never labelled as applicants.
- k≥3 enforced at read time; in-state splits suppressed independently.
- Admit polled every 5 min (meets G2's ~5 min) unless the permission allows faster.
- Interview dates: admin-entered from school calendars plus reported dates; no scraping of school websites.
- Alias-miss admin page is in phase 2.
- AI extraction budget: $20/month default, full SDN backfill newest-first.
- SVG/d3 charts, not chart.js.

## 16. Left to the builder

Exact selectors and JSON field mapping per adapter (from fixtures captured in phase 1), the alias-seed script, cron
minutes, index choices, component breakdown inside the pages, prompt wording.
