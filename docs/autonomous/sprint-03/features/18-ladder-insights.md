# 18 — RMHLadder search insights

Surface: `/rmhladder/insights` (new tab in the RMHLadder shell). Wave 4.
Namespace `ladder-insights`. No schema change. Uses 17's offers when present.
Reuses sprint 02's `bar-chart.tsx`.

## User story

As a job seeker tracking applications in RMHLadder, I want to see my search as
numbers — how many applications reach a screen, an interview and an offer,
how long companies take to answer, which kinds of roles and which ways of
applying work best, and which applications have gone quiet — so that I can
change what is not working instead of sending more of the same.

## Requirements elicitation

- **What exists (verified):** every status change of an application writes a
  `LadderApplicationEvent` (`type: 'status_changed'`, `fromStatus`,
  `toStatus`, `createdAt`; written in `lib/rmhladder/server/actions.ts`),
  indexed `(userId, createdAt)`. Applications carry `appliedDate`,
  `referralName`, the job (company, title, pay, source). The pipeline page
  shows the current stage of each application; **nothing summarises the
  history** (no funnel, conversion or response-time code under
  `lib/rmhladder` or `components/rmhladder`).
- **Decisions:** computed at read time from events and applications for the
  member over a range (90 days, 1 year, all), no new table. A stage is
  "reached" if the application's event history ever entered it (so a later
  rejection does not erase that it got an interview). "Response" is the first
  status change after `applied` (any move to networking, interviewing,
  final_round, offer or rejected). An application is "quiet" if it is in
  `applied` with no event for 21 days (configurable 14/21/30), and the page
  offers to set a follow-up date or mark it rejected — the same actions the
  pipeline has. Breakdowns are by referral (with/without), by job source
  (`LadderSource` kind), by seniority if the job has one, and by company size
  if the company has one — only dimensions that exist on the rows.

## Functional requirements

1. FR-1 Funnel: applied → responded → interviewing → final round → offer, with
   counts and the conversion between each step, for the range.
2. FR-2 Time to first response: median and 75th percentile in days, and a bar
   chart of response times in weekly buckets.
3. FR-3 Applications per week (bars) with responses per week.
4. FR-4 Breakdown table: for each dimension value, applications, response
   rate, interview rate, offer rate — only when the group has at least 5
   applications (otherwise "too few to compare").
5. FR-5 Quiet applications: a list (company, role, applied date, days quiet)
   with "Set follow-up" and "Mark rejected".
6. FR-6 Outcomes: offers received, accepted, declined (from 17 when present),
   withdrawn, rejected.
7. FR-7 An "Insights" tab in the RMHLadder shell; empty state when the member
   has fewer than 3 applications.

## Non-functional requirements

- **Performance:** one query for the member's applications (with job,
  company, source) and one for their events in the range; aggregation in a
  pure function; at most 2,000 applications per member in practice; p95 under
  300 ms.
- **Security:** owner-only; the follow-up and reject actions reuse the
  existing action endpoints (no new write path).
- **Accessibility:** the funnel is an ordered list with numbers in text; every
  chart has a table alternative; percentages read in full ("42 percent" via
  `Intl.NumberFormat` style percent).
- **i18n:** strings in `ladder-insights`; dimension values from data are shown
  as stored, labels translated.
- **Steel (site tier):** rows on rules; charts via the shared primitives with
  translated labels as props; no colour coding beyond ink and muted.

## Data model and API

- No schema change (the `(userId, createdAt)` event index serves the range
  query).
- `lib/rmhladder/insights.ts` (pure: funnel from event histories, first
  response, percentiles, weekly buckets, breakdowns with the minimum group,
  quiet detection), `lib/rmhladder/insights.server.ts`,
  `insights-schema.ts` (query: `range`, `quietDays`), `insights.contract.ts`.
- Module `lib/rmhladder/api/rmhladder.insights.server.ts` (GET).
- Route `app/routes/_site/rmhladder/insights.tsx`; tab in
  `RmhLadderShell.tsx`; `EXCLUDED_ROUTES` in `lib/sitemap.ts`.

## Testing requirements

- Main suite `lib/rmhladder/__tests__/insights-endpoint.test.ts`: only the
  caller's applications and events are read; signed-out is 401; query params
  validated.
- Product suite `lib/rmhladder/__tests__/insights.product.test.ts`: an
  application that was interviewed then rejected counts as reached
  interviewing; first response ignores `planning`; percentiles on small sets;
  groups under 5 are suppressed; quiet detection at the boundary.

## Acceptance criteria

- [ ] An application moved applied → interviewing → rejected counts in the
      interviewing step of the funnel.
- [ ] Median time to first response matches a hand count on test data.
- [ ] A quiet application can be given a follow-up date from the list.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Comparisons with other members, AI advice on the numbers, exporting the
insights.

## As built

- Breakdown dimensions are referral (with/without), job source
  (`LadderJob.sourcePlatform`) and program type (`LadderJob.programType`).
  The spec's seniority and company-size dimensions are **not built**: neither
  field exists on `LadderJob` or `LadderCompany`, and there is no schema change
  in this feature. A dimension with a single value is hidden; groups under 5
  applications show "too few to compare".
- Quiet-list actions reach the pipeline's own `updateApplication` through a
  route-local `createServerFn` (same session check, `doUpdateApplicationSchema`
  validation and ownership scoping as `pipeline.tsx`; like the pipeline, no
  extra rate limit). The read is `GET /api/rmhladder/insights` (contract +
  `implement()`, `read` rate limit, reads capped at 2,000 applications and
  20,000 events).
- Weeks are Mondays in the member's `LadderUserPrefs.timezone` (default
  America/New_York); at most 52 weeks are charted.
