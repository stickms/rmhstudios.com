import { prisma } from '@/lib/prisma.server';

/**
 * Sprint 07 erasure coverage: the clearly private leaf tables that only the member ever reads, none of which
 * `anonymizeAccount` erased before. Account deletion anonymises the `User` row in place, so `onDelete: Cascade` never
 * fires and each of these would otherwise stay behind for a tombstone.
 *
 * Exactly these operations and no others (a test pins it): one `deleteMany` on the member column of each model, every
 * one of which leads an index (`@id`, `@@unique` or `@@index` starting with `userId`). `SavedItem` goes before
 * `SaveFolder`, which its rows refer to. Public reading highlights are published content and stay.
 *
 * Prisma operations only: no pre-step reads and no raw SQL, so the transaction array stays simple.
 * The registry (`erasure-registry.ts`) classifies every other model.
 */
export function coverageErasureOps(userId: string) {
  return [
    prisma.userBirthday.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.reminder.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.scheduledPost.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.readingGoal.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.readingPrefs.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.historyEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.savedItem.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.saveFolder.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.calcNotebook.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.studyPlan.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.appearancePreference.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.keyboardPreference.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.layoutPreference.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.notificationPreference.deleteMany({
      where: {
        userId,
      },
    }),
    // Addressed to the member; notifications about them sent to others (`actorId`) stay and render "Deleted user".
    prisma.notification.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.heldNotification.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.keywordAlertHit.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.targetedNoticeDismissal.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhTubeWatchLater.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.memoriesOptIn.deleteMany({
      where: {
        userId,
      },
    }),
    // Private highlights (with their notes) only: a public highlight is published content.
    prisma.readingHighlight.deleteMany({
      where: {
        userId,
        isPublic: false,
      },
    }),
  ];
}
