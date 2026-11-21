# 01 — RMHMusic practice log

Surface: `/rmhmusic/history` (full-screen app tier, inside the RMHMusic layout
route). Wave 1. Namespace `music-history`. No dependency inside the sprint;
reuses `components/ui/day-heatmap.tsx` and `components/ui/bar-chart.tsx` from
sprint 02.

## User story

As a member learning an instrument in RMHMusic, I want to see when and how long
I practised — each lesson, song, sprint and card review I finished, minutes per
day against my daily goal, and how my scores on a song changed — so that I can
keep a habit and see that I am improving, not just my single best score.

## Requirements elicitation

- **What exists (verified):** RMHMusic stores only bests and current state:
  `MusicLearnLessonProgress` (stars, best score), `MusicSongBest` (best score
  per song and mode), `MusicSprintBest` / `MusicSprintDaily` (best and one row
  per day of the daily sprint), `MusicLearnCard` (SRS state, overwritten on
  each review) and `MusicLearnProfile.dailyGoal`
  (`prisma/schema/rmhmusic.prisma`). The streak is the site-wide check-in
  (`checkIn` from `lib/streak.server.ts`, called in
  `lib/rmhmusic/learn/progress.server.ts`) and shows as `StreakChip`.
  **Nothing records an attempt**: a second play of a song with a lower score
  leaves no trace, and there is no page with practice over time. Writers:
  `lib/rmhmusic/api/rmhmusic.learn.lesson-complete.server.ts`,
  `rmhmusic.songs.best.server.ts`, `rmhmusic.sprint.server.ts`,
  `rmhmusic.sprint.freeplay.server.ts`, `rmhmusic.sprint.daily.server.ts`,
  `rmhmusic.learn.cards.server.ts`.
- **Decisions:** one append-only table of practice entries, written by the
  existing endpoints in the same request (no new client call for writing).
  The client adds an optional `durationMs` to the bodies it already sends;
  the server clamps it (0–2 h) and, when absent, records the entry with no
  duration (counted as an activity, not as minutes). Card reviews are batched:
  one entry per review session, not per card. Entries older than two years are
  pruned by a monthly job only if the table grows past budget — not in this
  feature (out of scope); the retention is unlimited like other personal
  history, and the member can clear it.

## Functional requirements

1. FR-1 Every finished lesson, song run, sprint (daily or free play) and card
   review session writes one `MusicPracticeEntry` with kind, reference id
   (lesson id, song id + mode, sprint level, `cards`), score where the activity
   has one, duration where known, and the time.
2. FR-2 `/rmhmusic/history` shows: minutes this week and last week; days this
   week that met the daily goal (`dailyGoal` counts activities, so the page
   shows "3 of 5 days with your goal met" and minutes separately); a year
   heatmap of minutes per day (activities per day when no minutes are known).
3. FR-3 A bar per day for the selected week (week selector: this week and the
   previous seven), minutes on the axis.
4. FR-4 Per song: a "Progress" view listing each attempt (date, mode, score)
   with a line of scores over time (`components/ui/line-chart.tsx`), reached
   from the history list and from the song page (`/rmhmusic/songs/$songId`).
5. FR-5 A recent-activity list, newest first, 30 per page with "Load more":
   date and time, what (lesson title, song title, sprint level, card review),
   score, duration.
6. FR-6 Filter the list by kind (all, lessons, songs, sprints, cards) with the
   shared `Tabs` primitive.
7. FR-7 "Clear history" (confirm dialog) deletes the member's entries; bests,
   lesson progress and the streak are untouched.
8. FR-8 A History link in the RMHMusic home (`LearnHome.tsx`, beside the tool
   cards) and in the song page header.

## Non-functional requirements

- **Performance:** the summary endpoint reads at most 400 days of entries for
  one member through the `(userId, createdAt)` index and aggregates in SQL
  (`date_trunc` by day in the member's time zone, passed as a validated IANA
  name); p95 under 150 ms for 5,000 entries. The list is cursor-paginated
  (`id` BigInt cursor).
- **Security:** session-only and owner-only; the song progress endpoint only
  returns the caller's own entries. `durationMs` and `score` are zod-bounded;
  the server never trusts a client-supplied `kind` or reference id beyond the
  existing endpoint's validation (the entry is written from the validated
  values the endpoint already has).
- **Privacy:** entries are personal; nothing appears on a profile or board.
  The account export includes them and account deletion deletes them, through
  `exportMusicData` and `musicErasureOps`.
- **Accessibility:** charts have a text alternative (a visually hidden table of
  the same numbers, as sprint 02's `FocusHistory.tsx` does); the week selector
  is a labelled `Select`; list rows are a real list.
- **i18n:** every string in `music-history`; dates and numbers through
  `Intl` with the active locale; RTL mirrors the bar chart direction the way
  the shared chart already does.
- **Steel (app tier, L8):** RMHMusic is a full-screen app and keeps its own
  look: use the `--app-*` contract (`components/shared/app-theme.css`) and the
  RMHMusic styles, as sprint 02's RMHStudy history did inside its app shell.
  One primary action per view (none is needed on the summary; "Clear history"
  is a secondary destructive button). Nothing animates at rest; arriving data
  fades in through `components/ui/arrive.tsx`.

## Data model and API

- New model in `prisma/schema/rmhmusic.prisma`:
  `MusicPracticeEntry { id BigInt @id @default(autoincrement()), userId String,
  kind String @db.VarChar(8) (lesson|song|sprint|cards), refId String
  @db.VarChar(80), mode String? @db.VarChar(8), score Int?, durationMs Int?,
  createdAt DateTime @default(now()) }`, relation to `User` with cascade,
  `@@index([userId, createdAt(sort: Desc)])`,
  `@@index([userId, kind, refId, createdAt])`,
  `@@map("music_practice_entry")`.
- Migration `20261123010000_s03_music_practice_log`.
- Pure `lib/rmhmusic/history.ts` (kinds, clamp, week bounds, goal-met days from
  per-day counts, merging minutes and counts for the heatmap);
  `lib/rmhmusic/history.server.ts` (`recordPractice`, `getPracticeSummary`,
  `listPractice`, `getSongProgress`, `clearPractice`); the entries join
  RMHMusic's own account hooks in `lib/rmhmusic/learn/account-data.server.ts`
  (`exportMusicData` and `musicErasureOps`, which the account export and
  `anonymizeAccount` already call); schemas `lib/rmhmusic/history-schema.ts`;
  contract `lib/rmhmusic/history.contract.ts`.
- Endpoints (registered modules under `lib/rmhmusic/api/`):
  `GET /api/rmhmusic/history` (summary; query `tz`, `week`),
  `GET /api/rmhmusic/history/entries` (query `kind`, `cursor`),
  `GET /api/rmhmusic/history/songs/$songId`, `DELETE /api/rmhmusic/history`.
- Writers: the six endpoints listed above call `recordPractice` after their
  existing write succeeds; a failure to record is logged and never fails the
  request.

## Testing requirements

- Main suite `lib/rmhmusic/__tests__/practice-log.test.ts`: each writer records
  exactly one entry with the validated values; a failing `recordPractice` does
  not fail the request; the entries and song endpoints never return another
  member's rows; `DELETE` deletes only the caller's rows.
- Main suite `lib/account/__tests__/music-practice-erasure.test.ts`:
  `musicErasureOps` (and so `anonymizeAccount`) deletes the member's entries,
  and `exportMusicData` includes them.
- Product suite `lib/rmhmusic/__tests__/history.product.test.ts`: week bounds
  across a DST change, goal-met days, minutes/count merge, clamp.

## Acceptance criteria

- [ ] Playing a song twice shows two attempts on its Progress view, the lower
      one included.
- [ ] A day with three finished lessons and no duration still shows on the
      heatmap as practised.
- [ ] Clearing history leaves stars, bests and the streak as they were.
- [ ] Deleting the account removes the entries (test).
- [ ] Day and Night of the app theme, 390 px and 1280 px, and `ar`.

## Out of scope

Practice reminders (the streak reminders exist), sharing a practice log,
recording audio, retention pruning.
