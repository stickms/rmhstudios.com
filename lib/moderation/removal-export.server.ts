/**
 * The member's removal records for the account export (sprint 15, feature 16): the kind, when it was removed, whether
 * a second look was asked and what came of it. No reporter, no report and no moderator: the record does not hold them.
 */
import { prisma } from '@/lib/prisma.server';
import { removalState } from '@/lib/moderation/removal-reviews';

export async function exportContentRemovals(userId: string): Promise<
  {
    kind: string;
    removedAt: string;
    reviewRequestedAt: string | null;
    reviewNote: string | null;
    reviewDecidedAt: string | null;
    outcome: 'upheld' | 'restored' | null;
  }[]
> {
  const rows = await prisma.contentRemoval.findMany({
    where: { authorId: userId },
    orderBy: { removedAt: 'desc' },
    select: {
      entityType: true,
      removedAt: true,
      reversible: true,
      reviewRequestedAt: true,
      reviewNote: true,
      reviewDecidedAt: true,
      reviewOutcome: true,
    },
  });
  return (Array.isArray(rows) ? rows : []).map((r) => {
    const state = removalState(r);
    return {
      kind: r.entityType,
      removedAt: r.removedAt.toISOString(),
      reviewRequestedAt: r.reviewRequestedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      reviewDecidedAt: r.reviewDecidedAt?.toISOString() ?? null,
      outcome: state === 'restored' ? 'restored' : state === 'upheld' ? 'upheld' : null,
    };
  });
}
