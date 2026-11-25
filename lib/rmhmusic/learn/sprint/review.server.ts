/**
 * The `[Auto]` review of a Daily board run (RMH Music Phase 6, plan §1.3): a ranked run that asks
 * for a look (`plausible.ts` `needsReview`) files ONE report into the existing moderation queue,
 * the way `lib/moderation/auto-moderate.server.ts` does: attributed to the first admin, marked
 * `[Auto]`, reason `OTHER`, and the admins are notified. The run stays on the board until a human
 * acts ("Resolve & remove content" hides it; "Ban author" takes the learner off every board).
 *
 * Deduplicated on an open report for the row and on any auto report about the learner's scores in
 * the last 30 days, so a strong reader is looked at once, not every morning. Never throws: the
 * save that calls it has already kept the run.
 */
import { notifyAdminsOfReview } from '@/lib/admin-review.server';
import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';

/** The report entity type of a Daily score (`lib/moderation/report-schema.ts`). */
export const MUSIC_SCORE_ENTITY = 'music-score';

/** How long one auto report about a learner covers their later perfect runs. */
const AUTO_DEDUPE_MS = 30 * 86_400_000;

export interface BoardReviewArgs {
  userId: string;
  /** The `MusicSprintDaily` id: the report's entity id. */
  rowId: string;
  date: string;
  score: number;
  avgMs: number | null;
  now: number;
}

/** File the `[Auto]` report for a run that asks for a look. True when one was filed. */
export async function fileBoardReview(args: BoardReviewArgs): Promise<boolean> {
  try {
    const open = await prisma.contentReport.findFirst({
      where: {
        entityType: MUSIC_SCORE_ENTITY,
        entityId: args.rowId,
        status: {
          in: ['PENDING', 'REVIEWING'],
        },
      },
      select: {
        id: true,
      },
    });
    if (open) return false;
    const recent = await prisma.contentReport.findFirst({
      where: {
        entityType: MUSIC_SCORE_ENTITY,
        targetUserId: args.userId,
        details: {
          startsWith: '[Auto]',
        },
        createdAt: {
          gte: new Date(args.now - AUTO_DEDUPE_MS),
        },
      },
      select: {
        id: true,
      },
    });
    if (recent) return false;
    const admin = await prisma.user.findFirst({
      where: {
        isAdmin: true,
      },
      select: {
        id: true,
      },
      orderBy: {
        createdAt: 'asc',
      },
    });
    if (!admin) return false;
    const avg = args.avgMs === null ? 'no right answers' : `a mean answer of ${args.avgMs} ms`;
    await prisma.contentReport.create({
      data: {
        reporterId: admin.id,
        entityType: MUSIC_SCORE_ENTITY,
        entityId: args.rowId,
        reason: 'OTHER',
        details: `[Auto] RMH Music Daily board: ${args.score} points on ${args.date} with ${avg}. Please check the run looks human; "Resolve & remove content" takes it off the board.`,
        targetUserId: args.userId,
      },
    });
    void notifyAdminsOfReview({
      notice: notice('admin-review-music-score', {}),
      kind: 'reports',
    });
    return true;
  } catch (err) {
    console.error('[rmhmusic] board review report failed:', err);
    return false;
  }
}
