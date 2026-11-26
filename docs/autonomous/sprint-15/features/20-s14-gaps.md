# 20 — Close the gaps sprint 14 left open

Surface: Identity Crisis's final-guess phase, every open tab of a member who excludes themselves from the coin games,
account erasure (RMHBox match winners, security reports sent while signed out), Altair's co-op boards. Wave 7. No
namespace of its own (each fix writes into its file's namespace).

## User story

As the owner, I want the sprint 14 follow-ups that need no product call closed, so that a final guess stays secret
until the reveal, a self-exclusion takes effect in every open tab at once, erasure stops scanning a whole table and
misses no security report with the member's address, and a co-op player can find their own place on the boards.

## Requirements elicitation

- **What exists (verified, each against sprint 14's summary):**
  - **S14-01:** in Identity Crisis's FINAL phase, a correct final guess sets the guesser's `status` to `'solved'`
    (`server/rmhbox/minigames/identity-crisis/handler.ts`), and three public channels carry it before the reveal: the
    `statuses` record in every viewer's `baseState()`, the `status` field of `IC_PLAYER_GUESSED`, and the
    `IC_SCORE_UPDATE` broadcast (the final guess's 200 points). The spec says a final guess is private until the reveal.
  - **S14-16:** a member who self-excludes in one tab updates that tab's cache (`setRiskSurfacesHidden`,
    `hooks/useRiskSurfacesHidden.ts`), but other open tabs keep the old menus for up to the query's 60 s stale time
    plus the endpoint's private cache (sprint 14 measured about 120 s).
  - **S14-18 (index):** `RMHboxMatch.winnerUserId` (`prisma/schema/games/rmhbox.prisma`, table `rmhbox_match`) has no
    index, so `plainColumnErasureOps` (`lib/account/erasure-plain.server.ts`) scans the table on every erasure.
    `RmhTypeMatch.winnerUserId` already has one (`prisma/schema/rmhtype.prisma`).
  - **S14-18 (security reports):** erasure clears `SecurityReport` rows by `userId` only; a report sent while signed
    out carries the reporter's `reporterName` and `reporterEmail` with `userId` null (`prisma/schema/auth.prisma`), so a
    member who once reported signed out with their account's address keeps it on the record.
  - **The co-op boards (sprint 14 04):** `coopBoard(kind)` (`features/altair/engine/coop-record.server.ts`, served by
    `features/altair/api/altair.leaderboard.server.ts`) returns the top ten for `coop-wins` and `coop-revives`; a member
    outside the ten cannot see their place. Sprint 14 04 listed "the member's own place on the co-op boards" as out of
    scope.
- **Decisions:**
  - **S14-01:** until the REVEAL phase, a finalist's public status reads `'final'` whatever their guess did; the
    `IC_PLAYER_GUESSED` event for a final guess carries no `status`; a final guess's points are added to the public
    scores only when REVEAL begins (the guesser's own `IC_GUESS_RESULT` still tells them at once). Spectators keep
    seeing everything (they are not playing).
  - **S14-16:** after a successful play-limits save, the tab posts `{ hidden }` on a `BroadcastChannel`
    (`rmh-play-limits`), and every tab with the hook listening sets the same cache entry; a browser without
    `BroadcastChannel` falls back to the stale time as today. The channel is opened in a `useEffect` of the hook only
    while a member is signed in (one per tab, reference-counted across the hook's users) and closed on unmount and
    sign-out. It is not a decorative listener (B3, R5): it runs no timer, poll, observer or frame loop and does nothing
    until another tab of the same member saves the setting; `testing/e2e/steel-rest.mjs`'s rest bounds are unchanged.
  - **S14-18 index:** `@@index([winnerUserId])` on `RMHboxMatch` as `CREATE INDEX CONCURRENTLY
    "rmhbox_match_winnerUserId_idx"` alone in `20270105070200_s15_rmhbox_winner_index`, then
    `20270105070201_s15_rmhbox_winner_index_ensure_valid`.
  - **S14-18 security reports:** erasure also clears `reporterName` and `reporterEmail` (and `ipHash`) on reports with
    `userId` null whose `reporterEmail` equals the member's account e-mail, compared case-insensitively, read before the
    e-mail itself is scrubbed (a pre-step that captures the address, since the profile scrub later in the same
    transaction removes it). The report's title, text and status stay.
  - **Your place on the co-op boards:** a signed-in member outside the top ten gets one more row, "You: 34th", with
    their value, computed by a count of rows ahead of them under the same privacy filter
    (`userNotHiddenWhere`); a hidden member sees no own row (they asked not to be ranked).
  - **Not taken:** S14-13 (supporter marks on "thread replies": the comment tree is already marked at every depth and
    on the lazy reply feed; what remains unmarked is the feed's reply-posts surface, and choosing it is a product call),
    S14-02 (a browser-pass gap, not a defect), dropping `AltairCoopProfile.favoriteClassId` (a destructive migration;
    the additive-migration check forbids it).

## Functional requirements

1. FR-1 S14-01: `server/rmhbox/minigames/identity-crisis/handler.ts` (status masking, the event, deferred scores).
2. FR-2 S14-16: `hooks/useRiskSurfacesHidden.ts` and `components/settings/PlayLimitsPanel.tsx`.
3. FR-3 S14-18: the schema index and two migrations; `lib/account/erasure-plain.server.ts` and the pre-step in
   `lib/account/deletion.server.ts` under the `s15-20` anchor.
4. FR-4 The co-op board's own row: `features/altair/engine/coop-record.server.ts`, the route, and the board UI
   (`features/altair/ui/screens/MenuScreen.tsx`, where the co-op boards render).

## Non-functional requirements

- **Each item is its own commit** with its test.
- **The index migration** has real SQL only, `CONCURRENTLY`, Prisma's default name, and the `_ensure_valid` copy of
  `20261228030300_s14_synapse_matches_index` / `…_ensure_valid`.
- **Erasure stays one transaction** with the pre-step outside the array (the erasure stubs record Proxies:
  `Array.isArray(rows) ? rows : []` for any read before the transaction).
- **Query shapes (verify against the schema):** `SecurityReport.reporterEmail` is optional (`mode: 'insensitive'`
  equality); `RMHboxMatch.winnerUserId` optional; the own-place count uses the same `orderBy` column as the board.

## Testing requirements

- Main suite `server/rmhbox/minigames/identity-crisis/__tests__/final-secrecy.test.ts`: before REVEAL no player's
  state, event or score broadcast reveals a correct final guess; at REVEAL the scores include it.
- Main suite `hooks/__tests__/risk-surfaces-broadcast.test.ts` (a fake `BroadcastChannel`): a save posts, another tab
  sets the cache; no channel, no error; signed out, no channel is opened; the last unmount closes it; no timer is
  scheduled.
- Main suite `lib/account/__tests__/security-report-email-erasure.test.ts`; `lib/__tests__/migration-safety.test.ts`.
- Main suite `features/altair/engine/__tests__/coop-own-place.test.ts` (fakes through `shapeChecked`), beside the
  existing `coop-board.test.ts`.
- The existing Identity Crisis handler tests, the plain-column erasure tests.

## Acceptance criteria

- [ ] During the final-guess phase no other player can tell whether a finalist guessed right.
- [ ] Excluding oneself in one tab hides the coin games in another open tab within a second.
- [ ] Erasing a member who once sent a security report signed out with their address removes the address.
- [ ] A co-op player ranked 34th sees "You: 34th" under the top ten.

## Out of scope

Everything listed as not taken above.
