import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';

export interface AdminReviewCounts {
  /** Open moderation reports awaiting a decision. */
  reports: number;
  /** Creator redemption requests awaiting review. */
  redemptions: number;
  /** Total items needing admin attention (sum of the categories above). */
  total: number;
}

/**
 * Counts of things needing admin review, grouped by type. Powers the badge over
 * the Admin nav entry and the grouped breakdown on the dashboard. Extend the
 * object as more review queues are added (build submissions, appeals, etc.).
 */
export async function getAdminReviewCounts(): Promise<AdminReviewCounts> {
  const [reports, redemptions] = await Promise.all([
    prisma.contentReport.count({ where: { status: 'PENDING' } }),
    prisma.redemptionRequest.count({ where: { status: 'PENDING' } }),
  ]);
  return { reports, redemptions, total: reports + redemptions };
}

/**
 * Notify every admin that something needs review, grouped so a burst of items
 * doesn't spam. `dedupeUnread` collapses repeated same-kind alerts into one
 * unread notification (refreshing it, not re-pushing), so admins get pinged once
 * per queue until they clear it. Fire-and-forget: never blocks the originating
 * action, and failures are logged, not thrown.
 */
export async function notifyAdminsOfReview(opts: {
  preview: string;
  /** Groups the alert; same kind → one grouped notification (default 'reports'). */
  kind?: string;
  link?: string;
}): Promise<void> {
  try {
    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
    await Promise.all(
      admins.map((a) =>
        createNotification({
          userId: a.id,
          type: 'SYSTEM',
          entityType: 'admin-review',
          entityId: opts.kind ?? 'reports',
          preview: opts.preview,
          link: opts.link ?? '/admin/reports',
          dedupeUnread: true,
        })
      )
    );
  } catch (err) {
    console.error('[admin-review] failed to notify admins:', err);
  }
}
