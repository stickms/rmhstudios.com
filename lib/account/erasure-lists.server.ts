import { prisma } from '@/lib/prisma.server';

/**
 * Sprint 09 15: the member's own lists, tools and study data are erased with the account. Account deletion
 * anonymises the `User` row in place, so none of the `onDelete: Cascade` relations fire; each table is deleted here
 * by the member's id. Prisma operations only (no raw SQL, no pre-step read), one `deleteMany` per table.
 *
 * Children go by the database cascade, and each was checked: `AiPersona` takes its `AiPersonaMessage` rows (only
 * for a private persona no other member ever chatted with; see below), `CustomFeed` takes its `CustomFeedMember` and
 * `CustomFeedSubscription` rows (a list that no longer exists lists and serves nobody), `RmhStudyProfile` takes its
 * `RmhStudySession` rows. `MemberMemory`, `ReadingSubscription`, `SavingsGoal`, `WishlistEntry`, `MarathonList`,
 * `SharedMoment` and `StudyBuddyRequest` have no child rows. Nothing else references these tables by a plain id.
 *
 * Partial erasures: `AiPersona` only where `isPublic = false` and no other member has chatted with it (a persona made
 * private after being public keeps those members' chats; it is unreachable, as its owner is a tombstone); `CustomFeed` only where the legacy `isPublic` flag and
 * `visibility` both say not public (the site's `readableByOthers` reads both); `CommunityJoinRequest` pending rows go
 * and decided rows stay with `message` cleared. `FeedSignal` rows that name the member as a `less_author` target are
 * other members' tuning and are left (no index on `targetId`). Counters on kept models (`EmojiPack.subscriberCount`)
 * are anonymous tallies and are left.
 */
export function listsErasureOps(userId: string) {
  return [
    // Persona chats (any persona), then the member's private personas.
    prisma.aiPersonaMessage.deleteMany({ where: { userId } }),
    // A persona that was public and later made private may hold other members' chats (the chat route writes rows under
    // the chatter's userId); it is kept, since deleting it would cascade their messages.
    prisma.aiPersona.deleteMany({
      where: { ownerId: userId, isPublic: false, messages: { none: { userId: { not: userId } } } },
    }),
    // What the delete above left of a private persona is kept for the other members' chats, which show its name,
    // emoji and avatar; the member's own words on it (prompt, tagline, greeting) go in the same step.
    prisma.aiPersona.updateMany({
      where: { ownerId: userId, isPublic: false },
      data: { systemPrompt: '', tagline: null, greeting: null },
    }),
    prisma.emojiPackSubscription.deleteMany({ where: { userId } }),
    // Feed tuning, own rows only.
    prisma.feedSignal.deleteMany({ where: { userId } }),
    prisma.postAutoDelete.deleteMany({ where: { userId } }),
    // Lists and tools.
    prisma.marathonList.deleteMany({ where: { userId } }),
    prisma.memberMemory.deleteMany({ where: { userId } }),
    prisma.readingSubscription.deleteMany({ where: { userId } }),
    prisma.savingsGoal.deleteMany({ where: { userId } }),
    prisma.wishlistEntry.deleteMany({ where: { userId } }),
    prisma.customFeed.deleteMany({ where: { ownerId: userId, isPublic: false, visibility: { not: 'PUBLIC' } } }),
    // Community answers and requests.
    prisma.communityOnboardingAnswer.deleteMany({ where: { userId } }),
    prisma.communityJoinRequest.deleteMany({ where: { userId, status: 'PENDING' } }),
    prisma.communityJoinRequest.updateMany({
      where: { userId, status: { not: 'PENDING' }, message: { not: null } },
      data: { message: null },
    }),
    // Study.
    prisma.rmhStudyProfile.deleteMany({ where: { userId } }),
    prisma.flashcardTestResult.deleteMany({ where: { userId } }),
    prisma.studyBuddyRequest.deleteMany({ where: { userId } }),
    // Close friends, both directions.
    prisma.closeFriend.deleteMany({ where: { ownerId: userId } }),
    prisma.closeFriend.deleteMany({ where: { memberId: userId } }),
    // Share cards snapshot the member's name in `payload`.
    prisma.sharedMoment.deleteMany({ where: { userId } }),
  ];
}
