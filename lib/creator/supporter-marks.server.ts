import { prisma } from '@/lib/prisma.server';
import { getSupporterBadgeMap } from '@/lib/creator/tiers.server';

/**
 * Which of a post's repliers are active supporters of the post's author (sprint 14 #13).
 *
 * Only the post's own author is told, and only while their "Show supporter marks on replies" switch is on: for any
 * other viewer (signed out, a supporter, another replier) this answers `null` without a query, and the reply route
 * leaves the `supporter` field out altogether so two responses cannot be compared. With the switch off the
 * membership lookup is never made either.
 *
 * One switch read and one batched membership read (`getSupporterBadgeMap`) per page of replies.
 */
export async function supporterMarksFor(
  viewerId: string | null | undefined,
  post: { userId: string },
  replyAuthorIds: readonly string[],
): Promise<Set<string> | null> {
  if (!viewerId || viewerId !== post.userId) return null;

  const profile = await prisma.userProfile.findUnique({
    where: { userId: viewerId },
    select: { showSupporterMarks: true },
  });
  // No profile row yet means the column's default: on.
  if (profile && !profile.showSupporterMarks) return null;

  // A creator's reply to their own thread is never marked as a supporter of themselves.
  const authors = replyAuthorIds.filter((id) => id && id !== viewerId);
  return getSupporterBadgeMap(authors, viewerId);
}
