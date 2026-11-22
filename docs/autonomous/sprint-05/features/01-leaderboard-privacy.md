# 01 — Leaderboard privacy

Surface: every game leaderboard (the unified boards in
`lib/game/adapters.server.ts` and `lib/game/generic-adapter.server.ts`, the
per-game top-ten routes, the site XP board in `lib/leaderboard.server.ts`),
Settings > Privacy, and account erasure. Wave 1. Namespace
`leaderboard-privacy`.

## User story

As a member, I want to keep playing and keeping my scores without appearing on
public leaderboards, and I want my name gone from every board when I delete my
account — so that playing a game never publishes more about me than I chose.

## Requirements elicitation

- **What exists (verified):** each scored game keeps one row per player in a
  table of its own — `LaundryPlayer`, `VoidBreakerPlayer`, `NeonDriftwayPlayer`,
  `NightrailPlayer`, `SignalForgePlayer`, `VegaPlayer`, `DreamRiftPlayer`,
  `GabrielsHornPlayer`, `Player` (Slice It), `GlobeSetPlayer`
  (`prisma/schema/games.prisma`), `SynapseStormPlayer`
  (`games/synapse-storm.prisma`), `SongLeaderboard` (`games/slice-it.prisma`) —
  plus the shared `GameStat`. Most store a free-text `username` that the boards
  print. Boards are read in `lib/game/adapters.server.ts` (`leaderboard()` per
  adapter), `generic-adapter.server.ts`, and bespoke routes:
  `lib/game/api/void-breaker.leaderboard.server.ts`,
  `vega.leaderboard.server.ts`,
  `lib/neon-driftway/api/neon-driftway.leaderboard.server.ts`,
  `features/signal-forge/api/signal-forge.leaderboard.server.ts`,
  `features/laundry-sort/api/laundry-sort.leaderboard.server.ts`,
  `features/gabriels-horn/api/gabriels-horn.leaderboard.server.ts`,
  `features/synapse-storm/api/games.synapse-storm.leaderboard.server.ts`,
  `features/slice-it/api/slice-it.leaderboard.server.ts`, and the socket hubs'
  in-game boards (`features/laundry-sort/server/handlers.ts`,
  `features/gabriels-horn/server/handlers.ts`).
- **The gap:** `anonymizeAccount` (`lib/account/deletion.server.ts`) erases none
  of these tables. Accounts are anonymised in place, so `onDelete: Cascade`
  never fires and a deleted member's chosen username stays on every board
  indefinitely. Banned members also stay on boards. There is no way to play
  without being listed.
- **Decisions:** (1) erasure deletes the member's rows in every player table and
  `GameStat`, and sets `DreamRiftCoopRun.hostUserId` to null (its `players` JSON
  keeps squad names typed by the host and is out of scope — see Out of scope);
  (2) a new `UserProfile.hideFromLeaderboards` (default false) removes the
  member from every public board while their own personal best, rank-to-self and
  progression keep working; (3) members whose `bannedUntil` is in the future are
  left off public boards (their rows are kept, so an unban restores them). No
  owner decision is touched: hiding a banned member's display matches how bans
  already refuse interaction.

## Functional requirements

1. FR-1 Settings > Privacy gains a "Leaderboards" section with one switch, "Show
   me on game leaderboards" (on by default), and a line of help text. Turning it
   off takes effect on the next board read (within the boards' cache TTL, at
   most 60 s).
2. FR-2 Every public board listed above excludes members who turned the switch
   off and members currently banned. Ranks are recomputed over the remaining
   rows (no gaps).
3. FR-3 A hidden member still sees their own best and their own rank ("You would
   be 14th") on the game page and in score results; the rank counts only listed
   players.
4. FR-4 Friends and community scopes (`lib/game/leaderboard-scope.server.ts`)
   apply the same exclusions.
5. FR-5 Account erasure deletes the member's rows in every player table listed
   above and in `GameStat`, and nulls `DreamRiftCoopRun.hostUserId`.
6. FR-6 The developer API's boards (`app/routes/api/v1/leaderboards/$game.ts`,
   `app/routes/api/v1/slice-it/leaderboard.ts`) apply the same exclusions; the
   documented response shape is unchanged (additive rule).

## Non-functional requirements

- **Performance:** exclusions come from one helper, `leaderboardHiddenUserIds()`
  in `lib/game/leaderboard-privacy.server.ts`, which reads `user_profile` where
  `hideFromLeaderboards` and `user` where `bannedUntil > now()` (both small
  sets), capped at 5 000 ids, cached in-process for 60 s
  (`lib/cached.server.ts`). Boards read `take + hidden.size` rows at most and
  filter in memory when a where-clause is not possible; where it is (`GameStat`,
  tables with `userId`), the query uses `userId: { notIn }`. Rows with
  `userId = null` (legacy anonymous scores) stay listed.
- **Caching:** routes that declare `cache: { visibility: 'public' }` stay
  anonymous-invariant (the exclusion list is the same for every caller).
- **Security/privacy:** no new endpoint exposes the hidden list. The setting is
  the member's own; it is read through the existing profile settings path.
- **i18n:** new strings in `leaderboard-privacy`.
- **Steel:** the setting is one row with `components/ui/switch.tsx`, label
  `t-body`, help `t-meta` muted, on the existing privacy page's rules.
- **Accessibility:** the switch has a visible label and `aria-describedby` for
  the help text.

## Data model and API

- `UserProfile.hideFromLeaderboards Boolean @default(false)`
  (`prisma/schema/profile.prisma`). Migration
  `20261125010000_s05_leaderboard_privacy` (one
  `ALTER TABLE … ADD COLUMN … DEFAULT false`, metadata-only).
- Contract `lib/game/leaderboard-privacy.contract.ts` + module
  `lib/game/api/settings.leaderboard-privacy.server.ts`: `GET` and
  `PUT { hidden: boolean }` (`auth: 'required'`, `rateLimit: 'write'` on PUT).
- `lib/game/leaderboard-privacy.server.ts`: `leaderboardHiddenUserIds()`,
  `excludeHidden<T extends { userId: string | null }>(rows, hidden, take)` (pure
  re-rank), `leaderboardErasureOps(userId)` returning the Prisma operations for
  the deletion transaction.

## Testing requirements

- Main suite `lib/game/__tests__/leaderboard-privacy.test.ts` (mock Prisma):
  hidden and banned members are excluded from the unified board and one bespoke
  route; ranks are contiguous; `userId: null` rows stay; the cache returns the
  same set within 60 s; a hidden member's own rank still resolves.
- Main suite `lib/account/__tests__/leaderboard-erasure.test.ts`:
  `anonymizeAccount` issues a delete for every player model listed in this spec
  and for `GameStat`, and nulls the co-op host. The test holds the list of model
  names, so a new player table added later without erasure fails it (assert
  against the Prisma DMMF: every model with a `username` field and a `userId`
  relation is covered).
- Product suite `lib/game/__tests__/leaderboard-privacy.product.test.ts`: the
  pure re-rank.

## Acceptance criteria

- [ ] With the switch off, the member is absent from every board listed above,
      and still sees their own best.
- [ ] A banned member is absent from boards and reappears after the ban ends.
- [ ] After erasure no player table or `GameStat` row references the member.
- [ ] The DMMF test fails if a new player table is not erased.
- [ ] Day and Night, 390 px and 1280 px, `ar`.

## Out of scope

Rewriting the player tables into one model; names typed into co-op squad
snapshots (`DreamRiftCoopRun.players`); replays (sprint 04, 01); RMHBox (its
history privacy is an open owner decision).
