/**
 * Removals after a report, server half (sprint 15, feature 16). The pure rules and the reversible list are in
 * `removal-reviews.ts`.
 *
 * - `recordContentRemoval`: one `ContentRemoval` row per report takedown of a member's item, and the author's notice.
 *   Unique on `reportId`, so a repeated decision writes nothing. The record never stores who reported, why, or how many.
 * - `listMyRemovals`: the author's own list. No report id, reason, note or count, no reporter, no moderator.
 * - `requestRemovalReview`: once, within 14 days, for a reversible removal. One conditional `updateMany`, so a double
 *   click asks once and a lost race answers a refusal.
 * - `listAdminRemovalReviews` / `decideRemovalReview`: the "Removal reviews" tab. A decision is one conditional
 *   `updateMany` (`reviewDecidedAt: null`) in a transaction with the restore and the audit row, so two admins deciding
 *   one review leave one winner and one notice. Reporters are not told.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { ACCOUNT_STATUS_LINK } from '@/lib/moderation/restrictions.server';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import {
  canAskForReview,
  isReversibleRemovalType,
  removalState,
  reviewCutoff,
  type RemovalReviewAction,
  type RemovalReviewOutcome,
} from '@/lib/moderation/removal-reviews';
import { afterRestoredItem, removedItemTitles, restoreRemovedItem } from '@/lib/moderation/removal-restore.server';
import type { AdminRemovalReview, MyRemoval } from '@/lib/moderation/removal-reviews.contract';

/** The most removals one member's list returns. */
const MY_REMOVALS_LIMIT = 50;
/** The most reviews one admin tab returns. */
const ADMIN_REVIEWS_LIMIT = 50;

/* ------------------------------- the record ------------------------------- */

export type RecordRemovalResult = 'recorded' | 'unnotified' | 'duplicate' | 'standing' | 'failed';

/**
 * Record one takedown and tell its author. Called by `decideReports` after the takedown succeeded and the report was
 * claimed; it never throws, so it can neither block nor undo the takedown.
 *
 * - `duplicate`: this report already has its row. Nothing is written and nobody is told again.
 * - `standing`: the item is still down from an earlier removal that was not restored, so the author already knows.
 *   Nothing is written; the caller may still pass on a message the moderator typed.
 * - `failed`: logged; the caller falls back to the plain decision notice so a typed message is not lost.
 * - `unnotified`: the row was written but the notice failed (logged); the caller falls back the same way.
 *
 * The author gets one notice: `content-removed-after-report-message` when the moderator wrote a message (it replaces
 * `report-decision` for a takedown), else `content-removed-after-report`. A failed notice is logged and the record stays.
 */
export async function recordContentRemoval(input: {
  reportId: string;
  entityType: string;
  entityId: string;
  authorId: string;
  message?: string | undefined;
  now?: Date;
}): Promise<RecordRemovalResult> {
  const now = input.now ?? new Date();
  let removalId: string;
  try {
    // Still down from an earlier removal (never asked about, or upheld): the author already knows.
    const standing = await prisma.contentRemoval.findFirst({
      where: {
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: input.authorId,
        OR: [{ reviewOutcome: null }, { reviewOutcome: 'upheld' }],
      },
      select: { id: true },
    });
    if (standing) return 'standing';
    const row = await prisma.contentRemoval.create({
      data: {
        reportId: input.reportId,
        entityType: input.entityType,
        entityId: input.entityId,
        authorId: input.authorId,
        removedAt: now,
        reversible: isReversibleRemovalType(input.entityType),
      },
      select: { id: true },
    });
    removalId = row.id;
  } catch (e) {
    // The unique `reportId`: a repeated decision of the same report.
    if ((e as { code?: string } | null)?.code === 'P2002') return 'duplicate';
    console.error('[removals] could not record a removal:', e);
    return 'failed';
  }
  try {
    const message = input.message?.trim();
    await createNotification({
      userId: input.authorId,
      type: 'SYSTEM',
      entityType: 'moderation',
      entityId: removalId,
      link: ACCOUNT_STATUS_LINK,
      preview: message
        ? notice('content-removed-after-report-message', { kind: input.entityType, message })
        : notice('content-removed-after-report', { kind: input.entityType }),
    });
  } catch (e) {
    console.error('[removals] could not tell the author of a removal:', e);
    return 'unnotified';
  }
  return 'recorded';
}

/* ------------------------------ the author's list ------------------------------ */

export async function listMyRemovals(userId: string, now: Date = new Date()): Promise<MyRemoval[]> {
  const rows = await prisma.contentRemoval.findMany({
    where: { authorId: userId },
    orderBy: { removedAt: 'desc' },
    take: MY_REMOVALS_LIMIT,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      removedAt: true,
      reversible: true,
      reviewRequestedAt: true,
      reviewDecidedAt: true,
      reviewOutcome: true,
    },
  });
  const titles = await removedItemTitles(
    rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId })),
    userId,
  );
  return rows.map((r) => ({
    id: r.id,
    kind: r.entityType,
    title: titles.get(`${r.entityType}:${r.entityId}`) ?? null,
    removedAt: r.removedAt.toISOString(),
    state: removalState(r),
    canAsk: canAskForReview(r, now),
    reversible: r.reversible,
    reviewRequestedAt: r.reviewRequestedAt?.toISOString() ?? null,
    reviewDecidedAt: r.reviewDecidedAt?.toISOString() ?? null,
  }));
}

/* ------------------------------- asking ------------------------------- */

export type RequestReviewResult = 'asked' | 'not_found' | 'already_asked' | 'closed';

/**
 * Ask for a second look. Somebody else's removal and one that does not exist are the same `not_found`. The write is one
 * `updateMany` repeating every condition, so two taps ask once; the one that loses re-reads to say why.
 */
export async function requestRemovalReview(
  userId: string,
  id: string,
  note: string | undefined,
  now: Date = new Date(),
): Promise<RequestReviewResult> {
  const row = await prisma.contentRemoval.findUnique({
    where: { id },
    select: { authorId: true, reversible: true, removedAt: true, reviewRequestedAt: true },
  });
  if (!row || row.authorId !== userId) return 'not_found';
  if (row.reviewRequestedAt) return 'already_asked';
  if (!row.reversible || row.removedAt.getTime() < reviewCutoff(now).getTime()) return 'closed';

  const done = await prisma.contentRemoval.updateMany({
    where: {
      id,
      authorId: userId,
      reversible: true,
      reviewRequestedAt: null,
      removedAt: { gte: reviewCutoff(now) },
    },
    data: { reviewRequestedAt: now, reviewNote: note?.trim() || null },
  });
  if (done.count === 1) return 'asked';
  const after = await prisma.contentRemoval.findUnique({ where: { id }, select: { reviewRequestedAt: true } });
  return after?.reviewRequestedAt ? 'already_asked' : 'closed';
}

/* ------------------------------- the admin tab ------------------------------- */

export async function listAdminRemovalReviews(
  status: 'pending' | 'decided',
): Promise<{ items: AdminRemovalReview[]; counts: { pending: number; decided: number } }> {
  const where: Prisma.ContentRemovalWhereInput =
    status === 'pending'
      ? { reviewRequestedAt: { not: null }, reviewDecidedAt: null }
      : { reviewRequestedAt: { not: null }, reviewDecidedAt: { not: null } };
  const [rows, pending, decided] = await Promise.all([
    prisma.contentRemoval.findMany({
      where,
      orderBy: status === 'pending' ? { reviewRequestedAt: 'asc' } : { reviewDecidedAt: 'desc' },
      take: ADMIN_REVIEWS_LIMIT,
      select: {
        id: true,
        entityType: true,
        entityId: true,
        removedAt: true,
        reviewRequestedAt: true,
        reviewNote: true,
        reviewDecidedAt: true,
        reviewOutcome: true,
        author: { select: userDisplaySelect },
      },
    }),
    prisma.contentRemoval.count({ where: { reviewRequestedAt: { not: null }, reviewDecidedAt: null } }),
    prisma.contentRemoval.count({ where: { reviewRequestedAt: { not: null }, reviewDecidedAt: { not: null } } }),
  ]);
  const titles = await removedItemTitles(rows.map((r) => ({ entityType: r.entityType, entityId: r.entityId })));
  const items: AdminRemovalReview[] = [];
  for (const r of rows) {
    if (!r.reviewRequestedAt) continue;
    const author = resolveUser(r.author);
    items.push({
      id: r.id,
      kind: r.entityType,
      title: titles.get(`${r.entityType}:${r.entityId}`) ?? null,
      author: { id: author.id, name: author.name, handle: author.handle, image: author.image },
      removedAt: r.removedAt.toISOString(),
      reviewRequestedAt: r.reviewRequestedAt.toISOString(),
      reviewNote: r.reviewNote,
      reviewDecidedAt: r.reviewDecidedAt?.toISOString() ?? null,
      outcome: r.reviewOutcome === 'restored' ? 'restored' : r.reviewOutcome === 'upheld' ? 'upheld' : null,
    });
  }
  return { items, counts: { pending, decided } };
}

export type DecideReviewResult =
  | { ok: true; outcome: RemovalReviewOutcome }
  | { ok: false; reason: 'not_found' | 'not_requested' | 'already_decided' | 'not_reversible' };

/**
 * Decide a requested review. The claim, the restore and the audit row are one transaction: a lost race rolls nothing
 * back because nothing ran (`count` 0 returns before the restore). The author is told after the commit.
 */
export async function decideRemovalReview(
  adminId: string,
  id: string,
  action: RemovalReviewAction,
  now: Date = new Date(),
): Promise<DecideReviewResult> {
  const row = await prisma.contentRemoval.findUnique({
    where: { id },
    select: {
      authorId: true,
      entityType: true,
      entityId: true,
      reversible: true,
      reviewRequestedAt: true,
      reviewDecidedAt: true,
    },
  });
  if (!row) return { ok: false, reason: 'not_found' };
  if (!row.reviewRequestedAt) return { ok: false, reason: 'not_requested' };
  if (row.reviewDecidedAt) return { ok: false, reason: 'already_decided' };
  if (action === 'restore' && !row.reversible) return { ok: false, reason: 'not_reversible' };
  const restoring = action === 'restore';
  const outcome: RemovalReviewOutcome = restoring ? 'restored' : 'upheld';

  const claimed = await prisma.$transaction(async (tx) => {
    const done = await tx.contentRemoval.updateMany({
      where: { id, reviewRequestedAt: { not: null }, reviewDecidedAt: null },
      data: { reviewDecidedAt: now, reviewOutcome: outcome, reviewedById: adminId },
    });
    if (done.count !== 1) return false;
    if (restoring && isReversibleRemovalType(row.entityType))
      await restoreRemovedItem(tx, row.entityType, row.entityId);
    await recordAdminActionIn(tx, adminId, `removal-review.${action}`, {
      targetType: row.entityType,
      targetId: row.entityId,
      detail: `removal ${id}`,
    });
    return true;
  });
  if (!claimed) return { ok: false, reason: 'already_decided' };

  if (restoring && isReversibleRemovalType(row.entityType)) {
    try {
      await afterRestoredItem(row.entityType, row.entityId);
    } catch (e) {
      console.error('[removals] cache refresh after a restore failed:', e);
    }
  }
  await createNotification({
    userId: row.authorId,
    type: 'SYSTEM',
    entityType: 'moderation',
    entityId: id,
    link: ACCOUNT_STATUS_LINK,
    preview: notice(restoring ? 'removal-review-restored' : 'removal-review-upheld', { kind: row.entityType }),
  });
  return { ok: true, outcome };
}
