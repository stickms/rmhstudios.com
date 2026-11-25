# 04 — Play the chart you pick in Slice It, and see where players miss

Surface: Slice It song details (the chart picker now chooses what is played), the run's results, the chart editor's
timeline and note inspector (a miss-rate tint for the chart's author). Wave 3. Namespace `chart-misses`. App tier (L8).

## User story

As a Slice It player, I want the chart I pick on a song to be the chart I play, so that members' published charts are
playable at all. As a chart author, I want to see where on the timeline players miss my chart, so that I can fix the bar
nobody can hit.

## Requirements elicitation

- **What exists (verified):**
  - Songs have charts: `Chart` (`prisma/schema/games/slice-it.prisma`: `notes`, `chartHash`, `status` draft | public,
    `rankStatus`, `authorId`, `isGenerated`) listed by `features/slice-it/engine/charts.server.ts`, whose header says
    "The `Chart` model added a second shape without connecting it to the play path". `ChartPicker.tsx` renders on the
    song details panel (`features/slice-it/ui/SongDetailsPanel.tsx`) and sets `selectedChartId` in
    `features/slice-it/engine/store.ts` — and **nothing reads `selectedChartId`**: the engine always plays the song's
    generated `analysisData`, and `ScoreSubmissionZ` (`features/slice-it/engine/api-schemas.ts`) says `chartId` is
    "absent for every run today".
  - The server half is ready: `features/slice-it/api/slice-it.score.server.ts` resolves a submitted `chartId` against
    the song (`resolveChart`) and stores `chartId` and `chartHash` on the run; `isRankedChart` in
    `features/slice-it/engine/ranking.server.ts` ("whether a submission on this chart should move the player's skill
    rating") has no caller; a public chart is readable by anyone through `GET /api/slice-it/charts/$id`
    (`slice-it.charts.$id.server.ts`; a draft is 404 to anyone but its author).
  - The miss heatmap (`O1`) is written and never called: `recordNoteStats` and `chartHeatmap` in
    `features/slice-it/engine/ops.server.ts`, sampled one run in ten by `shouldSampleRun`, bucketed by `missHeatmap`
    (`features/slice-it/engine/chart-health.ts`) into `SliceNoteStat` (keyed by chart, hash and note time). The editor
    waits on it: `TODO(phase 8 — §4.4b)` in `features/slice-it/ui/editor/Timeline.tsx` and `NoteInspector.tsx`.
  - The playtest already turns chart notes into engine slices (`toSlices`, `features/slice-it/engine/editor/types.ts`,
    used by `editor/playtest.ts`), so the play path needs no second converter.
- **Decisions:**
  - **What is played:** the picked chart when it is public (or the player's own draft, played as a playtest would be:
    never submitted); the generated chart when nothing is picked or the picked chart is gone. The session loads the
    chart's notes with the existing public read and plays them with `toSlices`.
  - **What a chart run counts for:** the run is recorded (a `SliceRun` with `chartId` and `chartHash`) and earns its
    usual career totals. **It never writes the song's board (`SongLeaderboard`)**: the board key (`songId,
    difficulty, modPool, userId`) has no chart dimension, so a member chart's run would overwrite the player's best on
    the generated chart. The results screen says "Played on {{chart}} — not on the song's board". (A per-chart board
    is out of scope; the decision is recorded in the README.)
  - **Found in validation — the skill rating reads the board.** `collectContributions`
    (`features/slice-it/engine/rating.server.ts`) builds the rating from `SongLeaderboard` rows with a ranked `chartId`,
    and the score route schedules a recompute only on `isNewBest`, which it computes from the board row. Keeping chart
    runs off the board would leave ranked charts unable to move anyone's rating. So: `collectContributions` reads the
    player's runs instead (`SliceRun` where `userId`, `modPool: 'none'`, `cleared: true`, `chartId` not null and the
    chart `rankStatus: 'ranked'` with a rating; best accuracy per chart, the existing reduce; `@@index([userId,
    chartId, createdAt])` serves it, bounded by the existing `SKILL_CONTRIBUTION_CAP * 4` take ordered by chart
    rating), and for a chart run `isNewBest` is decided against the player's previous best `SliceRun` on the same
    `chartId` and `difficulty` and `modPool` (`score` greater). The inline `chartRankStatus === 'ranked'` condition
    stays as the gate (it already has the chart row loaded; `isRankedChart` stays unused rather than adding a second
    read). Today no run carries a `chartId` (the picker is unread), so no existing contribution changes.
  - **Misses:** the run summary gains `missedNoteMs` (the times of the notes the engine judged as misses, rounded to
    milliseconds, at most the chart's note count) and `noteCount`; the score route validates them against the resolved
    chart's own note times (an unknown time is dropped, a run whose count does not match the chart records nothing)
    and calls `recordNoteStats` fire-and-forget after the response is decided, never failing a submission. The
    outcomes passed are **every** note of the chart (attempted), each marked missed when its time is in the validated
    list, so `attempts` per note equals the sampled runs. Only **cleared** runs with a chart identity are recorded (a
    failed run never reached its later notes, which would otherwise count as hits; the generated chart has no
    identity). "Based on N sampled runs" reads N as the largest `attempts` among the chart's current-hash rows.
  - **Who sees the heat:** the chart's author, in the editor, for the chart's current hash ("Based on N sampled runs";
    nothing shown under 5 sampled runs). Through `GET /api/slice-it/charts/$id/misses` (author only; 404 otherwise).
  - **Tint:** a row of buckets under the timeline in the app tier's own palette, its strength in four steps by miss
    rate, with a text value on hover and focus, plus the selected note's own rate in the inspector. No animation.

## Functional requirements

1. FR-1 Play path: `SongDetailsPanel.tsx` / the session (`features/slice-it/engine/session.ts`, `engine.ts`) load the
   picked chart's notes (`GET /api/slice-it/charts/$id` through its contract) and play them; the run summary
   (`useSubmitScore.ts` `RunSummary`) carries `chartId`, `missedNoteMs` and `noteCount`.
2. FR-2 `ScoreSubmissionZ` gains `missedNoteMs: number[]` (max 5,000, integers) and `noteCount`; the score route keeps
   chart runs off `SongLeaderboard`, decides `isNewBest` for a chart run from `SliceRun`, keeps the ranked-chart gate
   on the recompute, and calls `recordNoteStats` (cleared runs only) after validating the times against the chart
   (pure validator in `features/slice-it/engine/miss-times.ts`, new). `rating.server.ts` `collectContributions` reads
   `SliceRun` as decided.
3. FR-3 `GET /api/slice-it/charts/$id/misses` (registered module `features/slice-it/api/slice-it.charts.$id.misses.server.ts`,
   `rateLimit: 'read'`, author only), returning `chartHeatmap` buckets, the sampled-run count and per-note rates for
   the current hash.
4. FR-4 Editor: `Timeline.tsx` (the heat row where the TODO is), `NoteInspector.tsx` (the note's miss rate), read
   through `features/slice-it/engine/editor/api-client.ts`; the TODOs are removed.
5. FR-5 Results: the "not on the song's board" line for a chart run.

## Non-functional requirements

- **Integrity:** a forged `missedNoteMs` can only skew a sampled statistic its author reads, never a board, a rating or
  coins; times are checked against the chart; the sample is one in ten.
- **Board safety:** no chart run ever writes `SongLeaderboard` (a test).
- **Performance:** the misses read is one indexed query (`SliceNoteStat` `@@index([chartId, chartHash, noteMs])`); the
  play path adds one chart read when a chart is picked.

## Data model and API

No schema change (`SliceNoteStat` exists). `POST /api/slice-it/score` gains two optional fields;
`GET /api/slice-it/charts/$id/misses` → `{ chartHash, sampledRuns, buckets: HeatmapBucket[], notes: { noteMs, rate }[] }`.

## Testing requirements

- Main suite `features/slice-it/api/__tests__/score-chart-runs.test.ts`: a chart run never writes `SongLeaderboard`;
  a ranked chart's new best schedules the recompute and a non-best or an unranked chart's run does not; misses are
  recorded only for a sampled, cleared run with a chart; a bad time is dropped; a failure in recording never fails the
  submission.
- Main suite `features/slice-it/engine/__tests__/rating-contributions.test.ts`: `collectContributions` reads the best
  cleared `none`-pool run per ranked chart from `SliceRun`, ignores unranked charts, other pools and uncleared runs.
- Main suite `features/slice-it/api/__tests__/chart-misses.test.ts`: author only (404 for others and for drafts of
  others); the current hash only; under five sampled runs returns no buckets.
- Product suite `features/slice-it/engine/__tests__/miss-times.product.test.ts`: validation against chart times.
- `features/slice-it/ui/editor/__tests__/heat-row.test.tsx` (`renderToStaticMarkup`): steps and text values.

## Acceptance criteria

- [ ] Picking a member's public chart and playing plays that chart's notes.
- [ ] The run's result says it is not on the song's board, and the board is unchanged.
- [ ] A new best on a ranked chart still moves the player's skill rating.
- [ ] After enough sampled runs, the chart's author sees a tint where players miss, and a note's miss rate.
- [ ] Another member cannot read a chart's misses.

## Out of scope

A board per chart, showing misses to players, the generated chart's heat (it has no identity), the waveform strips.
