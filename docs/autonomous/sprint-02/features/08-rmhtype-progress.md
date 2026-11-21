# 08 — RMHType progress over time

Surface: RMHType (app tier, sign-in gated). Wave 2. Namespace
`rmhtype-progress`. Creates the shared `components/ui/line-chart.tsx`.

## User story

As a regular RMHType player, I want to see my typing speed and accuracy over
weeks and months, my personal bests for each passage length and difficulty, and
my recent runs, so that I can tell whether practice is making me faster.

## Requirements elicitation

- **What exists (verified):** every race and solo run is stored
  (`RmhTypeMatch` + `RmhTypeMatchPlayer` with wpm, accuracy, time, rank;
  `isSolo`, `passageLength`, `difficulty` on the match). `RmhTypeProfile` keeps
  only running aggregates (best, average, streaks). The stats panel
  (`components/rmhtype/TypingStats.tsx`) shows those aggregates and the key
  heatmap; **no history, trend or per-run list is shown anywhere.**
- **Decisions:** the page reads existing rows only. Trends are per-day medians
  with a 7-point rolling average, because single runs are noisy and a mean is
  pulled by one bad run. Custom and practice runs are not in `RmhTypeMatch`, so
  the page covers races and standard solo runs, and says so.

## Functional requirements

1. FR-1 `/rmhtype/progress` with a range selector (30 days, 90 days, 1 year,
   all).
2. FR-2 A line chart of daily median wpm with the rolling average; a second of
   accuracy; a toggle for solo, races, or both.
3. FR-3 Summary: runs in range, median wpm, change versus the previous range
   ("+6 wpm"), best run, consistency (interquartile range).
4. FR-4 Personal bests per passage length × difficulty, each linking to its
   date.
5. FR-5 Recent runs: newest first, 25 per page; date, mode, length, difficulty,
   wpm, accuracy, rank (races).
6. FR-6 A Progress link in the RMHType header.
7. FR-7 The shared chart component: inline SVG, axes with locale-formatted
   ticks, a hover or focus readout per point, a "Show as table" toggle, ink from
   a CSS custom property so site-tier pages can reuse it.

## Non-functional requirements

- **Privacy:** own runs only.
- **Performance:** server-side bucketing (SQL `percentile_cont` per day, viewer
  time zone validated), at most 5,000 rows scanned per request through an index
  on `(userId, createdAt desc)` on `rmhtype_match_player`; the chart renders at
  most 400 points.
- **Accessibility:** the chart is `role="img"` with a text summary; every point
  is reachable in the table view; the focus readout is announced politely.
- **i18n:** strings in `rmhtype-progress`; numbers and dates via `Intl`.
- **Design:** app tier (L8); flat strokes, no animation, no gradients.

## Data model and API

- `RmhTypeMatchPlayer`: add `@@index([userId, createdAt(sort: Desc)])`.
- Migration `20261122020100_s02_rmhtype_progress_index`.
- Pure `lib/rmhtype/progress.ts` (rolling average, IQR, change vs previous,
  bests table).
- Server `lib/rmhtype/progress.server.ts`; contract
  `lib/rmhtype/progress.contract.ts`; endpoints
  `GET /api/rmhtype/progress?range=&mode=&tz=` and
  `GET /api/rmhtype/progress/runs?cursor=`.
- Route `app/routes/rmhtype/progress.tsx`, `EXCLUDED_ROUTES` `'auth-gated'`.
- `components/ui/line-chart.tsx` (shared, presentational, no data fetching).

## Testing requirements

- Product suite `lib/rmhtype/__tests__/progress.product.test.ts`: rolling
  average at the edges; IQR with fewer than four runs; change versus previous
  with an empty previous range; bests pick the highest wpm and break ties by
  accuracy.
- Main suite `lib/rmhtype/__tests__/progress-scope.test.ts`: queries are scoped
  to the session user.

## Acceptance criteria

- [ ] A member with 40 runs over two months sees a trend line and a table that
      agree.
- [ ] Switching to Races hides solo runs from chart, summary and list.
- [ ] Personal bests match the best rows in the list.
- [ ] Keyboard focus on the chart reads out a point's date and value.
- [ ] Usable at 390 px and 1280 px in the RMHType shell.

## Out of scope

Comparing with friends, exporting runs, custom-test history.
