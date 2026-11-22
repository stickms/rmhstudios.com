import { prisma } from '@/lib/prisma.server';

/**
 * Sprint 09 16: the member's ratings, puzzle results, reputation, contributor score, pick'em picks and achievements
 * go with the account. Account deletion anonymises the `User` row in place, so none of the `onDelete: Cascade`
 * relations fire; each table is deleted here by the member's own id (every one has a single `userId` column, and
 * none is two-sided). Prisma operations only, one `deleteMany` per table.
 *
 * Other players are not touched:
 * - `EloRating` and `RankedSeasonRating` are one row per member and game (and season); opponents' ratings are not
 *   recomputed, since their gains and losses happened. Nothing references these rows by a plain id.
 * - `DoctrineReputation` takes its `DoctrineReputationLedger` rows through the database cascade
 *   (`reputationId`, `onDelete: Cascade`), which is the only foreign-key child. The Doctrine board reads `totalXp`.
 * - `DoctrinePuzzleSubmission` is a child of the shared `DoctrinePuzzle`; the puzzle keeps no solve counter, so there
 *   is nothing to correct. `DoctrinePuzzleReplay` is the member's own private run record.
 * - `CommunityContributorScore` is keyed `(communityId, userId)`; every row is independent, so no other member's
 *   score changes.
 * - `BracketPick`: standings are computed from picks when read, so the member leaves the standings and nobody
 *   else's points change.
 * - `UserAchievement`: a site-wide "N % have this" figure computed from rows drops by one (accepted).
 *
 * No table here references another by a plain id and each references `User`, which stays: the order of the
 * statements is free (the ledger goes with its reputation row).
 */
export function boardsErasureOps(userId: string) {
  return [
    // Ratings.
    prisma.eloRating.deleteMany({ where: { userId } }),
    prisma.rankedSeasonRating.deleteMany({ where: { userId } }),
    // Doctrine: reputation (its ledger cascades), per-puzzle results, private replays.
    prisma.doctrineReputation.deleteMany({ where: { userId } }),
    prisma.doctrinePuzzleSubmission.deleteMany({ where: { userId } }),
    prisma.doctrinePuzzleReplay.deleteMany({ where: { userId } }),
    // Contributor lists, pick'em, achievements.
    prisma.communityContributorScore.deleteMany({ where: { userId } }),
    prisma.bracketPick.deleteMany({ where: { userId } }),
    prisma.userAchievement.deleteMany({ where: { userId } }),
  ];
}
