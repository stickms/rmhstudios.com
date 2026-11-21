# 06 — RMHStudy focus history and weekly goal

Surface: RMHStudy (`/rmhstudy`, full-screen app tier). Wave 4. Namespace
`rmhstudy-focus`. Reuses `components/ui/day-heatmap.tsx` and
`components/ui/bar-chart.tsx` from 05.

## User story

As someone who uses RMHStudy's focus rooms and Pomodoro timer, I want to see how
much I focused each day and week, my longest sessions and whether I am on track
for a weekly goal I set, so that the time I put in is visible and I keep the
habit going.

## Requirements elicitation

- **What exists (verified):** the socket hub
  (`server/socket-server/handlers/rmhstudy.ts`) writes an `RmhStudySession` row
  for every completed run (`focusTimeMs`, `breakTimeMs`, `sessionsInRun`,
  `startedAt`, `endedAt`) and keeps `RmhStudyProfile` totals and streaks. **No
  page reads the sessions**: they are only written (the profile totals surface
  in `lib/profile/app-profiles.server.ts`). The landing
  (`components/rmhstudy/RmhStudyLanding.tsx`) has no history.
- **Decisions:** history is a new page inside the RMHStudy shell, so it keeps
  the app tier's look (L8, `--app-*`). The goal is minutes per week (30 to
  3,000, or none). Days and weeks are bucketed in the viewer's time zone.

## Functional requirements

1. FR-1 `/rmhstudy/history`: total focus this week and last week, the weekly
   goal with progress ("4 h 10 m of 6 h"), and the current streak from the
   profile.
2. FR-2 A bar per day for the current week and the previous seven weeks (a week
   selector), minutes on the axis.
3. FR-3 A year heatmap of focus minutes per day.
4. FR-4 Records: longest single run, best day, best week, total sessions.
5. FR-5 A sessions list, newest first, 20 per page: date, start time, focus,
   break, Pomodoros in the run, room (if it still exists).
6. FR-6 Set, change or clear the weekly goal from the page.
7. FR-7 A History link in the RMHStudy header and on the landing.

## Non-functional requirements

- **Privacy:** own data only; nothing is shown to other members.
- **Performance:** one aggregate query per range (SQL `date_trunc` in the
  validated time zone), bounded to 400 days; the sessions list uses keyset
  pagination on `(userId, startedAt desc)` — add that index.
- **Accessibility:** charts have hidden tables and a text summary; the goal
  field is a labelled number input with hours and minutes spelled out in the
  summary.
- **i18n:** strings in `rmhstudy-focus`; durations formatted with
  `Intl.NumberFormat` unit style (`hour`, `minute`) where supported, a plain
  fallback otherwise.
- **Design:** app tier (L8) — the RMHStudy shell's `--app-*` palette, not the
  site tokens; still flat, no idle animation (R5), and the shared chart
  components get their ink through their custom property.

## Data model and API

- `RmhStudyProfile`: add `weeklyGoalMinutes Int?`.
- `RmhStudySession`: add `@@index([userId, startedAt(sort: Desc)])`.
- Migration `20261122040000_s02_rmhstudy_focus_history`.
- Pure `lib/rmhstudy/history.ts` (week boundaries, goal progress, records,
  duration formatting inputs).
- Server `lib/rmhstudy/history.server.ts`; contract
  `lib/rmhstudy/history.contract.ts`; endpoints
  `GET /api/rmhstudy/history?tz=&weekOffset=`,
  `GET /api/rmhstudy/history/sessions?cursor=`, `PUT /api/rmhstudy/goal`.
- Route `app/routes/rmhstudy/history.tsx` (inside the auth-gated layout),
  `EXCLUDED_ROUTES` `'auth-gated'`; head `noindexHead('Focus History')`.

## Testing requirements

- Product suite `lib/rmhstudy/__tests__/history.product.test.ts`: week
  boundaries across DST and the locale's first day; a run crossing midnight
  counts on its start day; goal progress caps at 100 % for the bar but reports
  the true number.
- Main suite `lib/rmhstudy/__tests__/goal.test.ts`: goal bounds enforced; the
  history query is scoped to the session user.

## Acceptance criteria

- [ ] After a 25-minute focus run, today's bar and "This week" grow by 25 m.
- [ ] Setting a 6 h goal shows progress immediately; clearing it hides the bar.
- [ ] The sessions list pages without duplicates.
- [ ] Readable in the RMHStudy shell on a 390 px phone and at 1280 px.

## Out of scope

Subject tagging of sessions, sharing a weekly report, leaderboards.

## Session timestamps (review fix)

The hub writes one row per completed work phase, as it completes: `endedAt` is
that moment and `startedAt` is `endedAt` minus the focus length (a pause makes
it approximate). `breakTimeMs` stays 0 because the break follows the row's
write. Rows from before this fix have a null `endedAt` and a `startedAt` that
is really the end time; the history treats them as finished runs on that
approximate day rather than dropping them.
