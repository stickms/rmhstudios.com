# 20 — Confirm or dispute a tournament result

Surface: the bracket and match rows on `/tournaments/$id`
(`components/tournaments/BracketView.tsx`), the host's view, and
notifications. Wave 5. Namespace `match-results`.

## User story

As a tournament player, I want the result my opponent reports to need my
confirmation — or to settle by itself if I do not answer — and to be able to
dispute it to the host, so that nobody advances, or wins the prize, by
reporting a match they lost.

As a host, I want disputed matches in one place with both claims, so that I can
decide them quickly.

## Requirements elicitation

- **What exists (verified):**
  - `reportMatch` (`lib/tournaments/tournament.server.ts`) lets a host or admin
    report any match and a participant report their own; a participant's
    report calls `settleMatch` at once with `source: 'agreement'`, although only
    one side agreed. Settling advances the bracket (single, double elimination,
    round robin, swiss) and, when the tournament completes, pays out
    (`TournamentPayout`, coins).
  - Game hubs report authoritatively through
    `reportTournamentMatchByGameSession` (`source: 'authoritative'`).
  - `TournamentMatch` (`prisma/schema/competitive.prisma`) has `state`
    (`PENDING`, `READY`, `LIVE`, `COMPLETE`, `BYE`, `CANCELLED`),
    `winnerEntrantId`, `resultSource`, `completedAt`.
  - Sprint 04 03 check-in has a per-minute job pattern and labels
    (`tournament_checkin`); sprint 05 08 and 18 changed the bracket code.
- **Decisions:**
  - A **participant** report becomes a **claim** (`claimedWinnerId`,
    `claimedById`, `claimedAt`); the match stays `READY`/`LIVE`.
  - The opponent can **Confirm** (settles with `source: 'agreement'`, now true)
    or **Dispute** (with a note ≤ 300 characters; the match is flagged
    `disputedAt` and waits for the host).
  - If the opponent reports the same winner, that is a confirmation; if they
    report the other winner, that is a dispute.
  - Unanswered claims settle automatically after **15 minutes** with
    `source: 'unanswered'` (a per-minute job). The window is a constant in
    `lib/tournaments/match-results.ts`; it is not configurable per tournament in
    this feature.
  - Hosts and admins settle directly, as today (including deciding a dispute,
    with an optional note); authoritative game results settle directly and clear
    any claim.
  - Each step notifies the people concerned (label `tournament_result`): the
    opponent on a claim, the claimant on a dispute, the host on a dispute, both
    players on a host decision.
  - **A claim that would complete the tournament never settles unanswered.**
    Completion pays out coins (`TournamentPayout`), and disputes after
    settlement are out of scope, so an offline opponent must not hand the prize
    to a false claim after 15 minutes. The job skips a match whose settlement
    would complete the tournament (the final of single elimination, the grand
    final or its reset in double elimination, the last outstanding match of a
    round robin or of swiss's last round); it waits for the opponent's answer
    or the host. The host's Disputes section lists such claims as "Waiting for
    confirmation" after the window. This changes no payout rule.
  - A claim can be withdrawn by its claimant before it is answered.
  - Nothing about payouts changes: they still follow settlement.

## Functional requirements

1. FR-1 A participant's "Report result" becomes "Report result" → claim; the
   match row then shows "X reported X won · waiting for Y (14 min)" to both
   players and the host.
2. FR-2 The opponent sees "Confirm" (ink primary) and "Dispute…" (dialog with a
   note) on the match.
3. FR-3 Disputed matches show "Disputed" in the bracket for everyone and list in
   a "Disputes" section at the top of the host's view with both claims and
   notes, and "Decide: X won / Y won".
4. FR-4 The per-minute job settles unanswered claims older than 15 minutes.
5. FR-5 The match detail records how it was settled (`resultSource`, existing
   values `agreement`, `admin` (the host's or an admin's report, shown as
   "host"), `authoritative`, plus the new `unanswered`) — shown in `t-meta`.

## Non-functional requirements

- **Correctness:** claim, confirm, dispute and the job's settlement all run in a
  transaction that takes `lockKey(tx, 'tournament-match:' + matchId)` and
  re-reads the match; settlement uses a conditional `updateMany` on
  (`id`, `claimedAt`, `disputedAt: null`, state in READY/LIVE) so a confirm and
  the job can never both settle. `settleMatch` itself is unchanged and called
  once.
- **Security:** `auth: 'required'`; `rateLimit` as today on report; zod for
  winner, note; only the two participants may claim, confirm or dispute; only
  the opponent of the claimant may confirm or dispute; host or admin decides.
- **Performance:** the job reads claims through
  `@@index([claimedAt])` filtered by `disputedAt IS NULL` and state; the
  `tournament_match` table is not small, so the index is created
  `CONCURRENTLY` in its own migration.
- **Privacy:** erasure nulls `claimedById` and `disputedById` where the member
  was the actor (match rows are tournament records).
- **i18n:** `match-results`; label in `feed`.
- **Steel:** rows on rules; the dispute dialog is an overlay; one ink primary
  per state; "Disputed" is a word, not a colour.
- **Accessibility:** the countdown is text updated only on render (no ticking
  timer at rest — R5); it says "about 14 minutes".

## Data model and API

- `TournamentMatch` gains `claimedWinnerId String?`, `claimedById String?`,
  `claimedAt DateTime?`, `disputedAt DateTime?`, `disputedById String?`,
  `disputeNote VarChar(300)?`. Migrations
  `20261126050200_s06_match_results` (columns),
  `20261126050201_s06_match_claim_index` (CONCURRENTLY, one statement:
  `CREATE INDEX CONCURRENTLY … ON tournament_match ("claimedAt") WHERE
  "claimedAt" IS NOT NULL`), `20261126050202_s06_match_claim_index_ensure_valid`.
- `lib/tournaments/match-results.ts` (pure: window, transitions, who may act),
  `match-results-schema.ts`, `match-results.server.ts` (`claimResult`,
  `confirmResult`, `disputeResult`, `withdrawClaim`, `decideDispute`,
  `settleUnansweredClaims`, `registerMatchClaimCron`,
  `matchResultErasureOps`), `match-results.contract.ts`.
- `reportMatch` routes participant reports to `claimResult`; the
  game-session path clears claims. New modules
  `lib/tournaments/api/tournaments.$id.matches.$matchId.confirm.server.ts`,
  `…dispute.server.ts`, `…withdraw.server.ts`, `…decide.server.ts`.
- `server/jobs/index.ts`: one registration under the Wave 0 anchor
  (queue `tournament-match-claims`, every minute).
- `components/tournaments/MatchResultControls.tsx`, `DisputesPanel.tsx`;
  `BracketView.tsx` renders them.

## Testing requirements

- Main suite `lib/tournaments/__tests__/match-results.test.ts`: participant
  report creates a claim and does not settle; opponent confirm settles once;
  same-winner report confirms; other-winner report disputes; the claimant
  cannot confirm their own claim; a stranger is 403; confirm and the job racing
  settle once; a disputed claim is never auto-settled; a claim on the match
  that would complete the tournament is never auto-settled; host decides a dispute;
  authoritative result clears a claim; withdraw before answer.
- Main suite `lib/account/__tests__/match-results-erasure.test.ts`.
- Product suite `lib/tournaments/__tests__/match-results.product.test.ts`:
  transitions table, window boundary.
- The existing bracket, double elimination, swiss, seeding and check-in tests
  stay green.
- `notification-labels.test.ts` pins `tournament_result`.

## Acceptance criteria

- [ ] A reports "A won"; B is notified and confirms; the bracket advances.
- [ ] A reports "A won"; B does nothing; after 15 minutes the match settles as
      unanswered.
- [ ] B disputes; the host sees both claims and decides; both are notified.
- [ ] A host's report still settles at once.
- [ ] An unanswered claim on the final waits for the opponent or the host.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Evidence uploads (screenshots), per-tournament windows, disputes after
settlement, changing payouts.
