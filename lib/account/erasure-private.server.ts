import { prisma } from '@/lib/prisma.server';

/**
 * Sprint 08 erasure of the member's own profile extras, saved places, ladder data, recipes, inbox arrangement,
 * mutes and rivals, and characters. Account deletion anonymises the `User` row in place, so none of the
 * `onDelete: Cascade` relations fire; each table is deleted here by the member's id.
 *
 * Prisma operations only (no raw SQL, no pre-step read), one `deleteMany` per table; `CallMute` and `ArcadeRival`
 * go both ways (the second pass is the rows that name the member as the muted user or the rival). Every filtered
 * column leads an index except `CallMute.mutedUserId`, a small table scanned once per deletion.
 *
 * `LadderReferralOffer` is the one place another member's rows go: requests sent to the member's offers go by the
 * database cascade, because a request to an offer that no longer exists can never be answered. `Stamp` is a kept
 * model: its `addCount` is an anonymous tally and is not decremented when `ProfileStamp` rows go.
 */
export function privateDataErasureOps(userId: string) {
  return [
    // Profile extras (`ProfileVisitDay` goes with `ProfilePlus` by the database cascade).
    prisma.profileLink.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.profilePlus.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.profileLayout.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.profileStamp.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.loadoutPreset.deleteMany({
      where: {
        userId,
      },
    }),
    // RMHLadder.
    prisma.ladderJobMatch.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.ladderResumeReview.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.ladderAiTask.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.ladderReferralRequest.deleteMany({
      where: {
        applicantId: userId,
      },
    }),
    prisma.ladderReferralOffer.deleteMany({
      where: {
        userId,
      },
    }),
    // Recipes, saved places, saved homes and searches.
    prisma.devRecipe.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rideSavedPlace.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.homeFavorite.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.homeWatch.deleteMany({
      where: {
        userId,
      },
    }),
    // Seen markers, shelves, alerts, exposures, idempotency records.
    prisma.blogAnnouncementSeen.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.readingShelfEntry.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.discordWatchAlert.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.experimentExposure.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.siteIdempotencyKey.deleteMany({
      where: {
        userId,
      },
    }),
    // Inbox arrangement and availability (`ChatFolderItem` and the office-hours windows go by cascade).
    prisma.chatFolder.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.directMessageHide.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.officeHoursConfig.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.availabilityPollInvitee.deleteMany({
      where: {
        userId,
      },
    }),
    // Mutes and rivals, both directions.
    prisma.callMute.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.callMute.deleteMany({
      where: {
        mutedUserId: userId,
      },
    }),
    prisma.arcadeRival.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.arcadeRival.deleteMany({
      where: {
        rivalUserId: userId,
      },
    }),
    // Fortunes and characters.
    prisma.fortuneCookie.deleteMany({
      where: {
        userId,
      },
    }),
    prisma.rmhCharacter.deleteMany({
      where: {
        userId,
      },
    }),
  ];
}
