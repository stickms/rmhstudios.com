# 07 — Hear back when a puzzle you reported is reviewed, and when a jam you entered moves its deadlines

Surface: `/admin/daily-puzzles` (a review action on a day's reports), the member's inbox, a jam's page and the inbox
for its entrants. Wave 5. Namespace `fix-notices`. Site tier (Steel) for the admin page and the inbox; the daily
desk's report entry (app tier) shows the outcome.

## User story

As a member who reported that a daily puzzle had two right answers, I want to hear what the team concluded, and as a
member who entered a game jam, I want to be told when its deadlines move, so that a report does not vanish into
silence and a deadline does not change under me unseen.

## Requirements elicitation

- **What exists (verified):**
  - Puzzle reports (sprint 14 06): `DailyPuzzleReport` (`prisma/schema/games.prisma`: one per member, mode and day;
    `kind`, `note`), filed from `components/daily-puzzles/ReportPuzzleDialog.tsx`, listed per day on
    `/admin/daily-puzzles` (`app/routes/_site/admin/daily-puzzles.tsx`, `components/admin/DailyPuzzlesAdmin.tsx`, reads
    in `lib/admin/api/admin.daily-puzzles.server.ts`), with Generate and Replace for future days only. A played day can
    never be replaced, so a report about it ends nowhere: nothing records a review and nobody is told. Sprint 14
    recorded "telling reporters a puzzle was fixed" as a follow-up.
  - Jam edits (sprint 14 14): `updateJam` (`lib/competitive/jams.server.ts`) through `PATCH /api/jams/$slug`
    (`lib/competitive/api/jams.$slug.server.ts`), phase rules in `lib/competitive/jam-edit.ts`, one audit row per save
    naming the changed fields. After the start only the description and **later** deadlines can change, and nobody is
    told. Sprint 14 recorded "notifying jam entrants of an edit" as a follow-up.
  - Entrants are `GameJamEntry.userId` plus accepted `GameJamTeamMember` rows (`prisma/schema/competitive.prisma`).
  - Notices are keys (`notice()`, `lib/notifications/notice-keys.ts`), previews in `components/feed/notice-previews.ts`,
    labels in `components/feed/notification-labels.ts`; `*At` params are formatted in the reader's locale.
- **Decisions:**
  - **Puzzle review:** an admin marks a mode-day's open reports reviewed with one outcome for all of them — `fault`
    ("You were right: the puzzle had a fault. Thank you.") or `stands` ("We checked the puzzle and its answer
    stands.") — and an optional note (up to 300 characters, shown to the reporters). New nullable columns on
    `DailyPuzzleReport`: `reviewedAt`, `reviewOutcome`, `reviewNote`. Each report is claimed with one conditional
    `updateMany` (`reviewedAt: null`), so a second admin's review changes nothing and sends nothing; each claimed
    reporter gets one notice (`puzzle-report-reviewed`). A member who files a report on an already reviewed day is
    told the outcome at once in the dialog, and their new row is written already reviewed (the day's `reviewedAt`,
    outcome and note copied in the same upsert), so it never reopens the day and never earns a second notice.
  - **No answer leaks:** only members who finished the day can report it (`fileReport` requires a score row), so the
    outcome and the note reach only players who have seen the answer; the admin's note field says "Reporters have
    played this puzzle" and the jam notice carries only the jam's `title` and the two deadlines (never `theme`,
    which a jam reveals at its start, nor a theme-vote result).
  - **Score and puzzle unchanged:** the review records a judgement; it never rescores or replaces a played day.
  - **Jam deadline notice:** when a save after the start changes `submitEndsAt` or `ratingEndsAt`, every entrant
    and accepted teammate (not the admin who saved) gets one `jam-deadline-moved` notice with the new times. A
    description-only edit sends nothing. At most 500 recipients a save; recipients blocked by the jam's creator are
    still told (it is their entry).
  - **Audit:** the review writes one `recordAdminActionIn` row with the day, mode, outcome and count.
  - **Export:** the review fields join the existing `exportPuzzleReports` output (sprint 14 06; no new anchor).

## Functional requirements

1. FR-1 Schema: three nullable columns on `DailyPuzzleReport`; migration `20270105050100_s15_fix_notices`.
2. FR-2 `lib/daily-puzzles/reports.server.ts`: `reviewReports(adminId, mode, dateKey, outcome, note)`; the report
   upsert answers the outcome when the day is already reviewed; `exportPuzzleReports` gains the fields.
3. FR-3 `lib/admin/api/admin.daily-puzzles.review.server.ts` (new, `auth: 'admin'`, contract in
   `lib/daily-puzzles/reports.contract.ts`); `DailyPuzzlesAdmin.tsx` gets "Mark reviewed" per day with open reports.
4. FR-4 `lib/competitive/jams.server.ts` `updateJam`: after the transaction commits, `notifyJamDeadlineMoved` (new,
   `lib/competitive/jam-notices.server.ts`) when a deadline changed after the start.
5. FR-5 Notices `puzzle-report-reviewed` (`mode`, `dateKey`, `outcome`, `note`) and `jam-deadline-moved` (`title`,
   `submitEndsAt`, `ratingEndsAt`) under the Wave 0 anchors, with labels.

## Non-functional requirements

- **Once only:** the claim is the conditional update; the notices go to the claimed rows only.
- **After the write:** notices are sent after the transaction and logged, never failing the save.
- **Query shapes (verify against the schema):** the new columns are optional; `DailyPuzzleReport` has
  `@@unique([userId, gameMode, dateKey])` and `@@index([gameMode, dateKey])`, which the review uses; the entrant read
  is one `findMany` with `distinct` on `userId` over entries and one over accepted teammates.
- **Dates:** the admin page shows day keys as stored (New York day keys), formatted in UTC on the server render.

## Testing requirements

- Main suite `lib/daily-puzzles/__tests__/report-review.test.ts` (fakes through `shapeChecked`): one review notifies
  each open reporter once; a second review is a no-op; a later report on a reviewed day gets the outcome, is stored
  reviewed and sends no notice; the notice's params hold no answer field; the export.
- Main suite `lib/competitive/__tests__/jam-deadline-notice.test.ts`: a deadline change after the start notifies
  entrants and accepted teammates (not invited ones, not the saver), once each even when a member is both; at most
  500 a save; a description-only edit and a pre-start edit notify nobody; the params are `title` and the two times
  only.
- The notice-key catalogue, the preview ratchet, the notification-label test.

## Acceptance criteria

- [ ] An admin marks a day's reports reviewed as "the answer stands", and each reporter gets one notice saying so.
- [ ] A member reporting that day afterwards sees the outcome in the dialog.
- [ ] Moving a running jam's submission deadline tells each entrant the new time in their language.
- [ ] Editing only a jam's description tells nobody.

## Out of scope

Rescoring a played day, editing a puzzle by hand, notices to jam watchers who did not enter, reports of other games.
