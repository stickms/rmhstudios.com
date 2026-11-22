# 16 — Erasure: ratings, puzzle boards and names in match records

Surface: `anonymizeAccount` (`lib/account/deletion.server.ts`), the erasure registry,
`lib/account/erasure-games.server.ts` (sprint 08 20's snapshot scrub), the jobs worker, three indexes. Wave 6. No
namespace.

## User story

As a member who deletes their account, I want my ratings, my puzzle scores and reputation, my pick'em picks and my
achievements to go, and my name to leave the match records other players still see, so that nothing ranks or names me
after I am gone — even if the clean-up that runs after the deletion fails once.

## Requirements elicitation

- **What exists (verified):**
  - `todo` entries whose reasons are boards: `EloRating`, `RankedSeasonRating` ("public rating on ranked boards … the
    game boards were erased by leaderboard-privacy, ratings were not"), `DoctrinePuzzleReplay`,
    `DoctrinePuzzleSubmission`, `DoctrineReputation` ("puzzle progress and reputation shown on Doctrine boards; needs a
    product call and a counter correction"), `CommunityContributorScore` ("a denormalised score shown on contributor
    lists"), `BracketPick` ("erase candidate once pick'em standings are reviewed"), `UserAchievement` ("shown on a
    public profile, which is scrubbed").
  - Sprint 08 20's follow-ups: "`RMHboxMatch.gameLog` (participants-only free-form JSON) may carry names and is not
    scrubbed; `RmhTypeMatch`/`AltairMatch.results` hold per-player data with no reader; `SliceDailyEntry`/`SongPlay`
    lack a `userId`-leading index (scan per deletion); … the snapshot scrub runs after the deletion transaction and is
    logged, not retried, on failure." `scrubMatchSnapshots` is a `$executeRaw` over `rmhbox_match` whose `catch` only
    logs.
  - Sprint 08 19's follow-up: `CallMute.mutedUserId` has no index (only `@@unique([userId, mutedUserId])`,
    `@@index([userId, until])`), so its second-direction delete scans.
  - Sprint 05 01's leaderboard erasure (`leaderboardErasureOps`) and sprint 08 20's game erasure set the pattern; 07
    (same wave) adds board privacy to readers and does not touch erasure.
- **Decisions — per table** (with the same checks as 15: every reader, both directions, foreign-key order, JSON
  snapshots that carry names):

  | Model                                                          | Decision | Why                                                                                                                                                                                     |
  | -------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
  | `EloRating`, `RankedSeasonRating`                              | erase    | The member's ratings; boards read them by `game, rating`. Opponents' ratings are not recomputed (their gains and losses happened).                                                      |
  | `DoctrineReputation` (+ `DoctrineReputationLedger` by cascade) | erase    | Reputation and its ledger; the Doctrine board reads `totalXp`.                                                                                                                          |
  | `DoctrinePuzzleSubmission`                                     | erase    | Per-puzzle results; any denormalised solve count on `DoctrinePuzzle` is an anonymous tally and stays (counter rule).                                                                    |
  | `DoctrinePuzzleReplay`                                         | erase    | Private replays of the member's runs.                                                                                                                                                   |
  | `CommunityContributorScore`                                    | erase    | The member's row on contributor lists; other members' scores are unaffected (each row is independent).                                                                                  |
  | `BracketPick`                                                  | erase    | Pick'em picks; standings are computed from picks at read, so the member leaves the standings and nobody else's points change.                                                           |
  | `UserAchievement`                                              | erase    | Achievement progress; the public profile is scrubbed already. Site-wide "N % of players have this" figures, if computed from rows, drop by one (accepted, as for experiment exposures). |

  That is 8 registry entries (`TODO_CEILING` 25 → 17 if all are classified).

- **Names in match records:**
  - `RMHboxMatch.gameLog`: read who reads it (participants only); replace the member's display name and handle wherever
    they appear as values of known name fields (`name`, `userName`, `displayName`, `handle`) with "Deleted user" in
    entries whose `userId` is the member, in the same statement shape as `scrubMatchSnapshots`; free text inside a log
    line is out of scope (recorded).
  - `RmhTypeMatch.results` and `AltairMatch.results`: same treatment for the member's entry (keep numbers, replace
    names), since a future reader would otherwise show them.
- **Retried, not logged.** The after-transaction work (`dropGameBoardCaches`, `dropLearnerBoardCaches`,
  `scrubMatchSnapshots` and the new scrubs) moves into one idempotent job `account.after-erasure` (pg-boss, retried with
  backoff, singleton key per member), enqueued under the after-transaction anchor; the job's handler is registered under
  the jobs anchor `s09-16`. `anonymizeAccount` still runs the steps inline once (so caches drop at once) and enqueues
  the job only if a step threw; the job's failure after its retries is logged with the step name (no member data).
- **Indexes (concurrent, one per migration, each with `_ensure_valid`):** `call_mute ("mutedUserId")`,
  `slice_daily_entry ("userId")`, `"SongPlay" ("userId")` (that model has no `@@map`, so its table is `"SongPlay"` and
  the index `SongPlay_userId_idx`), declared with `@@index` and Prisma's default names — exactly
  `"call_mute_mutedUserId_idx"`, `"slice_daily_entry_userId_idx"` and `"SongPlay_userId_idx"` — each
  `CREATE INDEX CONCURRENTLY IF NOT EXISTS` alone in its migration, and each `_ensure_valid` migration a copy of
  `20261126060102_s06_flashcard_external_id_index_ensure_valid` (a plain, non-unique `CREATE INDEX` in the repair
  branch). Verified missing at the sprint 08 tip: `CallMute` has `@@unique([userId, mutedUserId])` and
  `@@index([userId, until])`; `SliceDailyEntry` `@@unique([dayKey, userId])`; `SongPlay` `@@unique([songId, userId])`.
  The implementer re-confirms before adding them.
- **Shape:** `boardsErasureOps(userId)` in new `lib/account/erasure-boards.server.ts` under the `s09-16` anchor; the
  scrubs in `lib/account/erasure-games.server.ts`.

## Functional requirements

1. FR-1 The eight erasures; registry entries; ceiling; deletion doc.
2. FR-2 The `gameLog` and two `results` scrubs.
3. FR-3 The `account.after-erasure` job and its enqueue.
4. FR-4 The three indexes and their `_ensure_valid` migrations.

## Non-functional requirements

- **Correctness:** raw SQL uses the real `@@map` table names and quoted camelCase columns, asserted in a test; each
  scrub only touches rows the member took part in (through the player table or the entry's `userId`); a re-run changes
  nothing (idempotent).
- **Performance:** every scrub is driven by an indexed lookup of the member's matches; the indexes remove the three
  scans.
- **Operations:** a failed after-erasure step is retried, then logged once.

## Data model and API

- Six migrations, as listed in `plan.md`; three `@@index` lines in `prisma/schema/messaging.prisma` and
  `prisma/schema/games/slice-it.prisma`.
- New `lib/account/erasure-boards.server.ts`, `lib/account/after-erasure-jobs.server.ts`. Edits:
  `lib/account/deletion.server.ts` (both anchors), `lib/account/erasure-games.server.ts`,
  `lib/account/erasure-registry.ts`, `server/jobs/index.ts` (anchor), `docs/account-deletion.md`.

## Testing requirements

- Main suite `lib/account/__tests__/boards-erasure.test.ts`: every table gets its operation with the right `where`;
  nothing else is touched.
- Main suite `lib/account/__tests__/match-scrub.test.ts`: the SQL names the real tables and columns; the job retries a
  failing step; a re-run is a no-op (with mocked `$executeRaw`).
- `erasure-coverage.test.ts` with the lower ceiling, `lib/__tests__/migration-safety.test.ts` (the concurrent pattern),
  `pnpm docs:deletion:check`.
- Integration smoke: the six migrations against Postgres; each scrub once.

## Acceptance criteria

- [ ] After deletion, the member is absent from ranked, Doctrine, contributor and pick'em lists, and their ratings rows
      are gone.
- [ ] Another player's RMHBox match log shows "Deleted user" where the name was.
- [ ] A scrub that fails once succeeds on the job's retry.
- [ ] `TODO_CEILING` equals the number of `todo` entries left (17 if all eight are classified).

## Out of scope

Recomputing opponents' ratings, free-text names inside chat or log lines, purchased items and progress (owner call),
follow-like rows.
