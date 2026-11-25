# 12 — Challenge someone to race your best run

Surface: RMHType: "Challenge someone" after a solo run and on the progress page, `/rmhtype/challenges` (new), the solo
page with `?challenge=<id>`, the inbox. Wave 5. Namespace `type-challenges`. App tier (L8).

## User story

As someone who just set a personal best on a passage, I want to send that run to a friend so that they race my ghost on
the same text, and we both hear who won, so that typing practice becomes a game between friends rather than a number
only I see.

## Requirements elicitation

- **What exists (verified):**
  - Ghosts (sprint 08 11): `RmhTypeGhost (userId, passageId)` stores a member's best run on a passage as a coarse
    progress curve (`samples`, `GHOST_STEP_MS = 250`), saved by `lib/rmhtype/ghost-save.server.ts` with plausibility
    checks (`isPlausibleGhost`, `MIN_GHOST_ACCURACY = 90`). Ghosts are visible to their owner only.
  - Solo runs start over the socket (`C2S.SOLO_START`, `server/socket-server/handlers/rmhtype.ts`), which picks the
    passage on the server (`passage.id`) from the curated sources (`lib/rmhtype/sources.ts`: standard, code, lore) or
    writes one with a model (an `ai-…` id, practice only). The solo page takes `?text=<id>` for a saved text (sprint 10
    05, private, never ranked).
  - **How a solo run is scored today:** `rmhtype:solo:finish` (`server/socket-server/handlers/rmhtype.ts`) times the run
    on the server (`Date.now() - room.roundStartTime`) but takes `position` and `errors` from the client payload, with
    only a lower bound (`Math.max(0, …)`): nothing stops a client from sending a finished position early. WPM is
    `position / 5 / minutes`. The ghost save then checks the run's `samples` against the server's time and the passage
    length (`isPlausibleGhost`, `lib/rmhtype/ghost.ts`: the last sample equals the passage length, the curve is
    monotone, no 250 ms step adds more than `MAX_CHARS_PER_STEP`, the curve's length matches the time), and `MAX_WPM`
    (`lib/rmhtype/typing-run.ts`) bounds the daily. A challenge must not be settled on the unchecked figures.
  - Friendly challenges exist for other games (`FriendlyChallenge`, `prisma/schema/competitive.prisma`: Elo games,
    challenger and opponent, `pending | accepted | declined | done`), not for typing.
- **Decisions:**
  - **What can be sent:** the challenger's own ghost on a curated passage: a standard passage
    (`lib/rmhtype/passages.ts`, ids such as `easy-01`) or a code snippet (`lib/rmhtype/sources.ts`, ids such as
    `ts-debounce`). Lore passages are built from the site's news text; they are challengeable only if their id names the
    same text every time (check `sources.ts`; if not, leave them out). Never a saved text (private, sprint 10 05) or a
    generated passage (`ai-…`, no stable text).
  - **To whom:** a member who follows the challenger and whom the challenger follows (mutuals), so a challenge is never
    a message to a stranger. Refused: a block either way, a banned or deletion-pending account, a member who has turned
    challenges off (a switch on the challenges page, default on).
  - **Caps:** 10 open challenges sent per member, 3 open from one member to the same opponent
    (`lockKey(tx, 'type-challenges:<challengerId>')`).
  - **Snapshot:** the challenge stores a copy of the ghost (WPM, accuracy, time, samples) when sent, so a later best
    does not change a race already sent; the passage id is stored, the text is re-read from the curated source when the
    race starts.
  - **Racing, one attempt:** "Race" opens `/rmhtype/solo?challenge=<id>`; `SOLO_START` with a challenge id checks on the
    server that the caller is the opponent, claims the challenge (compare-and-set `pending` → `racing`, setting
    `raceStartedAt`; a second start, in another tab or after a reload, is refused), uses the challenge's passage, and
    sends the snapshot as the ghost (drawn as the challenger's caret, labelled with their name). The run is an ordinary
    solo run on that passage (its result, statistics and personal bests count as any curated run does); `SOLO_FINISH`
    then settles the challenge once (compare-and-set `racing` → `done`). A race is one attempt, so an opponent cannot
    abandon losing runs until one wins: a run that is left (disconnect, leave, the solo timeout) or never finishes
    settles as the challenger's win, "Did not finish" (the hourly expiry job settles a `racing` row older than 15
    minutes the same way, which also covers a socket hub restart mid-race).
  - **What the settlement trusts:** only the server's own figures, checked. The race counts as finished only when the
    clamped position (`Math.min(position, passage.length)`) equals the passage length, the WPM computed from the
    server's time is at most `MAX_WPM`, and the run's `samples` pass `isPlausibleGhost` against that time and length. A
    finish that fails any check settles as "Did not finish" (the run itself is still scored as today, with the position
    clamped for the challenge only; the existing solo scoring is not changed by this feature). Accuracy still comes from
    the client's `errors`, as for every solo run; recorded as a residual risk.
  - **Who wins:** the higher WPM, provided accuracy is at least 90% (the ghost rule); a run under 90% or not finished
    loses; equal WPM (to two decimals) is a draw.
  - **Notices:** `type-challenge-received` to the opponent, `type-challenge-result` to both when settled ("You beat
    Ada's 82 WPM on 'Harbour lights'"). Declined challenges notify nobody; challenges expire after 7 days (the hourly
    job marks them `expired`, no notice).
  - **The page:** received (race, decline), sent (waiting, result), and the last 50 settled, with the switch.
  - **Erasure:** challenges where the member is either side are erased (the other side's row goes too: a race is a
    two-person record with no public trace). **Export:** sent and received challenges with the member's own figures.

## Functional requirements

1. FR-1 Models `RmhTypeChallenge` and `RmhTypeChallengeOptOut`; caps under the lock.
2. FR-2 `lib/rmhtype/challenges.ts` (pure): eligibility of a passage id, the winner rule, the snapshot shape check.
3. FR-3 `lib/rmhtype/challenges.server.ts`: send, decline, list, settle (called by the socket handler through a relative
   import, as `server/CLAUDE.md` requires), expire, the switch.
4. FR-4 Registered endpoints with contracts in `lib/rmhtype/challenges.contract.ts`; writes `rateLimit: 'write'`.
5. FR-5 Socket: `SOLO_START` accepts `{ challengeId }`; the handler validates and seeds passage and ghost; `SOLO_FINISH`
   settles.
6. FR-6 UI: `app/routes/rmhtype/challenges.tsx`, `components/rmhtype/ChallengesPage.tsx`,
   `components/rmhtype/ChallengeDialog.tsx` (pick a mutual, from the post-run screen and the progress page), the
   challenger's caret label in `GhostControls.tsx`.
7. FR-7 Job `rmhtype.challenge-expiry` hourly (pending past `expiresAt` → `expired`; `racing` older than 15 minutes →
   settled "Did not finish", with the result notices); notices, labels and previews; erasure, registry, export, sitemap
   (`/rmhtype/challenges` personal) under the anchors.

## Non-functional requirements

- **Privacy:** a challenge exposes one run's curve to one chosen mutual; nothing about it is public.
- **Integrity:** the opponent's result is computed from the server's clock, the clamped position and the passage length,
  gated by `MAX_WPM` and `isPlausibleGhost`; one attempt per challenge; the challenger's figures are the stored ghost,
  which passed the same check when it was saved.
- **Accessibility:** the ghost's caret has a text equivalent (the gap in seconds, as today); names in `<bdi>`.

## Data model and API

- `RmhTypeChallenge` (`@@map("rmhtype_challenge")`: `id`, `challengerId` → `User` (relation `RmhTypeChallengesSent`),
  `opponentId` → `User` (relation `RmhTypeChallengesReceived`), `passageId` `@db.VarChar(64)`, `challengerWpm Float`,
  `challengerAccuracy Float`, `challengerTimeMs Int`, `samples Int[]`, `status` `@db.VarChar(10)`
  (`pending | racing | done | declined | expired`), `opponentWpm Float?`, `opponentAccuracy Float?`,
  `opponentTimeMs Int?`, `outcome` `@db.VarChar(12)?` (`challenger | opponent | draw`), `finished Boolean?` (false for
  "Did not finish"), `raceStartedAt DateTime?`, `createdAt`, `expiresAt`, `settledAt DateTime?`,
  `@@index([opponentId, status])`, `@@index([challengerId, status])`, `@@index([status, expiresAt])`) in
  `prisma/schema/rmhtype.prisma`. Migration `20261201050100_s11_type_challenges`.
- The switch is a row: `RmhTypeChallengeOptOut` (`@@map("rmhtype_challenge_opt_out")`: `userId` `@id` → `User` (relation
  `RmhTypeChallengeOptOut`), `createdAt`); a row means challenges are off. Same migration.
- Erasure registry: both `erase`.

## Testing requirements

- Main suite `lib/rmhtype/__tests__/challenges.test.ts`: mutuals only; blocks, bans, opt-out refuse; saved-text and
  generated passage ids refused; caps under the lock; two concurrent starts claim once; settle once under two concurrent
  finishes; the winner rule at 89.9% and 90%; a finish short of the passage, above `MAX_WPM` or with an implausible
  curve settles as "Did not finish"; a stale `racing` row settles on expiry; expiry; only the opponent races.
- Main suite `server/socket-server/handlers/__tests__/rmhtype-challenge.test.ts` (no RMHType handler test exists yet;
  copy the harness of `rmhstudy-window.test.ts`): `SOLO_START` with another member's challenge id is refused; a valid
  one uses the challenge passage and sends the snapshot ghost; a second `SOLO_START` on the same challenge is refused; a
  `SOLO_FINISH` sent one second after the start with the full position settles as "Did not finish".
- Main suite `lib/account/__tests__/type-challenges-erasure.test.ts`.
- Notice-key catalogue and preview ratchet, labels, route table, sitemap coverage.

## Acceptance criteria

- [ ] After an 82 WPM run on a curated passage, a member challenges a mutual, who races the ghost and both get the
      result.
- [ ] A member who has blocked the challenger never receives the challenge.
- [ ] A challenge on a saved text cannot be sent.
- [ ] Reloading during a race does not give a second attempt; the race shows "Did not finish".

## Out of scope

Challenges to non-mutuals, group challenges, live multiplayer from a challenge (multiplayer rooms exist), challenge
leaderboards.
