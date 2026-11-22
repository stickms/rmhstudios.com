/**
 * Spam sweeps (sprint 08 18) — server logic. Server only: never import from a component.
 *
 * An admin previews, confirms and (if it was a mistake) undoes the removal of a member's posts and replies in
 * a time window. The durable part copies the bulk runner (`lib/bulk/bulk.server.ts`, sprint 07 15): a lease
 * on the row, not the job, decides who runs; every batch renews it and persists the keyset cursor, so a
 * restarted worker continues after it and a sweep is never counted twice; `reclaimStalledSweeps` re-queues the
 * ones whose lease expired.
 *
 * Every removal and every restore goes through `moderateContent` with `sweep: { id }`, so the per-item notice
 * and audit row are skipped and this module writes ONE of each per run (and per undo) instead:
 *
 *  - a run ends with one `SYSTEM` notice (`moderation-sweep`), one audit row (`sweep.remove`, written in the
 *    transaction that marks the sweep DONE) and, when chosen, one strike;
 *  - an undo restores exactly the items still in the state the sweep left them (`canUndoItem`), voids the
 *    sweep's strike the way an overturned appeal does, and ends with one notice (`moderation-sweep-undone`)
 *    and one audit row (`sweep.undo`).
 *
 * The sweep never bans; the admin gets the ban action as a link beside it.
 */

import { notice } from '@/lib/notifications/notice-keys';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { recordAdminActionIn } from '@/lib/admin-audit.server';
import { createNotification } from '@/lib/notifications.server';
import { feedEventBus } from '@/lib/feed-sse';
import { isDeletedAccount } from '@/lib/account-lifecycle';
import { ModerationError, moderateContent } from '@/lib/moderation/content.server';
import { ACCOUNT_STATUS_LINK } from '@/lib/moderation/restrictions.server';
import { countActiveStrikes } from '@/lib/moderation/standing.server';
import { issueStrike, overturnStrike } from '@/lib/moderation/strikes.server';
import { REMOVED_POST_TEXT } from '@/lib/moderation/removed-text';
import { NO_WORKER_ERROR, failedForNoWorker, reclaimDecision } from '@/lib/jobs/lease';
import type { createSweepBody } from '@/lib/admin/sweeps-schema';
import type { z } from 'zod';
import {
  SWEEP_BATCH_SIZE,
  SWEEP_CONFIRMS_PER_HOUR,
  SWEEP_CONFIRM_WINDOW_MS,
  SWEEP_ENTITY_ORDER,
  SWEEP_NOTICE_GROUP_MS,
  SWEEP_PREVIEW_TTL_MS,
  SWEEP_SAMPLE_SIZE,
  accountAgeDays,
  canUndoItem,
  excerpt,
  isOldAccount,
  overLimit,
  removalNoticeText,
  resolveWindow,
  type SweepEntityType,
  type SweepPhase,
  type SweepPreview,
  type SweepRefusal,
  type SweepSampleItem,
  type SweepStatus,
  type SweepView,
} from '@/lib/admin/sweeps';

/** A runner owns a sweep while its `heartbeatAt` is newer than this. */
export const SWEEP_LEASE_MS = 2 * 60 * 1000;
/** A queued sweep that no runner has claimed for this long is reclaimed. */
export const SWEEP_STALLED_AFTER_MS = 10 * 60 * 1000;
/** The reclaim sweep re-queues a sweep at most this many times; the next time it is stopped as FAILED. */
export const SWEEP_MAX_RECLAIMS = 5;
/** The advisory-lock key every confirm takes before counting the admin's confirms in the last hour. */
export const SWEEP_CONFIRM_CAP_LOCK = 'sweeps:confirm-cap';
export const SWEEP_REPEATED_RESTARTS_ERROR = 'Stopped after the worker restarted repeatedly.';

/** A refusal the route turns into its HTTP status and `reason`. */
export class SweepRefused extends Error {
  constructor(public readonly reason: SweepRefusal) {
    super(reason);
  }
}

type CreateBody = z.infer<typeof createSweepBody>;

const SWEEP_INCLUDE = {
  subject: { select: { id: true, name: true, handle: true, username: true, banReason: true } },
  admin: { select: { id: true, name: true, handle: true, username: true } },
} as const;

interface SweepRow {
  id: string;
  subjectId: string;
  adminId: string;
  windowFrom: Date;
  windowTo: Date;
  includePosts: boolean;
  includeReplies: boolean;
  reason: string;
  withStrike: boolean;
  strikeId: string | null;
  status: string;
  phase: string;
  postCount: number;
  replyCount: number;
  removedCount: number;
  restoredCount: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  undoneAt: Date | null;
  undoneById: string | null;
  cursorType: string | null;
  cursorAt: Date | null;
  cursorId: string | null;
  reclaims: number;
  subject: {
    id: string;
    name: string | null;
    handle: string | null;
    username: string | null;
    banReason: string | null;
  };
  admin: { id: string; name: string | null; handle: string | null; username: string | null };
}

function displayName(u: { name: string | null; handle: string | null; username: string | null }): string {
  return u.name ?? u.handle ?? u.username ?? '';
}

export function toSweepView(row: SweepRow): SweepView {
  const undoable =
    (row.status === 'DONE' || (row.status === 'FAILED' && row.removedCount > 0)) &&
    !isDeletedAccount({ id: row.subjectId, banReason: row.subject.banReason });
  return {
    id: row.id,
    subjectId: row.subjectId,
    subjectName: displayName(row.subject),
    adminId: row.adminId,
    adminName: displayName(row.admin),
    from: row.windowFrom.toISOString(),
    to: row.windowTo.toISOString(),
    includePosts: row.includePosts,
    includeReplies: row.includeReplies,
    reason: row.reason,
    withStrike: row.withStrike,
    status: row.status as SweepStatus,
    phase: row.phase as SweepPhase,
    postCount: row.postCount,
    replyCount: row.replyCount,
    removedCount: row.removedCount,
    restoredCount: row.restoredCount,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    undoneAt: row.undoneAt?.toISOString() ?? null,
    canUndo: undoable,
  };
}

async function loadView(id: string): Promise<SweepView | null> {
  const row = await prisma.moderationSweep.findUnique({ where: { id }, include: SWEEP_INCLUDE });
  return row ? toSweepView(row) : null;
}

export async function listSweeps(opts: { subject?: string | undefined; take?: number } = {}): Promise<SweepView[]> {
  const rows = await prisma.moderationSweep.findMany({
    where: { status: { not: 'PREVIEW' }, ...(opts.subject ? { subjectId: opts.subject } : {}) },
    orderBy: { createdAt: 'desc' },
    take: opts.take ?? 50,
    include: SWEEP_INCLUDE,
  });
  return rows.map(toSweepView);
}

/* -------------------------------------------------------------------------- */
/* The match predicate                                                        */
/* -------------------------------------------------------------------------- */

interface WindowSpec {
  subjectId: string;
  from: Date;
  to: Date;
}

/** The one predicate the preview count, the sample, the confirm count and the run all share. */
export function windowWhere(w: WindowSpec): { userId: string; createdAt: { gte: Date; lte: Date }; deletedAt: null } {
  return { userId: w.subjectId, createdAt: { gte: w.from, lte: w.to }, deletedAt: null };
}

async function countKinds(
  db: Prisma.TransactionClient | typeof prisma,
  w: WindowSpec,
  kinds: { includePosts: boolean; includeReplies: boolean },
): Promise<{ posts: number; replies: number }> {
  const where = windowWhere(w);
  const [posts, replies] = await Promise.all([
    kinds.includePosts ? db.rMHark.count({ where }) : 0,
    kinds.includeReplies ? db.rMHarkComment.count({ where }) : 0,
  ]);
  return { posts, replies };
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                    */
/* -------------------------------------------------------------------------- */

interface Subject {
  id: string;
  isAdmin: boolean;
  createdAt: Date;
  banReason: string | null;
  handle: string | null;
}

async function loadSubject(db: Prisma.TransactionClient | typeof prisma, id: string): Promise<Subject> {
  const subject = await db.user.findUnique({
    where: { id },
    select: { id: true, isAdmin: true, createdAt: true, banReason: true, handle: true },
  });
  if (!subject) throw new SweepRefused('subject-not-found');
  // An admin cannot be a subject, and that includes the acting admin: nobody sweeps themselves.
  if (subject.isAdmin) throw new SweepRefused('subject-admin');
  if (isDeletedAccount(subject)) throw new SweepRefused('subject-deleted');
  return subject;
}

/**
 * Count what the window holds, show the ten newest items and the account's context, and record a PREVIEW row.
 * Nothing is removed. A window over the cap is still previewed (the page says so) but cannot be confirmed.
 */
export async function createSweepPreview(
  adminId: string,
  body: CreateBody,
  now: Date = new Date(),
): Promise<{ sweep: SweepView; preview: SweepPreview }> {
  const subject = await loadSubject(prisma, body.subjectId);
  const window = resolveWindow(
    {
      from: body.from ? new Date(body.from) : undefined,
      to: body.to ? new Date(body.to) : undefined,
    },
    now,
  );
  if (!window.ok) throw new SweepRefused(window.reason);

  const spec: WindowSpec = { subjectId: subject.id, from: window.from, to: window.to };
  const kinds = { includePosts: body.includePosts, includeReplies: body.includeReplies };
  const where = windowWhere(spec);
  const { posts, replies } = await countKinds(prisma, spec, kinds);

  const [postRows, replyRows, engagedPosts, engagedReplies, strikes, activeStrikes] = await Promise.all([
    kinds.includePosts
      ? prisma.rMHark.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: SWEEP_SAMPLE_SIZE,
          select: { id: true, content: true, createdAt: true },
        })
      : [],
    kinds.includeReplies
      ? prisma.rMHarkComment.findMany({
          where,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: SWEEP_SAMPLE_SIZE,
          select: { id: true, content: true, createdAt: true },
        })
      : [],
    // Counters, not exact joins: a like counter above zero or a reply by someone else.
    kinds.includePosts
      ? prisma.rMHark.count({
          where: {
            ...where,
            OR: [{ likeCount: { gt: 0 } }, { comments: { some: { userId: { not: subject.id }, deletedAt: null } } }],
          },
        })
      : 0,
    kinds.includeReplies
      ? prisma.rMHarkComment.count({
          where: {
            ...where,
            OR: [{ likeCount: { gt: 0 } }, { replies: { some: { userId: { not: subject.id }, deletedAt: null } } }],
          },
        })
      : 0,
    prisma.userStrike.count({ where: { userId: subject.id } }),
    countActiveStrikes(subject.id, now),
  ]);

  const sample: SweepSampleItem[] = [
    ...postRows.map((r) => ({
      entityType: 'rmhark' as const,
      id: r.id,
      excerpt: excerpt(r.content),
      createdAt: r.createdAt,
    })),
    ...replyRows.map((r) => ({
      entityType: 'comment' as const,
      id: r.id,
      excerpt: excerpt(r.content),
      createdAt: r.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, SWEEP_SAMPLE_SIZE)
    .map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));

  const row = await prisma.moderationSweep.create({
    data: {
      subjectId: subject.id,
      adminId,
      windowFrom: window.from,
      windowTo: window.to,
      includePosts: body.includePosts,
      includeReplies: body.includeReplies,
      reason: body.reason,
      withStrike: body.strike,
      status: 'PREVIEW',
      postCount: posts,
      replyCount: replies,
    },
    include: SWEEP_INCLUDE,
  });

  const ageDays = accountAgeDays(subject.createdAt, now);
  return {
    sweep: toSweepView(row),
    preview: {
      posts,
      replies,
      total: posts + replies,
      overLimit: overLimit(posts, replies),
      sample,
      account: {
        ageDays,
        old: isOldAccount(ageDays),
        strikes,
        activeStrikes,
        handle: subject.handle,
      },
      engaged: engagedPosts + engagedReplies,
    },
  };
}

/* -------------------------------------------------------------------------- */
/* Confirm and undo (the requests; the run is `runSweep`)                      */
/* -------------------------------------------------------------------------- */

/**
 * Start the run of a previewed sweep. In one transaction under `sweep:<subjectId>`: the preview is the
 * caller's and fresh, the subject is still a sweepable account, no other sweep of the member is running, the
 * admin has confirmed fewer than ten in the last hour, and the window still fits the cap (it is recounted
 * with the same predicate the run uses). The caller then queues the run.
 */
export async function confirmSweep(adminId: string, id: string, now: Date = new Date()): Promise<SweepView> {
  await prisma.$transaction(
    async (tx) => {
      const first = await tx.moderationSweep.findUnique({ where: { id } });
      // Somebody else's preview is not visible to this admin.
      if (!first || first.adminId !== adminId) throw new SweepRefused('not-found');
      // The hourly cap is one count over every subject, so one global lock (taken first, always in this order
      // so two confirms cannot deadlock) holds it; the subject lock still serialises that member's sweeps.
      await lockKey(tx, SWEEP_CONFIRM_CAP_LOCK);
      await lockKey(tx, `sweep:${first.subjectId}`);
      const row = await tx.moderationSweep.findUnique({ where: { id } });
      if (!row) throw new SweepRefused('not-found');
      if (row.status !== 'PREVIEW') throw new SweepRefused('not-a-preview');
      if (now.getTime() - row.createdAt.getTime() > SWEEP_PREVIEW_TTL_MS) throw new SweepRefused('preview-expired');

      await loadSubject(tx, row.subjectId);

      const running = await tx.moderationSweep.count({ where: { subjectId: row.subjectId, status: 'RUNNING' } });
      if (running > 0) throw new SweepRefused('already-running');

      const confirms = await tx.moderationSweep.count({
        where: { adminId, confirmedAt: { gte: new Date(now.getTime() - SWEEP_CONFIRM_WINDOW_MS) } },
      });
      if (confirms >= SWEEP_CONFIRMS_PER_HOUR) throw new SweepRefused('confirm-limit');

      const { posts, replies } = await countKinds(
        tx,
        { subjectId: row.subjectId, from: row.windowFrom, to: row.windowTo },
        row,
      );
      if (overLimit(posts, replies)) throw new SweepRefused('over-limit');
      if (posts + replies === 0) throw new SweepRefused('nothing-to-remove');

      const { count } = await tx.moderationSweep.updateMany({
        where: { id, status: 'PREVIEW' },
        data: {
          status: 'RUNNING',
          phase: 'remove',
          postCount: posts,
          replyCount: replies,
          removedCount: 0,
          confirmedAt: now,
          queuedAt: now,
          heartbeatAt: null,
          claimedAt: null,
          reclaimedAt: null,
          reclaims: 0,
          cursorType: null,
          cursorAt: null,
          cursorId: null,
        },
      });
      if (count === 0) throw new SweepRefused('not-a-preview');
    },
    { timeout: 30_000 },
  );
  const view = await loadView(id);
  if (!view) throw new SweepRefused('not-found');
  return view;
}

/**
 * Start the undo of a finished sweep: refused when the sweep is not DONE (or FAILED with removals), when
 * another sweep of the member is running, or when the member's account has since been deleted (restoring
 * would republish under "Deleted user"). The undo runs in the same durable job.
 */
export async function undoSweep(adminId: string, id: string, now: Date = new Date()): Promise<SweepView> {
  await prisma.$transaction(
    async (tx) => {
      const first = await tx.moderationSweep.findUnique({ where: { id } });
      if (!first) throw new SweepRefused('not-found');
      await lockKey(tx, `sweep:${first.subjectId}`);
      const row = await tx.moderationSweep.findUnique({ where: { id } });
      if (!row) throw new SweepRefused('not-found');
      if (row.status !== 'DONE' && !(row.status === 'FAILED' && row.removedCount > 0)) {
        throw new SweepRefused('not-undoable');
      }
      const subject = await tx.user.findUnique({ where: { id: row.subjectId }, select: { id: true, banReason: true } });
      if (!subject || isDeletedAccount(subject)) throw new SweepRefused('subject-deleted');
      const running = await tx.moderationSweep.count({ where: { subjectId: row.subjectId, status: 'RUNNING' } });
      if (running > 0) throw new SweepRefused('already-running');

      const { count } = await tx.moderationSweep.updateMany({
        where: { id, status: row.status },
        data: {
          status: 'RUNNING',
          phase: 'undo',
          undoneById: adminId,
          queuedAt: now,
          heartbeatAt: null,
          claimedAt: null,
          reclaimedAt: null,
          reclaims: 0,
          restoredCount: 0,
          error: null,
        },
      });
      if (count === 0) throw new SweepRefused('not-undoable');
    },
    { timeout: 30_000 },
  );
  const view = await loadView(id);
  if (!view) throw new SweepRefused('not-found');
  return view;
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                 */
/* -------------------------------------------------------------------------- */

/** Thrown inside the finishing transaction when the runner no longer holds the lease; rolls it back. */
class LeaseLost extends Error {}

/**
 * Take the lease: one conditional update that succeeds for a RUNNING sweep nobody has started (no heartbeat)
 * or whose lease expired. Returns the heartbeat this runner now holds, or null when another runner owns it.
 */
async function claimLease(id: string, now: Date): Promise<Date | null> {
  const beat = new Date();
  const { count } = await prisma.moderationSweep.updateMany({
    where: {
      id,
      status: 'RUNNING',
      OR: [{ heartbeatAt: null }, { heartbeatAt: { lt: new Date(now.getTime() - SWEEP_LEASE_MS) } }],
    },
    data: { heartbeatAt: beat, claimedAt: beat },
  });
  return count > 0 ? beat : null;
}

interface PendingItem {
  type: SweepEntityType;
  id: string;
  createdAt: Date;
}

async function nextBatch(row: SweepRow): Promise<PendingItem[]> {
  const types = SWEEP_ENTITY_ORDER.filter((t) => (t === 'rmhark' ? row.includePosts : row.includeReplies));
  let index = row.cursorType ? types.indexOf(row.cursorType as SweepEntityType) : 0;
  if (index < 0) index = 0;
  let after: { at: Date; id: string } | null =
    row.cursorType && row.cursorAt && row.cursorId ? { at: row.cursorAt, id: row.cursorId } : null;
  for (; index < types.length; index += 1, after = null) {
    const type = types[index]!;
    const where = {
      ...windowWhere({ subjectId: row.subjectId, from: row.windowFrom, to: row.windowTo }),
      ...(after ? { OR: [{ createdAt: { gt: after.at } }, { createdAt: after.at, id: { gt: after.id } }] } : {}),
    };
    const args = {
      where,
      orderBy: [{ createdAt: 'asc' as const }, { id: 'asc' as const }],
      take: SWEEP_BATCH_SIZE,
      select: { id: true, createdAt: true },
    };
    const rows = type === 'rmhark' ? await prisma.rMHark.findMany(args) : await prisma.rMHarkComment.findMany(args);
    if (rows.length > 0) return rows.map((r) => ({ type, id: r.id, createdAt: r.createdAt }));
  }
  return [];
}

async function itemState(
  type: SweepEntityType,
  id: string,
): Promise<{ deletedAt: Date | null; deletedBy: string | null } | null> {
  const select = { deletedAt: true, deletedBy: true } as const;
  return type === 'rmhark'
    ? prisma.rMHark.findUnique({ where: { id }, select })
    : prisma.rMHarkComment.findUnique({ where: { id }, select });
}

/**
 * After each batch, tell open feeds about the posts it removed. `rmhark.deleted` is routed to the post's own
 * channel (`feed:post:<id>`), which is where a viewer's stream listens, so every removed post gets its event
 * (an in-memory publish, emitted once the batch is committed, not once per database write). Best effort: the
 * feed catches up on its next load either way.
 */
function publishBatch(postIds: string[], at: Date): void {
  for (const id of postIds) {
    try {
      feedEventBus.publishPostEngagement(id, {
        type: 'rmhark.deleted',
        rmharkId: id,
        payload: { id, deletedAt: at.toISOString(), deletedByAdmin: true, content: REMOVED_POST_TEXT },
        timestamp: at.toISOString(),
      });
    } catch {
      /* the feed catches up on its next load */
    }
  }
}

/**
 * Run a sweep: the removal when its phase is `remove`, the undo when `undo`. Idempotent and resumable: a
 * second runner finds the lease held and returns; a reclaimed run continues strictly after the persisted
 * cursor; the predicate excludes what is already deleted and the counts are recomputed from the item rows,
 * so nothing is counted twice.
 */
export async function runSweep(id: string, now: Date = new Date()): Promise<void> {
  let lease = await claimLease(id, now);
  if (!lease) return;
  const first = await prisma.moderationSweep.findUnique({ where: { id }, include: SWEEP_INCLUDE });
  if (!first) return;
  let row: SweepRow = first;
  try {
    await settlePendingItems(row.id);
    if (row.phase === 'undo') await runUndo(row, lease);
    else {
      for (;;) {
        const batch = await nextBatch(row);
        if (batch.length === 0) break;
        const next = await removeBatch(row, batch, lease);
        if (!next) return; // lease lost: another runner owns it now
        lease = next.lease;
        row = { ...row, cursorType: next.cursor.type, cursorAt: next.cursor.at, cursorId: next.cursor.id };
      }
      await finishRemoval(row, lease);
    }
  } catch (error) {
    if (error instanceof LeaseLost) return;
    // The message reaches the admin's own list, so it is truncated and carries no stack.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[sweeps] sweep ${id} failed:`, error);
    await markFailed(row, lease, message).catch(() => {});
  }
}

async function markFailed(row: SweepRow, lease: Date, message: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const { count } = await tx.moderationSweep.updateMany({
      where: { id: row.id, status: 'RUNNING', heartbeatAt: lease },
      data: { status: 'FAILED', error: message.slice(0, 300), finishedAt: new Date() },
    });
    if (count === 0) return;
    await recordAdminActionIn(
      tx,
      row.phase === 'undo' ? (row.undoneById ?? row.adminId) : row.adminId,
      'sweep.failed',
      {
        targetType: 'user',
        targetId: row.subjectId,
        detail: `sweep ${row.id} (${row.phase}) stopped: ${message}`,
      },
    );
  });
}

/** `ModerationSweepItem.undone` while the removal it records may not have happened yet (written before it). */
const PENDING_ITEM = 'pending';

/** True when `state` is a moderator removal made at or after `since`: the deletion a sweep may record and undo. */
function isOurRemoval(
  state: { deletedAt: Date | null; deletedBy: string | null } | null,
  since: Date,
): state is { deletedAt: Date; deletedBy: string } {
  return !!state?.deletedAt && state.deletedBy === 'moderator' && state.deletedAt.getTime() >= since.getTime();
}

async function dropPending(sweepId: string, type: string, id: string): Promise<void> {
  await prisma.moderationSweepItem.deleteMany({
    where: { sweepId, entityType: type, entityId: id, undone: PENDING_ITEM },
  });
}

/**
 * Resolve the item rows a dead runner left `pending`: removed by a moderator since the row was written, with no audit row of another moderator's removal, means the
 * removal was the sweep's (confirm it with the exact `deletedAt`, so undo sees it); anything else means it did not (drop
 * the row). Runs under the lease, before the removal continues and before an undo reads its items.
 */
export async function settlePendingItems(sweepId: string): Promise<number> {
  const pending = await prisma.moderationSweepItem.findMany({ where: { sweepId, undone: PENDING_ITEM } });
  let confirmed = 0;
  for (const item of Array.isArray(pending) ? pending : []) {
    const state = await itemState(item.entityType as SweepEntityType, item.entityId);
    // A sweep writes no per-item audit row, a moderator's own removal does: one since the row was written means the
    // removal is theirs, and undo must not restore it.
    const theirs = await prisma.adminAuditLog.findFirst({
      where: {
        action: 'content.remove',
        targetType: item.entityType,
        targetId: item.entityId,
        createdAt: { gte: item.removedAt },
      },
      select: { id: true },
    });
    if (!theirs && isOurRemoval(state, item.removedAt)) {
      await prisma.moderationSweepItem.updateMany({
        where: { sweepId, entityType: item.entityType, entityId: item.entityId, undone: PENDING_ITEM },
        data: { removedAt: state.deletedAt, undone: null },
      });
      confirmed += 1;
    } else await dropPending(sweepId, item.entityType, item.entityId);
  }
  return confirmed;
}

/** Remove one batch; returns the new lease and cursor, or null when the lease was lost. */
async function removeBatch(
  row: SweepRow,
  batch: PendingItem[],
  lease: Date,
): Promise<{ lease: Date; cursor: { type: SweepEntityType; at: Date; id: string } } | null> {
  const removedPosts: string[] = [];
  for (const item of batch) {
    // Already deleted (by its author, or by another moderator) since the batch was read: skipped, never swept.
    const state = await itemState(item.type, item.id);
    if (!state || state.deletedAt) continue;
    const before = new Date();
    // `moderateContent` writes through the global client, so it cannot join a transaction of ours. The item row
    // goes first instead, as `pending` with the time before the removal; once the removal is seen it is
    // confirmed with the exact `deletedAt`. A crash in between leaves the pending row, which `settlePending`
    // resolves against the content's state (removed by a moderator since: confirmed; else dropped).
    await prisma.moderationSweepItem.createMany({
      data: [{ sweepId: row.id, entityType: item.type, entityId: item.id, removedAt: before, undone: PENDING_ITEM }],
      skipDuplicates: true,
    });
    try {
      await moderateContent({
        adminId: row.adminId,
        entityType: item.type,
        entityId: item.id,
        action: 'remove',
        reason: row.reason,
        sweep: { id: row.id },
      });
    } catch (error) {
      await dropPending(row.id, item.type, item.id);
      if (error instanceof ModerationError) continue;
      throw error;
    }
    const after = await itemState(item.type, item.id);
    // Record the exact `deletedAt` the removal wrote, and only when it is ours: an author who deleted the
    // item in the same instant keeps their own deletion, which undo must never restore.
    if (!isOurRemoval(after, before)) {
      await dropPending(row.id, item.type, item.id);
      continue;
    }
    await prisma.moderationSweepItem.updateMany({
      where: { sweepId: row.id, entityType: item.type, entityId: item.id, undone: PENDING_ITEM },
      data: { removedAt: after.deletedAt, undone: null },
    });
    if (item.type === 'rmhark') removedPosts.push(item.id);
  }
  const last = batch[batch.length - 1]!;
  const beat = new Date();
  const removed = await prisma.moderationSweepItem.count({ where: { sweepId: row.id, undone: null } });
  const { count } = await prisma.moderationSweep.updateMany({
    where: { id: row.id, status: 'RUNNING', phase: 'remove', heartbeatAt: lease },
    data: {
      heartbeatAt: beat,
      removedCount: removed,
      cursorType: last.type,
      cursorAt: last.createdAt,
      cursorId: last.id,
    },
  });
  if (count === 0) return null;
  publishBatch(removedPosts, beat);
  return { lease: beat, cursor: { type: last.type, at: last.createdAt, id: last.id } };
}

/** The end of a run: DONE and the one audit row in one transaction, then the strike and the one notice. */
async function finishRemoval(row: SweepRow, lease: Date): Promise<void> {
  const removed = await prisma.moderationSweepItem.count({ where: { sweepId: row.id, undone: null } });
  const finishedAt = new Date();
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.moderationSweep.updateMany({
        where: { id: row.id, status: 'RUNNING', phase: 'remove', heartbeatAt: lease },
        data: { status: 'DONE', finishedAt, removedCount: removed },
      });
      if (count === 0) throw new LeaseLost('lease lost');
      await recordAdminActionIn(tx, row.adminId, 'sweep.remove', {
        targetType: 'user',
        targetId: row.subjectId,
        detail: `sweep ${row.id}: ${removed} removed (${row.windowFrom.toISOString()} to ${row.windowTo.toISOString()}) — ${row.reason}`,
      });
    });
  } catch (error) {
    if (error instanceof LeaseLost) return;
    throw error;
  }
  if (removed === 0) return;

  // After the commit, so each happens once: the DONE write above is the claim.
  let struck = false;
  if (row.withStrike) {
    const strike = await issueStrike({
      userId: row.subjectId,
      adminId: row.adminId,
      reason: row.reason,
      entityType: 'moderation-sweep',
      entityId: row.id,
      notify: false,
    });
    await prisma.moderationSweep.update({ where: { id: row.id }, data: { strikeId: strike.strikeId } });
    struck = true;
  }
  await sendRemovalNotice(row, removed, struck);
}

/**
 * One notice per run. A second sweep of the same member inside an hour folds into the first notice while it is
 * still unread (its count is the sum), so a wave of sweeps never stacks notices.
 */
async function sendRemovalNotice(row: SweepRow, count: number, struck: boolean): Promise<void> {
  const groupKey = `moderation-sweep:${row.subjectId}`;
  const unread = await prisma.notification.findFirst({
    where: {
      userId: row.subjectId,
      type: 'SYSTEM',
      entityType: 'moderation-sweep',
      read: false,
      createdAt: { gte: new Date(Date.now() - SWEEP_NOTICE_GROUP_MS) },
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, preview: true },
  });
  if (unread) {
    const previous = Number.parseInt(unread.preview ?? '', 10);
    await prisma.notification.update({
      where: { id: unread.id },
      data: {
        entityId: row.id,
        preview: removalNoticeText((Number.isFinite(previous) ? previous : 0) + count, row.reason, struck).slice(
          0,
          280,
        ),
        createdAt: new Date(),
      },
    });
    return;
  }
  await createNotification({
    userId: row.subjectId,
    type: 'SYSTEM',
    entityType: 'moderation-sweep',
    entityId: row.id,
    link: ACCOUNT_STATUS_LINK,
    groupKey,
    preview: removalNoticeText(count, row.reason, struck),
  });
}

async function runUndo(row: SweepRow, firstLease: Date): Promise<void> {
  let lease = firstLease;
  const adminId = row.undoneById ?? row.adminId;
  for (;;) {
    const items = await prisma.moderationSweepItem.findMany({
      where: { sweepId: row.id, undone: null },
      orderBy: [{ entityType: 'asc' }, { entityId: 'asc' }],
      take: SWEEP_BATCH_SIZE,
    });
    if (items.length === 0) break;
    for (const item of items) {
      const type = item.entityType as SweepEntityType;
      const state = await itemState(type, item.entityId);
      let outcome: 'restored' | 'skipped' = 'skipped';
      // Only an item still in the state this sweep left it: a later removal wrote a new `deletedAt`.
      if (canUndoItem(state, item.removedAt)) {
        try {
          await moderateContent({
            adminId,
            entityType: type,
            entityId: item.entityId,
            action: 'restore',
            reason: `Sweep ${row.id} undone`,
            sweep: { id: row.id },
          });
          outcome = 'restored';
        } catch (error) {
          if (!(error instanceof ModerationError)) throw error;
        }
      }
      await prisma.moderationSweepItem.updateMany({
        where: { sweepId: row.id, entityType: item.entityType, entityId: item.entityId, undone: null },
        data: { undone: outcome },
      });
    }
    const beat = new Date();
    const restored = await prisma.moderationSweepItem.count({ where: { sweepId: row.id, undone: 'restored' } });
    const { count } = await prisma.moderationSweep.updateMany({
      where: { id: row.id, status: 'RUNNING', phase: 'undo', heartbeatAt: lease },
      data: { heartbeatAt: beat, restoredCount: restored },
    });
    if (count === 0) return;
    lease = beat;
  }
  await finishUndo(row, lease, adminId);
}

async function finishUndo(row: SweepRow, lease: Date, adminId: string): Promise<void> {
  const restored = await prisma.moderationSweepItem.count({ where: { sweepId: row.id, undone: 'restored' } });
  try {
    await prisma.$transaction(async (tx) => {
      const { count } = await tx.moderationSweep.updateMany({
        where: { id: row.id, status: 'RUNNING', phase: 'undo', heartbeatAt: lease },
        data: { status: 'UNDONE', undoneAt: new Date(), restoredCount: restored },
      });
      if (count === 0) throw new LeaseLost('lease lost');
      await recordAdminActionIn(tx, adminId, 'sweep.undo', {
        targetType: 'user',
        targetId: row.subjectId,
        detail: `sweep ${row.id}: ${restored} restored`,
      });
    });
  } catch (error) {
    if (error instanceof LeaseLost) return;
    throw error;
  }
  // A reversal of a false positive should not leave the strike: void it as an overturned appeal does.
  if (row.strikeId) {
    await overturnStrike({ strikeId: row.strikeId, adminId, note: `Sweep ${row.id} was undone` });
  }
  if (restored > 0) {
    await createNotification({
      userId: row.subjectId,
      type: 'SYSTEM',
      entityType: 'moderation-sweep-undone',
      entityId: row.id,
      link: ACCOUNT_STATUS_LINK,
      preview: restored === 1 ? notice('sweep-restored-one', {}) : notice('sweep-restored', { count: restored }),
    });
  }
}

/* -------------------------------------------------------------------------- */
/* Reclaim                                                                    */
/* -------------------------------------------------------------------------- */

/** RUNNING sweeps whose lease expired, or that were queued long ago and never started. */
function expiredLeaseWhere(now: Date) {
  return {
    status: 'RUNNING',
    OR: [
      { heartbeatAt: { lt: new Date(now.getTime() - SWEEP_LEASE_MS) } },
      { heartbeatAt: null, queuedAt: { lt: new Date(now.getTime() - SWEEP_STALLED_AFTER_MS) } },
    ],
  };
}

/**
 * The reclaim sweep (every minute, in the jobs worker): finds RUNNING sweeps whose lease expired and returns the
 * ids to queue again. `reclaimDecision` (`lib/jobs/lease.ts`) says what to do with each: a reclaim is counted
 * only when a runner started the sweep since the last counted one, so minutes with no worker only re-queue it.
 * One whose runner died `SWEEP_MAX_RECLAIMS` times, or that nobody picked up for a day, is marked FAILED. Each
 * write is a compare-and-set on what it read, so two sweeps cannot count one attempt twice.
 */
export async function reclaimStalledSweeps(now: Date = new Date(), take = 20): Promise<string[]> {
  const expired = expiredLeaseWhere(now);
  const rows = await prisma.moderationSweep.findMany({
    where: expired,
    orderBy: { createdAt: 'asc' },
    take,
    select: {
      id: true,
      reclaims: true,
      claimedAt: true,
      reclaimedAt: true,
      heartbeatAt: true,
      queuedAt: true,
      createdAt: true,
    },
  });
  const requeue: string[] = [];
  for (const r of rows) {
    const input = {
      claimedAt: r.claimedAt,
      reclaimedAt: r.reclaimedAt,
      reclaims: r.reclaims,
      heartbeatAt: r.heartbeatAt,
      createdAt: r.queuedAt ?? r.createdAt,
      now,
      maxReclaims: SWEEP_MAX_RECLAIMS,
    };
    const verdict = reclaimDecision(input);
    if (verdict === 'skip') continue;
    if (verdict === 'requeue') {
      requeue.push(r.id);
      continue;
    }
    const seen = { id: r.id, reclaims: r.reclaims, claimedAt: r.claimedAt, reclaimedAt: r.reclaimedAt, ...expired };
    if (verdict === 'fail') {
      await prisma.moderationSweep.updateMany({
        where: seen,
        data: {
          status: 'FAILED',
          error: failedForNoWorker(input) ? NO_WORKER_ERROR : SWEEP_REPEATED_RESTARTS_ERROR,
          finishedAt: now,
        },
      });
      continue;
    }
    const { count } = await prisma.moderationSweep.updateMany({
      where: seen,
      data: { reclaims: { increment: 1 }, reclaimedAt: now },
    });
    if (count > 0) requeue.push(r.id);
  }
  return requeue;
}
