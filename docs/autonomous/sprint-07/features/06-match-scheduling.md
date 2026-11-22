# 06 — Match times and deadlines in tournaments

Surface: `/tournaments/$id` (bracket, match controls, host panel), the create
dialog, notifications. Wave 5. Namespace `match-scheduling`.

## User story

As a player in a week-long bracket, I want to agree a time to play my match
with my opponent on the site, and be reminded before it, so that we are both
there.

As the host, I want each match to have a deadline and to see which matches are
overdue, so that one missing player does not stall the whole bracket, and so
that I can award the match to the player who turned up.

## Requirements elicitation

- **What exists (verified):**
  - `TournamentMatch.scheduledAt` (`prisma/schema/competitive.prisma`) exists
    and **nothing writes it** (`grep -rn scheduledAt lib/tournaments
    components/tournaments` finds nothing).
  - Matches become playable when both entrants are known (single and double
    elimination through `settleMatch`'s advancement, Swiss through
    `lib/tournaments/swiss-flow.ts`); results are claimed and confirmed
    (sprint 06 20: `claimResult`, `confirmResult`, `disputeResult`,
    `decideDispute`, the per-minute `settleUnansweredClaims` cron in
    `lib/tournaments/match-results.server.ts`); a host decides disputes.
  - Check-in (sprint 04 03, `lib/tournaments/checkin.server.ts`) shows the
    pattern for a host setting on `Tournament` and a cron that claims a notice
    once (`checkInNoticeAt`).
  - The UI: `components/tournaments/BracketView.tsx`,
    `MatchResultControls.tsx`, `DisputesPanel.tsx`,
    `CreateTournamentDialog.tsx`; times are shown with the site's locale
    formatters and `lib/calendar/tz.ts`.
- **Decisions:**
  - **Deadline:** the host may set "Each match must be played within" none, 24
    h, 48 h, 72 h or 7 days (`Tournament.matchDeadlineHours`, editable until the
    tournament completes; a change applies to matches that become ready
    afterwards). When a match becomes ready (both entrants set, state
    `PENDING`/ready), `deadlineAt = readyAt + hours` is stamped in the same
    transaction that filled the second slot. Implementation: one helper
    `stampDeadline(tx, matchId)` called from every place a match gets its
    second entrant (find them all; list them in a constant
    `MATCH_READY_PATHS` and hold it with a source-scan test, the read-path
    registry pattern).
  - **Proposing a time:** either entrant proposes a time (a future instant
    before `deadlineAt` when there is one), stored on the match
    (`proposedAt`, `proposedById`); the opponent accepts (sets `scheduledAt`,
    clears the proposal) or proposes another (replaces it). One live proposal
    per match. The host can set `scheduledAt` directly. A settled match ignores
    all of this.
  - **Reminders:** both entrants get one notification when a time is agreed,
    one 60 minutes before `scheduledAt`, and one 12 hours before `deadlineAt`
    if no result has been claimed; each is claimed by a conditional update on
    its own column (`remindedAt`, `deadlineNoticeAt`) in a per-minute cron, the
    check-in pattern.
  - **Overdue:** after `deadlineAt` with no settled result, the match shows
    "Overdue" to everyone and the host gets "Award match" with the two entrants
    as choices (`useConfirm`, naming the winner). Awarding settles through
    `settleMatch` with `resultSource = 'walkover'`, so advancement, double
    elimination drops and payouts are the existing code. **Nothing is awarded
    automatically**: a walkover moves coins (payouts), so a person decides.
    `'walkover'` is a new value: `RESULT_SOURCES` in
    `lib/tournaments/match-results.ts` lists `agreement`, `admin`,
    `authoritative`, `unanswered` (and `tournament.server.ts:456` writes
    `'bye'`), so this feature appends `'walkover'` to that list (the column
    is `VarChar(24)`, no schema change for it) and every `switch` over
    `ResultSource` handles it (the compiler finds them at integration).
  - An open result claim (sprint 06 20) blocks "Award match" until it is
    confirmed, disputed or withdrawn; a dispute stays the host's decision.
  - Times are entered in the viewer's time zone and stored as UTC; shown to
    each viewer in theirs.
  - Withdrawing or a tournament being cancelled clears proposals with the match.

## Functional requirements

1. FR-1 The create dialog and the host panel gain the deadline `Select`.
2. FR-2 Each ready match row shows its deadline and agreed time (`t-meta`);
   its entrants see "Propose a time" (date-time field and Send) and, for a
   proposal from the opponent, "Accept" and "Propose another".
3. FR-3 The host sees "Set time" on any ready match and "Award match" on
   overdue ones.
4. FR-4 Notifications: proposal received, time agreed, 60-minute reminder,
   deadline in 12 hours, match awarded (literal labels).
5. FR-5 The tournament page lists "Your next match" with its time for an
   entrant (one line above the bracket).
6. FR-6 Swiss rounds stamp deadlines for every pairing when the round is
   generated.

## Non-functional requirements

- **Correctness:** propose/accept/award run in a transaction that takes
  `lockKey(tx, 'tournament-match:' + matchId)` (the key sprint 06's result
  claims take in `match-results.server.ts`, so an award and a claim on one match
  serialise) and re-read the match state; the deadline setting takes
  `lockKey(tx, 'tournament:' + tournamentId)` (check-in's key); accepting a proposal that was replaced fails with 409
  `PROPOSAL_CHANGED`.
- **Security:** only the two entrants propose and accept; only the host (and
  site admins, as for disputes) sets times and awards; `auth: 'required'`,
  `rateLimit: 'write'`. Blocked pairs can still play a match they were drawn
  into (the bracket put them there) but a proposal from a blocked opponent is
  delivered without a notification — the row still shows it.
- **Jobs:** one per-minute cron in the `jobs` worker under the jobs anchor;
  each notice claimed by `updateMany` compare-and-set before sending.
- **Performance:** the cron reads through a new index on
  `tournament_match(deadlineAt)` (an existing table: `CONCURRENTLY`, alone in
  its migration) and one on the existing `scheduledAt` column (a second
  concurrent migration, since each holds one statement), then one
  `_ensure_valid` migration for both.
- **Audit:** a host award writes the tournament's existing host-action trail if
  one exists; a site-admin award writes `recordAdminActionIn(tx, …)`.
- **Privacy:** erasure nulls `proposedById` where the member proposed; export
  lists the member's proposals and agreed times.
- **Steel:** rows on rules; one ink primary per view (the proposal Send).
- **i18n:** `match-scheduling`; labels in `feed.json`.

## Data model and API

- `Tournament.matchDeadlineHours Int?`; `TournamentMatch.deadlineAt
  DateTime?`, `proposedAt DateTime?`, `proposedById String?`,
  `remindedAt DateTime?`, `deadlineNoticeAt DateTime?`, `agreedNoticeAt
  DateTime?` (plain refs, the s06-20 convention). Migrations
  `20261127050100_s07_match_scheduling` (columns),
  `20261127050101_s07_match_deadline_index` (`CREATE INDEX CONCURRENTLY
  "tournament_match_deadlineAt_idx" ON "tournament_match"("deadlineAt")`),
  `20261127050102_s07_match_scheduled_index` (same for `scheduledAt`),
  `20261127050103_s07_match_schedule_indexes_ensure_valid`. Declare both
  `@@index`es in the schema so Prisma's default names match (no drift).
- `lib/tournaments/scheduling.ts` (pure: deadline options, proposal validity,
  overdue), `scheduling-schema.ts`, `scheduling.contract.ts`,
  `scheduling.server.ts` (`stampDeadline`, `proposeTime`, `acceptTime`,
  `setTimeAsHost`, `awardWalkover`, `runScheduleNotices`,
  `registerMatchScheduleCron`, `matchScheduleErasureOps`,
  `exportMatchScheduling`).
- Modules `lib/tournaments/api/tournaments.$id.matches.$matchId.schedule.server.ts`
  (POST propose, PUT accept, PATCH host set),
  `tournaments.$id.matches.$matchId.award.server.ts` (POST),
  `tournaments.$id.schedule-settings.server.ts` (PUT deadline hours).
- UI: `components/tournaments/MatchSchedule.tsx`, `AwardMatchDialog.tsx`;
  edits to `BracketView.tsx`, `CreateTournamentDialog.tsx`.

## Testing requirements

- Main suite `lib/tournaments/__tests__/match-scheduling.test.ts`: deadline
  stamped on every ready path (the registry), propose/accept/replace, 409 on a
  replaced proposal, non-entrant refused, host set, award only after the
  deadline and only without an open claim, award settles via `settleMatch`
  (payouts at a final), reminders claimed once under two concurrent cron runs.
- Main suite `lib/account/__tests__/match-scheduling-erasure.test.ts`.
- Product suite `lib/tournaments/__tests__/scheduling.product.test.ts`.
- `lib/tournaments/__tests__/match-ready-paths.test.ts`: the source scan for
  `MATCH_READY_PATHS`.
- Gate tests: migration safety, notification labels, computed-key ratchet.

## Acceptance criteria

- [ ] With a 48-hour deadline, a match that becomes ready shows its deadline.
- [ ] One player proposes 20:00 tomorrow, the other accepts; both are reminded
      an hour before.
- [ ] An overdue match can be awarded by the host, which advances the bracket
      exactly as a played match would; nothing is awarded without the host.
- [ ] A Swiss round's pairings all get deadlines.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Automatic forfeits, calendar invitations for matches (the personal calendar
feed could carry them later), availability polls between players, rescheduling
a settled match.
