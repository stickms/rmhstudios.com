# 09 — RMHType daily challenge

Surface: RMHType (app tier, sign-in gated). Wave 3. Namespace `rmhtype-daily`.

## User story

As an RMHType player, I want one passage a day that everyone types, one scored
attempt, a daily leaderboard and a streak, so that I have a reason to come back
each day and a fair way to compare myself with friends.

## Requirements elicitation

- **What exists (verified):** races and solo tests; global solo leaderboards by
  difficulty; nothing daily (`custom-test.ts` mentions a future "daily custom"
  but nothing implements it). Daily formats exist elsewhere on the site
  (`/daily` puzzles, `DailyPuzzleScore`), so the pattern is familiar to members.
- **Decisions:** the run is timed by the **server**: Start records the start
  time; Finish computes elapsed time on the server, so a client cannot claim a
  faster time than the wall clock allows. The client reports correct and total
  keystrokes; the server rejects results faster than 250 wpm or slower than the
  15-minute window. One scored attempt: pressing Start uses it, and a started
  but unfinished attempt counts as not finished. Practice re-runs of today's
  passage are allowed after that and are not scored. The day is the UTC day, so
  the board is global and closes at the same instant for everyone.

## Functional requirements

1. FR-1 The passage for a day is chosen deterministically from the curated
   standard passages (`lib/rmhtype/sources.ts`): a seeded permutation of the
   list by year, so no passage repeats until the list is exhausted.
2. FR-2 `/rmhtype/daily`: before starting, the passage length and a reminder
   that Start uses the day's attempt; Start reveals the text and begins.
3. FR-3 Result: wpm, accuracy, time, rank today, and the streak (consecutive UTC
   days with a finished attempt).
4. FR-4 Leaderboard for today and yesterday: top 50, the viewer's own row, a
   Friends filter (the viewer plus people they follow, `getFollowingIds`).
5. FR-5 A share line (copy to clipboard) in the style of
   `lib/rmhtype/result-text.ts`: "RMHType daily 2026-11-22 · 84 wpm · 98%".
6. FR-6 A Daily entry on the RMHType landing showing whether today's attempt is
   done.

## Non-functional requirements

- **Integrity:** server-side timing; the start row is unique per user and day (a
  second Start returns the same start, never a fresh clock); finish is accepted
  once; keystroke counts must be consistent with the passage length.
- **Performance:** the leaderboard reads an index on `(day, wpm desc)`; cached
  for 30 seconds with `cached()` and invalidated by tag on each finish.
- **Accessibility:** as the solo page; rank and streak announced as text.
- **i18n:** strings in `rmhtype-daily`; the passage is English (`lang="en"`,
  `dir="ltr"`).
- **Design:** app tier (L8); no countdown animation (R5: the timer text updates
  in response to typing only).

## Data model and API

- New model `RmhTypeDailyEntry` in `prisma/schema/rmhtype.prisma`:
  `id String @id @default(cuid())`, `userId`, `day String @db.VarChar(8)`
  (`YYYYMMDD`), `passageId String`, `startedAt DateTime @default(now())`,
  `finishedAt DateTime?`, `wpm Float?`, `accuracy Float?`, `timeMs Int?`;
  `@@unique([userId, day])`, `@@index([day, wpm(sort: Desc)])`; cascades on
  user; `@@map("rmhtype_daily_entry")`.
- Migration `20261122030100_s02_rmhtype_daily`.
- Pure `lib/rmhtype/daily.ts` (`dayKey(date)`, `passageForDay(day, passages)`,
  `streakFrom(days)`, `plausible(result, passage)`).
- Server `lib/rmhtype/daily.server.ts`; contract
  `lib/rmhtype/daily.contract.ts`; endpoints `GET /api/rmhtype/daily` (today's
  state for the viewer), `POST /api/rmhtype/daily/start`,
  `POST /api/rmhtype/daily/finish`,
  `GET /api/rmhtype/daily/leaderboard?day=&scope=`.
- Route `app/routes/rmhtype/daily.tsx`, `EXCLUDED_ROUTES` `'auth-gated'`.

## Testing requirements

- Product suite `lib/rmhtype/__tests__/daily.product.test.ts`: no repeat until
  the list is exhausted; the same day gives the same passage; streaks across
  month and year ends.
- Main suite `lib/rmhtype/__tests__/daily-integrity.test.ts`: a second start
  keeps the first `startedAt`; finish uses server elapsed time; a claimed 400
  wpm is rejected; finish twice is rejected; finishing after 15 minutes stores
  no score.

## Acceptance criteria

- [ ] Two members see the same passage on the same UTC day.
- [ ] Reloading during a run does not restart the clock.
- [ ] The leaderboard ranks by wpm, ties by accuracy then earlier finish.
- [ ] The Friends filter shows only the viewer and people they follow.
- [ ] Streak increments on consecutive days and resets after a missed day.

## Out of scope

Coins or achievements for daily runs (a later economy decision), per-time-zone
days, multiplayer daily races.
