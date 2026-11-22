/**
 * Pause everything that acts for a member the moment they ask for their account to be deleted, and restore the
 * keys and webhooks when signing back in cancels it (s09-14).
 *
 * `pauseForDeletion` runs BEFORE `scheduleDeletion` and throws on any failure, so a deletion that leaves a key
 * live is never scheduled. The sessions, RMHCode tokens and calendar steps are `secureAccount`'s own, exported
 * from `lib/admin/secure-account.server.ts`.
 */
import { notice } from '@/lib/notifications/notice-keys';
import { prisma } from '@/lib/prisma.server';
import { cancelBulkOperation } from '@/lib/bulk/bulk.server';
import { createNotification } from '@/lib/notifications.server';
import { deleteSessionsOf, revokeRmhCodeTokensOf, rotateCalendarFeedOf } from '@/lib/admin/secure-account.server';
import {
  DELETION_DRAFTS_WAITED_ENTITY,
  DELETION_REQUESTED,
  DRAFTS_PAGE_PATH,
  mergeIds,
  planRestore,
  type DeletionPausePreview,
} from '@/lib/account/deletion-hold';

/** What a request would pause, counted. Reads only. */
export async function previewDeletionPause(userId: string): Promise<DeletionPausePreview> {
  const [apiKeys, webhooks, scheduledPosts] = await Promise.all([
    prisma.developerApiKey.count({ where: { userId, revokedAt: null, suspendedAt: null } }),
    prisma.webhookEndpoint.count({ where: { userId, enabled: true } }),
    prisma.scheduledPost.count({ where: { userId, publishedId: null, scheduledAt: { not: null } } }),
  ]);
  return { apiKeys, webhooks, scheduledPosts };
}

/**
 * Stop the account: queued bulk clean-ups are cancelled, then in one transaction every session goes (push
 * subscriptions with them), active keys are suspended, enabled webhooks are disabled, RMHCode tokens are revoked,
 * the calendar token is rotated, and the hold records exactly the ids changed here. Scheduled posts and recurring
 * templates need no write: the publisher and the recurring cron look at `deletionScheduledAt`.
 */
export async function pauseForDeletion(userId: string, now: Date = new Date()): Promise<void> {
  const queued = await prisma.bulkOperation.findMany({
    where: { userId, status: { in: ['PENDING', 'RUNNING'] } },
    select: { id: true },
    take: 200,
  });
  for (const op of Array.isArray(queued) ? queued : []) await cancelBulkOperation(userId, op.id);

  await prisma.$transaction(async (tx) => {
    await deleteSessionsOf(tx, userId);

    // Compare-and-set on "not suspended yet", so a key an admin suspended between the read and the write is not
    // claimed (and not recorded) by this request.
    const keys = await tx.developerApiKey.findMany({
      where: { userId, revokedAt: null, suspendedAt: null },
      select: { id: true },
    });
    const keyIds: string[] = [];
    for (const k of keys) {
      const { count } = await tx.developerApiKey.updateMany({
        where: { id: k.id, revokedAt: null, suspendedAt: null },
        data: { suspendedAt: now, suspendReason: DELETION_REQUESTED },
      });
      if (count === 1) keyIds.push(k.id);
    }

    const hooks = await tx.webhookEndpoint.findMany({
      where: { userId, enabled: true },
      select: { id: true },
    });
    const webhookIds: string[] = [];
    for (const w of hooks) {
      const { count } = await tx.webhookEndpoint.updateMany({
        where: { id: w.id, enabled: true },
        data: { enabled: false },
      });
      if (count === 1) webhookIds.push(w.id);
    }

    await revokeRmhCodeTokensOf(tx, userId, now);
    await rotateCalendarFeedOf(tx, userId, now);

    // A second request while one is pending finds nothing new to pause; it must not wipe the first one's record.
    const existing = await tx.deletionHold.findUnique({ where: { userId } });
    await tx.deletionHold.upsert({
      where: { userId },
      create: { userId, keyIds, webhookIds, createdAt: now },
      update: {
        keyIds: mergeIds(existing?.keyIds ?? [], keyIds),
        webhookIds: mergeIds(existing?.webhookIds ?? [], webhookIds),
      },
    });
  });
}

/**
 * Signing back in cancelled the deletion: lift what the hold paused and is still as the hold left it, delete the
 * hold, and tell the member once when scheduled posts came due while the account was set to be deleted. Sessions,
 * tokens and the calendar URL are not restored. No hold means nothing to do.
 */
export async function restoreAfterCancel(userId: string, now: Date = new Date()): Promise<void> {
  const hold = await prisma.deletionHold.findUnique({ where: { userId } });
  if (!hold) return;

  const [keys, hooks] = await Promise.all([
    prisma.developerApiKey.findMany({
      where: { userId, id: { in: hold.keyIds } },
      select: { id: true, revokedAt: true, suspendedAt: true, suspendReason: true },
    }),
    prisma.webhookEndpoint.findMany({
      where: { userId, id: { in: hold.webhookIds } },
      select: { id: true, enabled: true },
    }),
  ]);
  const plan = planRestore(hold, keys, hooks);

  await prisma.$transaction([
    // The conditions are repeated in the write: a key an admin suspended after the read above stays suspended.
    prisma.developerApiKey.updateMany({
      where: { userId, id: { in: plan.keyIds }, suspendReason: DELETION_REQUESTED, revokedAt: null },
      data: { suspendedAt: null, suspendReason: null },
    }),
    prisma.webhookEndpoint.updateMany({
      // An endpoint an admin switched off while the hold was in place stays off (s10-15).
      where: { userId, id: { in: plan.webhookIds }, enabled: false, adminDisabledAt: null },
      data: { enabled: true, failureCount: 0 },
    }),
    prisma.deletionHold.deleteMany({ where: { userId } }),
  ]);

  const waited = await prisma.scheduledPost.count({
    where: { userId, publishedId: null, scheduledAt: { not: null, gte: hold.createdAt, lte: now } },
  });
  if (waited > 0) {
    await createNotification({
      userId,
      type: 'SYSTEM',
      entityType: DELETION_DRAFTS_WAITED_ENTITY,
      entityId: `deletion-hold:${hold.createdAt.getTime()}`,
      preview:
        waited === 1 ? notice('deletion-drafts-waited-one', {}) : notice('deletion-drafts-waited', { count: waited }),
      link: DRAFTS_PAGE_PATH,
    });
  }
}
