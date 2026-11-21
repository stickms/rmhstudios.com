# 03 — Tournament check-in

Surface: the tournament page (`app/routes/_site/tournaments.$id.tsx`), the
create dialog (`components/tournaments/CreateTournamentDialog.tsx`) and
notifications. Wave 3. Namespace `tournament-checkin`.

## User story

As a tournament host, I want registered players to confirm shortly before the
start that they are actually here, and the ones who do not to be dropped (and
refunded) before the bracket is drawn — so that the first round is not half
byes and walkovers against people who signed up days ago and forgot.

## Requirements elicitation

- **What exists (verified):** `Tournament` and `TournamentEntrant`
  (`prisma/schema/competitive.prisma`) with `startsAt`, entry fees escrowed
  into `prizePoolCoins`, `minPlayers`. `registerForTournament`,
  `withdrawFromTournament` (refunds the fee in the same transaction with the
  idempotency key `tournament:entrant:<id>:withdraw`) and `startTournament`
  (claims `REGISTRATION → LIVE` with a conditional `updateMany`, then reads
  the entrants and draws the bracket) live in
  `lib/tournaments/tournament.server.ts`. There is no check-in: every
  registrant is seeded, present or not. No job touches tournaments
  (`server/jobs/index.ts`).
- **Decisions:** check-in is optional per tournament, set at creation or while
  still `REGISTRATION`: off, or a window of 10, 15, 30 or 60 minutes before
  `startsAt` (a tournament without `startsAt` cannot enable it). Registering
  during the window counts as checking in. Start stays manual (the host's
  button, as today); at start, entrants who did not check in are removed and
  refunded **inside the start transaction, after the claim**, so the bracket
  is drawn only from checked-in players. If too few remain for `minPlayers`
  the start is refused with the numbers, and nothing changes; the host can
  wait, or cancel (existing refunds). A cron notifies entrants once when the
  window opens.

## Functional requirements

1. FR-1 The create dialog and the host's settings on the tournament page gain
   "Check-in": Off / 10 / 15 / 30 / 60 minutes before the start (disabled,
   with a hint, until a start time is set).
2. FR-2 During the window each entrant sees "Check in" (an ink primary — the
   view's one) and, after, "Checked in"; outside it the page says when
   check-in opens. The entrant list marks who has checked in, with a count
   ("6 of 8 checked in").
3. FR-3 The host can check an entrant in by hand (for someone who told them
   in chat) and undo it before the start.
4. FR-4 When the window opens, every entrant gets one notification ("Check-in
   is open for {{name}}") linking to the tournament.
5. FR-5 On start, unchecked entrants are removed, their entry fee refunded
   (ledger note "Tournament no-show refund", key
   `tournament:entrant:<id>:no-show`) and they are notified ("You were removed
   from {{name}} because you did not check in"); the bracket uses the rest.
6. FR-6 If fewer than `minPlayers` checked in, Start shows "Only 3 of the 4
   players needed have checked in" and changes nothing.

## Non-functional requirements

- **Money:** refunds reuse the exact sequence `withdrawFromTournament` uses
  (`creditCoins`, `prizePoolCoins` decrement, `recordWagerTxn` with an
  idempotency key) — extract it into one `refundEntrant(tx, t, entrant,
  reason)` used by both, so the two can never diverge. A retried start
  refunds once (conditional `deleteMany` on the entrant, as withdraw does,
  plus the idempotency key). Never refund after the claim fails.
- **Concurrency:** check-in is a conditional `updateMany` on the entrant
  (`checkedInAt: null` → now) guarded by the tournament still being
  `REGISTRATION` and inside the window, in a transaction that also claims the
  tournament row the way `withdrawFromTournament` does.
- **Jobs:** `tournaments.checkin-open` every minute; claims tournaments with
  `status = REGISTRATION`, check-in enabled, window open and
  `checkInNoticeAt IS NULL` by a conditional `updateMany` to now (CAS) before
  notifying, at most 100 per run.
- **Security:** check-in is session-only and only for the caller's own
  entrant row; host actions require the host or a site admin, as
  `startTournament` does. Blocked or banned entrants are already refused at
  registration; check-in adds no new interaction between members.
- **Accessibility:** the window and the count are text; the Check in button
  has a clear label; the entrant list marks check-in with text, not only an
  icon.
- **i18n:** strings in `tournament-checkin`; times with
  `Intl.DateTimeFormat` and relative "in 12 minutes" with
  `Intl.RelativeTimeFormat`.
- **Steel:** entrant rows on rules; the check-in mark is `t-meta` text; the
  window setting is the existing `components/ui/select.tsx`.

## Data model and API

- `Tournament` gains `checkInMinutes Int?` (null = off; zod-limited to 10, 15,
  30, 60) and `checkInNoticeAt DateTime?`; `TournamentEntrant` gains
  `checkedInAt DateTime?`; `@@index([status, checkInNoticeAt, startsAt])`.
  Migration `20261124030200_s04_tournament_checkin`.
- `lib/tournaments/checkin.ts` (pure: window bounds, whether open, who is
  dropped, the refusal numbers), `lib/tournaments/checkin.server.ts`
  (`checkIn`, `hostCheckIn`, `undoHostCheckIn`, `runCheckInNotices`),
  `refundEntrant` extracted in `tournament.server.ts`, and the drop step in
  `startTournament`.
- Contract `lib/tournaments/checkin.contract.ts`; module
  `lib/tournaments/api/tournaments.$id.checkin.server.ts`: `POST` (self),
  `PUT {userId, checkedIn}` (host). The create and update schemas
  (`tournament-schema.ts`) accept `checkInMinutes`.
- `lib/tournaments/checkin-jobs.server.ts` registered in `server/jobs/index.ts`
  under the `s04-03` anchor.

## Testing requirements

- Main suite `lib/tournaments/__tests__/tournament-checkin.test.ts`: start
  drops and refunds exactly the unchecked entrants once (run start twice);
  start refuses below `minPlayers` and moves no coins; check-in outside the
  window is refused; another member cannot check you in; the notice job
  claims each tournament once.
- Product suite `lib/tournaments/__tests__/checkin.product.test.ts`: window
  maths and the drop list.
- The existing tournament tests (`lib/tournaments/__tests__/`) stay green.

## Acceptance criteria

- [ ] A tournament with a 15-minute check-in notifies entrants when it opens.
- [ ] Starting drops the two who did not check in, refunds their 50 coins
      each, and draws the bracket from the rest.
- [ ] A start with too few checked in is refused and nothing changes.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Automatic start at `startsAt`, per-match check-in, substitutes from a waitlist.
