import { prisma } from '@/lib/prisma.server';

export interface AdminReviewCounts {
  /** Open moderation reports awaiting a decision. */
  reports: number;
  /** Total items needing admin attention (sum of the categories above). */
  total: number;
}

/**
 * Counts of things needing admin review, grouped by type. Powers the badge over
 * the Admin nav entry and the grouped breakdown on the dashboard. Extend the
 * object as more review queues are added (build submissions, appeals, etc.).
 */
export async function getAdminReviewCounts(): Promise<AdminReviewCounts> {
  const reports = await prisma.contentReport.count({ where: { status: 'PENDING' } });
  return { reports, total: reports };
}
