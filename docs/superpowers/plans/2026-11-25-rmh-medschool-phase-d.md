# RMH Med Schools phase D: private applicant stats and the AI school-list builder

Roadmap item 11, phase D (the redesign plan's section 5, `2026-11-24-rmh-medschool-redesign.md`). This plan replaces
that section where they differ: the owner's decisions of 2026-11-24 below are binding and override it (the redesign
plan's "Owner answers" item 4 said the last generated list is saved; now a generated list is saved only when the member
presses "Save as a list", into an ordinary `MedSchoolList`).

## Owner decisions (2026-11-24, binding)

1. **Stats are private only.** Stored for the member alone, shown to them, sent to the model only when they ask for a
   list with "Use my stats" ticked. Never aggregated, never public, never in any public endpoint or cache. Deleted with
   the account (erasure op, registry, `pnpm docs:deletion`).
2. **Grounded in public data plus the member's own stats and request.** Every suggested school links to the figures it
   used. No invented numbers: the Ask validator's rules (`engine/qa/ground.ts`); the member's own stats are citeable
   facts the member supplied, labelled as theirs ("Your MCAT").
3. **Labels with reasons, no percentages.** Reach / target / likely, computed in code from the member's MCAT and GPA
   against each school's PUBLISHED class figures (the class profiles of phase C step 2; nothing else makes a
   comparison), with the comparison shown ("Your MCAT 512 vs the class's median 517"). A school with no published figure
   is "Not enough published data", never guessed. The model never assigns a label; it picks among candidates and
   explains.
4. **A built list is saved privately into the member's lists** (`MedSchoolList`), only when the member presses save.

## Data model (additive migration `20261211090000_medschools_applicant_stats`)

| Model                   | Key / FK                                   | Columns                                                                                                                                                                                                                                           |
| ----------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MedApplicantProfile`   | `userId` (PK, `User` cascade)              | `gpaCumulative`, `gpaScience` (Float?, 0.00-4.00), `gpaPostbacc`, `gpaGraduate` (Float?), `postbaccType` (`FORMAL` / `INFORMAL`), `graduateType` (`SMP` / `MASTERS` / `OTHER`), `missions` (String[]), `publications`, `presentations` (Int?), `onboardedAt` (DateTime?), `createdAt`, `updatedAt` |
| `MedMcatAttempt`        | `profileId` -> profile (cascade)           | `year`, `month` (Int), `day` (Int?), `total`, `cpbs`, `cars`, `bbls`, `psbb` (Int?), `position`                                                                                                                                                   |
| `MedApplicantHours`     | `profileId` (cascade), unique `[profileId, category]` | `category` (VarChar 24), `hours` (Int?), `note` (VarChar 300, nullable)                                                                                                                                                             |
| `MedApplicantActivity`  | `profileId` (cascade)                      | `category`, `title` (VarChar 80), `hours` (Int?), `note` (VarChar 300, nullable), `position`                                                                                                                                                      |

- Only `MedApplicantProfile` carries `userId` (it joins `USER_OWNED` in `engine/schema.test.ts`); the children reach
  their owner through the profile and carry no `userId`. The schema test pins every column of the four models.
- **Home state is not duplicated:** it stays `MedUserPrefs.homeState` (the home-state preference). `me/stats` reads it
  and its PUT writes it there.
- `onboardedAt` is set by "Skip for now" or by the first save; a member with no row has onboarding pending.
- Categories: `CLINICAL`, `RESEARCH`, `VOLUNTEER_CLINICAL`, `VOLUNTEER_NONCLINICAL`, `SHADOWING`, `LEADERSHIP`,
  `TEACHING`. Missions: `research`, `primary-care`, `rural`, `underserved`, `urban`, `global-health`, `public-health`,
  `academic-medicine`.

**Validation (strict zod, `api/stats-schemas.ts`, pure `engine/applicant.ts`).** Every field optional. MCAT: each
section 118-132, total 472-528, an attempt needs a total or all four sections, the total equals the sum when all four
are given (a missing total with four sections is the sum), at most 8 attempts; year 2010-2100, month 1-12, day valid
for the month. GPA 0.00-4.00, at most two decimals. Hours 0-20000 each; notes at most 300 characters, no control
characters; at most 10 activities per category, 40 in all; publications and presentations 0-500. Unknown keys refused
(`.strict()`).

## Endpoints (contracts + `implement()` + `apiRoute`, all `me/**`, signed in, no `cache`)

| Path                                   | Method        | What                                                                                                        |
| -------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------- |
| `/api/medschools/me/stats`             | GET           | The caller's stats (`null` profile when none) and `onboarding: 'pending' \| 'done'`. Read limit.            |
| `/api/medschools/me/stats`             | PUT           | Replace the stats (one transaction under `med-stats:<user>`), mark onboarding done. Write limit.            |
| `/api/medschools/me/stats`             | DELETE        | Remove every stat (the row and its children); onboarding stays done. Write limit.                           |
| `/api/medschools/me/stats/onboarding`  | PUT           | `{ state: 'skipped' }`: remember "Skip for now". Write limit.                                               |
| `/api/medschools/me/list-builder`      | POST          | Build a list: the Q&A gates, two model calls, grounded result. Nothing stored. `ai` limit 6/min.           |
| `/api/medschools/me/list-builder/save` | POST          | `{ name, items: [{ slug, program }] }`: one new list with those schools. Write limit. Caps 20 / 200.        |

No DTO carries a user, row or attempt id (the stats DTO lists attempts and activities in order, without ids).

## The builder: server flow

1. **Gates (as Ask):** suspended 403; `isAiConfigured` 503; `admitQuestion` (shared monthly pause, the member's own
   allowance, the day's question and the in-flight lease; the admin bypass); `runUnderLease` with `qaDeadlineMs(think)`
   and the request's signal; the thinking switch (`think`, answer call only, `MEDSCHOOLS_QA_THINKING`). One build is one
   of the day's Q&A questions.
2. **Route call** (prompt `MEDSCHOOLS_LIST_ROUTE`, temperature 0): `{ intent: 'list' | 'other', states, regions, degree,
   mdphd, size, missions, count, homeState }`, hand-validated (`engine/builder/route.ts`; junk is `other`). Regions are
   the four Census regions, mapped to states in code. `other` ends before the second call (status `declined`).
3. **Candidates in code, public data only** (`api/builder/candidates.server.ts` reads; `engine/builder/candidates.ts`
   selects, pure): active schools of the degree; the states (the asked states and regions); MD-PhD only where the
   school's MD-PhD row says it has a program; size by the newest class's published class size (small under 125, large
   200 and over; a school with no class size is left out of a size filter). Missions rank, never filter: `research`
   puts schools with an MD-PhD program or an NIH MSTP listing first; other missions have no public data and are
   returned as `unused`. Then schools with published MCAT/GPA figures before those without, then by name; at most 40
   candidates. The reader imports no tracker, list or stats module (boundary test) and takes the member's comparison
   figures as plain numbers.
4. **Labels in code** (`engine/builder/label.ts`, below), per candidate, before the model is asked.
5. **Answer call** (prompt `MEDSCHOOLS_LIST_ANSWER`): `{ request, count, candidates: [{ id, name, state, label,
   facts: [{ ref, label, text }] }], member: [{ ref, label, text }] }` as data. The model returns
   `{ picks: [{ id, reason: { text, cites } }] }`. Picks are kept only when the id is a candidate, once, at most `count`
   (default 15, at most 30). A reason is kept only when `groundAnswer` keeps it against that candidate's facts plus the
   member's facts (and it cites only those); otherwise the school stays with no reason and the notice says some reasons
   were removed. An unreadable reply refunds the day's question and is `AI_UNAVAILABLE` (the import's rule); a readable
   reply with no valid pick is status `no-picks`.
6. **The response** groups picks by label (likely, target, reach, not enough published data; or one group "Not
   compared" when stats were not used), each with the comparison lines, the figures with their source (url, checked
   date, the school's Facts tab), the reason and its cites.

**What the model sees.** The request text (cleaned, 400 characters), the candidates' public names, states, labels and
public figures, and, only with "Use my stats" ticked: the most recent MCAT total and its month, the cumulative and
science GPA, the home state, the hours by category (totals only) and the mission chips. Never a note, an activity title,
a section score, another member's data, a tracker row, a list or a user id.

## The label rule (exact, `engine/builder/label.ts`)

> Revised 2026-11-25 (owner): the member's MCAT is now weighted by earlier attempts and MCAT is banded by AAMC
> percentile rank. The rule below is the original; "As built: weighted MCAT and percentile bands" at the end is current.

- **The member's figures.** MCAT: the total of the most recent attempt that has one (by year, month, day). GPA: the
  cumulative GPA. Nothing else.
- **The school's figures.** From the class profiles (source `SCHOOL_PROFILE`, program `REG`), in the order the Facts
  tab shows them (an undated "current" class, then newest first): the first class with a numeric MCAT or GPA figure.
  For each of MCAT and GPA the statistic is the median if published, else the mean, else the plain figure whose
  statistic the page does not name; a range is never used. Only figures with a parsed number (`valueNum`).
- **Per figure:** `diff = yours - theirs` (GPA in hundredths). MCAT: `diff >= 3` above, `diff <= -3` below, otherwise
  near. GPA: `diff >= 0.10` above, `diff <= -0.10` below, otherwise near.
- **Label:** no figure compared (the school publishes neither, or the member gave neither): **not enough published
  data**. Any compared figure below: **reach**. Both figures compared and both above: **likely**. Otherwise
  **target**. One compared figure can therefore give reach or target, never likely.
- Not a chance of admission; the page says: "Labels compare your MCAT and GPA with the class's published figures only.
  They are not a chance of admission."

## Privacy pins

- `engine/schema.test.ts`: the four models' exact columns; only the profile carries `userId`.
- `api/builder/privacy.server.test.ts`: the builder writes nothing (no Prisma write in its modules), declares no cache,
  logs no request text, no stat value and no reason (logs are counts and a status), and the model's user turn holds no
  note or activity title.
- `api/builder/boundary.test.ts`: no public reader (`api/read.server.ts`, `school-facts.server.ts`, `secondaries`,
  `live-*`, the forecast and rmh-publish jobs, `engine/stats`) imports the stats module or touches the stats models;
  the candidate reader imports no tracker, list or stats module.
- `testing/integration/medschools-builder.test.ts`: anonymous 401 with no public cache header on the new routes; a
  session with stats changes no public byte; the stats round trip and erasure; a build with the fake provider whose
  hostile reply (invented numbers, a planted link, an unknown id) is cut by the validator; nothing of the request is in
  any table afterwards; save makes a list.
- Erasure: `medschoolsErasureOps` deletes `MedApplicantProfile` (children by cascade); the registry entry; the export
  (`exportMedschools`) gains `stats`.

## UI

- `/med/stats` ("My stats", in the member menu): four sections (MCAT, GPA, Hours, About you), one Save (the ink
  primary), "Remove my stats". Under the title: "Add what you're comfortable sharing. It's private to you." With
  `?welcome=1` (the onboarding) the four sections are steps, one at a time, with Back, Next and "Skip for now".
- **Onboarding:** on `/med/lists` and `/med/lists/build`, while onboarding is pending, a note at the top: "Add what you're
  comfortable sharing. It's private to you." with "Add my stats" (to `/med/stats?welcome=1`) and "Skip for now"
  (remembered on the account). It never blocks "New list".
- `/med/lists/build` (link "Build a list with AI" on `/med/lists`): the request field, "Use my stats", the thinking
  switch where offered, "Build list"; the result grouped by label, each school a row with its crest, label, comparison
  lines, cited figures with `SourceRef`, the reason and a checkbox; "Save as a list" (named) is the ink primary once a
  result is shown.
- Strings `stats-*` and `builder-*`; app tier only (`.medapp-*`, a new partial `ui/medschools/stats-builder.css`).

## Tests

- Unit: `engine/applicant.test.ts` (ranges, sum, strict keys, dates); `engine/builder/label.test.ts` (every band edge,
  one figure, none, median over mean over plain, never a range); `engine/builder/route.test.ts`;
  `engine/builder/candidates.test.ts` (filters, regions, size, md-phd, research ranking, cap, public-only input);
  `engine/builder/facts.test.ts` + `api/builder/build.server.test.ts` (scripted runner: picks among candidates only,
  validator with the member's facts, invented numbers dropped, refund on unreadable, gates order, admin bypass, no logs
  of text); `api/stats.server.test.ts` (round trip, replace, onboarding, delete, foreign isolation); the erasure test;
  `api/builder/privacy.server.test.ts`, `boundary.test.ts`; UI tests for the label groups and the stats form.
- Integration: `testing/integration/medschools-builder.test.ts` (fake DeepSeek).

## As built: weighted MCAT and percentile bands (owner 2026-11-25)

The owner's words: "Most recent but maybe weigh it by past attempts slightly" and "Target band should use percentiles
… there are published MCAT percentiles online." This replaces the MCAT parts of "The label rule" above; the rest of
the rule is unchanged, and the model still never sets a label.

- **The table.** `data/medschools/mcat-percentiles.json`: AAMC, "Percentile Ranks for MCAT Total and Section Scores",
  the table in effect May 1, 2026 - April 30, 2027 (`https://www.aamc.org/media/89826/download`, linked as "Current
  Percentile Ranks for the MCAT Exam" from AAMC's page
  `https://www.aamc.org/services/mcat-admissions-officers/resources/percentile-ranks`; based on the 2023-2025 testing
  years, N = 305,494). Fetched once on 2026-11-25 (robots.txt allows `/media/`, the honest user agent), read with
  `pdftotext -layout`: the total table (472-528, 57 rows) and the four section tables (118-132, 15 rows each), every
  rank stored as printed ("<1" or a whole number). The PDF is not committed. `engine/mcat-percentile.test.ts` holds the
  header, coverage with no gaps and ranks that never fall; `pnpm exec tsx scripts/medschools/check-mcat-percentiles.ts
  <pdf>` re-reads the PDF by hand and fails on any difference. AAMC updates the table each May 1: download the new PDF,
  update the file (period, URL, rows), run the checker. No table in the database: `engine/mcat-percentile.ts` is a
  pure, client-safe lookup of the small file, imported only by the builder (its endpoint, and its page through
  `engine/builder/label.ts`); no route file and not `medschools.queries.ts`.
- **The member's MCAT for labels.** `0.8 x latest + 0.2 x mean(earlier totals)` when earlier attempts have a total,
  else the latest (`MCAT_WEIGHTS`), rounded to the nearest whole score (half up) for the lookup. "Latest" is
  `latestMcat` (by date, the later in the list on a tie); "earlier" every other attempt with a total
  (`earlierMcatTotals`). `statsForBuilder` carries the earlier totals for this only: the model's line is still the
  latest total and its month, so it never sees an earlier attempt or the weighted score.
- **MCAT band by percentile rank.** The member's score and the school's figure (median, else mean, else the plain
  figure, as before; a school's decimal mean is rounded to its nearest whole score for the lookup) are each looked up;
  `diff = yours - theirs` in percentile points: `> 5` above, `< -5` below, otherwise near, so exactly 5 either way is
  near (`MCAT_PERCENTILE_MARGIN`). "<1" counts as 0. A score with no rank in the table is `not-compared` and does not
  count towards the label (a range never reaches the comparison: it has no number).
- **GPA keeps its points band** (`>= 0.10` above, `<= -0.10` below): no official GPA percentile table is in scope.
- **What the page says.** The comparison line: "Your MCAT 512 (latest 514, earlier 505) · percentile rank 84 vs the
  class's median 517 · percentile rank 94" (the parenthesis only when there were earlier attempts); "... : not compared,
  because the figure has no rank in AAMC's percentile table" when not compared. "Your figures used" adds "MCAT used for
  labels: ...". Wherever a percentile appears, a `SourceRef` cites "Source: AAMC, Percentile Ranks for MCAT Total and
  Section Scores, May 1, 2026 – April 30, 2027" and links AAMC's page. The server returns structured data
  (`MedBuildComparisonDto.mcat`, `MedBuildMemberFactDto.forLabels`); the words are `builder-*` keys.
- **Tests.** `engine/builder/label.test.ts` (the weights, rounding at .5, band edges at exactly 5 and 6 points, "<1",
  out-of-table and decimal school figures, ranges, the weighted score being what is compared),
  `engine/mcat-percentile.test.ts`, `engine/applicant.test.ts` (`earlierMcatTotals`), `api/builder/build.server.test.ts`
  (the model never sees the earlier totals), `api/stats.server.test.ts`, `ui/builder/builder-ui.test.tsx` (the lines
  and the attribution).
