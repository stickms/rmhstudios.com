# 08 — RMHStudy streaks in local days, repaired history and break insights

Surface: RMHStudy rooms (`/rmhstudy/$roomId`), the landing and sprint 02's
`/rmhstudy/history`. Wave 7. Namespace `rmhstudy-streaks`. Depends on sprint
02's 06 (RMHStudy focus history) and its integration fixes.

## User story

As a member who studies with RMHStudy's Pomodoro rooms, I want my streak to
follow my own calendar days, to reflect the studying I did before the streak
bug was fixed, and to see which days kept it alive and how much break time I
take — so that the streak means something where I live and I can see whether I
take the breaks the method relies on.

## Requirements elicitation

- **What exists (verified on `main` after sprint 02):** sprint 02's integration
  fixed the old bug (the streak was read after the upsert stamped
  `lastStudyDate`, so it never passed 1): `persistMemberWorkSession` in
  `server/socket-server/handlers/rmhstudy.ts` now uses `nextStudyStreak` from
  `lib/rmhstudy/streak.ts`, and `persistBreak` adds break time to the latest
  session row. Three gaps remain:
  1. **UTC days.** `nextStudyStreak` counts UTC calendar days
     (`utcDay`), while the history page buckets days in the viewer's zone
     (`lib/rmhstudy/history.ts`, `dayKeyInZone` from `lib/study/stats`). A
     member in New York who studies at 21:00 on two evenings in a row can get
     the same UTC day or a skipped one, and the streak disagrees with the
     heatmap beside it.
  2. **Stored streaks from before the fix are wrong.** Every profile written
     before the fix has `currentStreak`/`longestStreak` of 1 however long the
     member studied; the stored values feed the profile
     (`lib/profile/app-profiles.server.ts`), the leaderboard index and the
     history header. Nothing recomputes them.
  3. **Breaks are recorded but not shown as insight:** the sessions list has
     a break column, but the week summary shows no break total or
     focus-to-break ratio, and the heatmap does not show which days counted
     toward the streak.
- **Decisions:** the client sends its IANA zone when joining a room; the hub
  validates it and stores it on `RmhStudyProfile.timeZone`; `nextStudyStreak`
  takes the zone and compares local day keys (UTC when none is stored). A
  pure `deriveStreak(dayKeys, todayKey)` computes current and longest streaks
  from session days, used by the history server (so the page is correct even
  where the stored value is stale) and by a backfill script that recomputes
  every profile's stored values once.

## Functional requirements

1. FR-1 The room join payload carries `timeZone`; the hub validates it
   (`isValidTimeZone` from `lib/calendar/tz.ts`) and stores it.
2. FR-2 `nextStudyStreak(previous, now, timeZone)` compares local day keys in
   the stored zone; DST changes never make a day count twice or be skipped.
3. FR-3 `/rmhstudy/history` shows the streak derived from session days in the
   viewer's zone, the longest streak, and marks streak days on the year
   heatmap (in each cell's accessible name: "12 March: 50 minutes, streak
   day").
4. FR-4 The week summary adds total break time and the focus-to-break ratio
   ("1 minute of break for every 5 of focus"), with "—" for weeks whose rows
   predate break tracking.
5. FR-5 The landing shows "Study today to keep your 4-day streak" when today
   has no session yet and yesterday did.
6. FR-6 `scripts/rmhstudy/recompute-streaks.ts` recomputes `currentStreak` and
   `longestStreak` for every profile from its sessions in its stored zone (UTC
   when none): idempotent, batched, `--dry-run`. Integration runs it once after
   deploy.

## Non-functional requirements

- **Correctness:** `deriveStreak` and the zoned `nextStudyStreak` are pure and
  tested across DST, a zone change, midnight and today-not-yet-studied; both
  agree for the same sessions.
- **Performance:** the history server derives the streak from at most 400
  distinct days it already aggregates (no extra query beyond the day keys); the
  script processes profiles in batches of 500.
- **Security:** the zone is validated before storage or use in SQL (it is
  passed as a bound value, as `history.server.ts` already does).
- **Accessibility:** streak days are announced in the cell's name, not only
  marked visually; the ratio is a sentence.
- **i18n:** strings in `rmhstudy-streaks`.
- **Steel (app tier):** RMHStudy is full-screen; keep the look sprint 02's
  history uses.

## Data model and API

- `RmhStudyProfile.timeZone String? @db.VarChar(40)` in
  `prisma/schema/rmhstudy.prisma`. Migration
  `20261123070100_s03_rmhstudy_timezone`.
- `lib/rmhstudy/streak.ts`: `nextStudyStreak` gains the zone;
  `deriveStreak(dayKeys, todayKey)` and `longestRun(dayKeys)` added.
- `server/socket-server/handlers/rmhstudy.ts`: join stores the zone;
  `persistMemberWorkSession` reads it and passes it on.
- `lib/rmhstudy/history.server.ts`, `history.ts`, `history.contract.ts`:
  `streakDays`, derived streaks, weekly break total.
- `scripts/rmhstudy/recompute-streaks.ts`.

## Testing requirements

- Main suite `server/socket-server/handlers/__tests__/rmhstudy-streak.test.ts`:
  the join stores only a valid zone; two sessions on consecutive local days in
  New York at 21:00 give a streak of 2.
- Product suite `lib/rmhstudy/__tests__/streak.product.test.ts`: zoned
  `nextStudyStreak` and `deriveStreak` across DST, zone change, midnight,
  today-not-yet-studied, and agreement between the two.
- Script test `lib/rmhstudy/__tests__/recompute-streaks.test.ts` with a fake
  database: idempotent; `--dry-run` writes nothing.
- Keep the existing `lib/rmhstudy/__tests__/*` and
  `server/socket-server/handlers/__tests__/rmhstudy-window.test.ts` green.

## Acceptance criteria

- [ ] Two evening sessions on consecutive local days give a 2-day streak in
      any zone.
- [ ] After the script runs, a member who studied five days in a row before
      the fix shows a 5-day longest streak.
- [ ] The week summary shows break time and the ratio.
- [ ] 390 px and 1280 px, and `ar`.

## Out of scope

Streak freezes, a site-wide merge of streak systems (consolidation audit,
Tier 2), solo timers outside rooms.

## As built (review notes)

- **Streaks carry no value.** `currentStreak`/`longestStreak` are only displayed (the
  app profile card in `lib/profile/app-profiles.server.ts`, the history header,
  the landing prompt, the account export); nothing awards coins, achievements or
  leaderboard rank from them. So a member who changes the stored zone only
  changes which local day their own real sessions fall on; no zone-switch guard
  is added. If a streak ever earns something, limit `timeZone` changes (for
  example once per 30 days) in `rememberTimeZone` first.
- The join stores a zone only when `validTimeZone` accepts it (string, at most
  40 chars, known to `Intl`); junk is ignored and the join proceeds.
- The history page derives streaks from real session days; the stored longest
  streak still counts for runs older than the 400-day window.
- **Running the backfill once in production (owner, after the migration deploys):**
  `pnpm exec tsx scripts/rmhstudy/recompute-streaks.ts --dry-run` prints each
  change and a summary without writing; rerun without `--dry-run` to write.
  Idempotent (profiles already right are not written), batched by 500, never
  lowers `longestStreak`, sets `currentStreak` as of now in each profile's own
  zone (a lapsed streak becomes 0), skips profiles with no sessions.
