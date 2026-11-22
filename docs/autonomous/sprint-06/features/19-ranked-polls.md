# 19 — Ranked-choice polls

Surface: the poll editor in the post composer
(`components/feed/compose/PollEditor.tsx`) and the poll on a post
(`components/feed/PollDisplay.tsx`). Wave 3. Namespace `ranked-polls`.

## User story

As a community organiser asking "which game for next season?" among six
similar options, I want people to rank the options and the winner decided by
instant runoff, so that a polarising option with a loud minority does not win
over the one most people are happy with.

## Requirements elicitation

- **What exists (verified):**
  - `RMHarkPollVote.rank Int?` ("1 = first preference. Null on single-choice
    polls, which keeps every existing row valid and lets both methods share one
    table"), `@@unique([optionId, userId])` (`prisma/schema/social.prisma`).
  - `lib/feed/poll-count.ts` is a pure, client-safe instant-runoff counter
    (`instantRunoff`, `ballotsFromVotes`, `plurality`; rounds, eliminations,
    exhausted ballots) with tests in `lib/__tests__/poll-count.test.ts`. It is
    imported only by `lib/feed/take.ts`.
  - No poll can be created ranked: `RMHarkPoll` has `multiSelect` but no method
    field; `POST /api/rmharks/$id/vote` (`lib/feed/api/rmharks.$id.vote.server.ts`)
    takes one option and ignores rank; `PollEditor.tsx` and `PollDisplay.tsx`
    know single and multi-select only.
  - Sprint 04 08 poll lifecycle (end early, extend, end notifications;
    `lib/feed/poll-lifecycle*.ts`) and quiet counts (sprint 04 14,
    `QUIET_COUNT_READ_PATHS`) apply to polls.
- **Decisions:**
  - `RMHarkPoll.ranked Boolean @default(false)`; ranked and `multiSelect` are
    mutually exclusive (zod refuses both).
  - Ranked polls need 3–6 options (a ranked two-option poll is a plain poll),
    and an end time (`closesAt` required): an open-ended ranked poll would
    never be counted unless its author ended it.
  - A ballot ranks at least one option and at most all; ranks are 1..n without
    gaps. Submitting replaces the member's previous ballot (delete and insert in
    one transaction). Ballots can be changed until the poll ends, like votes.
  - **Results:** while the poll is open, voters and the author see first
    preferences only, with "Final result is counted when the poll ends"; at the
    end, everyone who can see the post sees the winner and the rounds
    (eliminated option per round, exhausted ballots), computed by
    `instantRunoff` on the server from `ballotsFromVotes`, and cached on the
    poll (`resultJson`) when the end notification is claimed.
  - Quiet counts: when the author hides counts, the rounds show percentages
    only, matching how plain polls behave under quiet counts (check
    `QUIET_COUNT_READ_PATHS` and follow it).
  - The end notification (sprint 04 08) names the winner for ranked polls.
  - Group chat polls and feed announcements polls are out of scope.
  - Developer API: the post's `poll` object gains `ranked` and, when ended,
    `result: { winnerOptionId, rounds }` — additive.

## Functional requirements

1. FR-1 `PollEditor` gains a method `Select`: "Pick one", "Pick any", "Rank";
   choosing Rank enforces 3–6 options.
2. FR-2 On a ranked poll, voters order the options (drag handles and, for
   keyboard and touch, "Move up" / "Move down" buttons and a rank number
   `Select` per option), can leave options unranked, and press "Submit ranking"
   (ink primary).
3. FR-3 Voters see "Your ranking: 1 X, 2 Y" with "Change"; after the end, the
   result panel shows the winner, then each round as rows on rules ("Round 2:
   Z eliminated"), and exhausted ballots.
4. FR-4 The vote endpoint accepts `{ ranking: string[] }` for ranked polls and
   the existing body for others; it refuses a ranking on a plain poll and a
   single option on a ranked poll.
5. FR-5 Ending (early or on time) computes and stores the result once; the post
   payload carries it.

## Non-functional requirements

- **Correctness:** ballot replacement runs in a transaction after
  `lockKey(tx, 'poll-ballot:' + pollId + ':' + userId)`; the result is
  computed inside the end claim (compare-and-set on `endNotifiedAt`, sprint 04
  08) so it is normally written once. The per-minute job runs after the end,
  so a read can meet an ended ranked poll whose `resultJson` is still null
  (the minute between, or a stalled job): the read path then computes the
  result itself and stores it with a conditional
  `updateMany({ where: { id, resultJson: null } })` (`Prisma.DbNull` / `JsonNull`
  as the column needs), so every reader sees the same result and the job's
  later write is a no-op.
- **Security:** zod: ranking length 1..options, unique ids, every id belongs to
  the poll; `rateLimit: 'write'`; blocked and banned members are refused as on
  plain polls today.
- **Performance:** counting runs once per poll at end time; at most 6 options
  and the poll's ballots (votes are capped by the lifecycle's notice limits; the
  counter is linear in ballots × rounds).
- **Privacy:** ballots are votes; erasure deletes the member's poll votes if the
  existing erasure does (check and match); no new table.
- **i18n:** `ranked-polls`; the end notification text in `feed` uses a literal
  key for the ranked variant (no ternary choosing keys).
- **Steel:** rows on rules; one ink primary; no bar-chart styling beyond the
  existing poll bars (D10).
- **Accessibility:** ordering works without drag (buttons and selects); the
  current rank is announced on every move ("X moved to 2nd").

## Data model and API

- `RMHarkPoll.ranked Boolean @default(false)`, `RMHarkPoll.resultJson Json?`.
  Migration `20261126030100_s06_ranked_polls`.
- `lib/feed/ranked-poll.ts` (pure: ranking validation, result shaping on top of
  `poll-count.ts`), `ranked-poll-schema.ts`, `ranked-poll.server.ts`
  (`submitBallot`, `computeAndStoreResult`).
- Changes: post create (poll fields), `rmharks.$id.vote.server.ts`,
  `poll-lifecycle.server.ts` (result at end), `map-feed-item.server.ts` (poll
  payload), `/api/v1/posts*` poll object, `lib/api/registry.ts`,
  `PollEditor.tsx`, `PollDisplay.tsx`, new `components/feed/RankedBallot.tsx`,
  `RankedResult.tsx`, `compose/compose-state.ts`.

## Testing requirements

- Main suite `lib/feed/__tests__/ranked-polls.test.ts`: ranked and multi-select
  together refused; fewer than 3 options refused; a ranked poll without
  `closesAt` refused; an ended poll read before the job ran shows the same
  result the job stores; ballot with a foreign option,
  duplicate or gap refused; resubmission replaces under the lock; ballot after
  the end refused; the result is computed once at end and matches
  `instantRunoff`; open-poll payload has first preferences only.
- Product suite `lib/feed/__tests__/ranked-poll.product.test.ts`: validation,
  result shaping, quiet-count percentages.
- `lib/__tests__/poll-count.test.ts` stays green.

## Acceptance criteria

- [ ] An author creates a ranked poll with five options; members rank them;
      at the end the winner and rounds are shown and the end notification names
      the winner.
- [ ] While open, only first preferences are shown.
- [ ] Ranking works with the keyboard alone.
- [ ] Plain and multi-select polls behave exactly as before.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Ranked polls in group chats and announcements, other voting methods, showing
individual ballots.
