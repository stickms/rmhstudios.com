import { prisma } from '@/lib/prisma.server';

/**
 * RMH Med Schools (phase 4): the member's private tracker, school lists and preferences are erased with the account.
 * Account deletion anonymises the `User` row in place, so none of the `onDelete: Cascade` relations fire; the three
 * models that carry `userId` are deleted here by the member's id, one `deleteMany` each.
 *
 * Children go by the database cascade, and each was checked in `prisma/schema/medschools.prisma`:
 * `MedTrackerCycle` takes its `MedTrackerApplication` rows, which take their `MedTrackerMilestone` rows;
 * `MedSchoolList` takes its `MedSchoolListItem` rows. `MedUserPrefs` has no children. Nothing else references these
 * tables by a plain id.
 *
 * The anonymous shared events (`MedCycleEvent`, source RMH) and the count rows built from them are NOT reachable from
 * here: an event is found only by recomputing its hash from a milestone id and the server secret, and the milestone
 * ids must be read before the rows go. `eraseSharedMedEvents` (`features/medschools/api/share-sync.server.ts`) does
 * that: at the deletion request (`scheduleDeletion`, plan Q3) and again as the first step of `anonymizeAccount` before
 * the erasure transaction, so a finalisation can never cascade-orphan an event. Both runs are idempotent.
 */
export function medschoolsErasureOps(userId: string) {
  return [
    prisma.medTrackerCycle.deleteMany({ where: { userId } }),
    prisma.medSchoolList.deleteMany({ where: { userId } }),
    prisma.medUserPrefs.deleteMany({ where: { userId } }),
  ];
}
