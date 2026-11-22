/**
 * Bulk content management — server logic (plan I2).
 *
 * Preview, start, run and cancel a `BulkOperation`. The filter→predicate mapping
 * lives in `./types.ts` and is shared verbatim by all three of the preview
 * count, the ten-row sample and the run, so the number the user confirmed is
 * arithmetically the number that gets processed.
 *
 * Four properties the plan asks for, and where each one is enforced:
 *
 *  - **Preview before commit** — `previewBulk` is a separate call and
 *    `createBulkOperation` recomputes `total` with the same predicate.
 *  - **Chunked** — `runBulkOperation` walks a keyset over `id`, `BULK_CHUNK_SIZE`
 *    rows at a time, and never materialises the match set. A 5,000-row delete
 *    holds 100 ids in memory, not 5,000, and holds no request open at all.
 *  - **Cancellable** — the status is re-read from the row between chunks, so a
 *    cancel lands within one chunk and everything already processed stays
 *    processed.
 *  - **Undoable** — every delete routes through
 *    `softDeletePostAsAuthor` / `softDeleteCommentAsAuthor`, which stamp
 *    `deletedBy: 'author'`. Bulk-deleted content appears in the bin and restores
 *    individually.
 *
 * ── Where this runs ───────────────────────────────────────────────────────
 *
 * The POST route enqueues the operation id on the `bulk.run` pg-boss queue
 * (`./queue.server`), worked by the `jobs` process; when the queue is unavailable
 * it falls back to `startBulkOperation`, a detached run in the web process.
 *
 * **A lease, not a status, decides who runs.** A runner claims an operation with
 * one conditional update (PENDING, or RUNNING whose `heartbeatAt` is older than
 * `LEASE_MS`), renews `heartbeatAt` with every chunk, and persists `cursorId`
 * (the last id it finished). Every chunk's progress write is a compare-and-set on
 * the lease it holds, so a runner whose lease was taken (or whose operation was
 * cancelled) stops at its next chunk. `reclaimStalledOperations` runs every minute
 * in the jobs worker, re-queues operations whose lease expired and fails one that
 * was re-queued `MAX_RECLAIMS` times. `runBulkOperation(id)` is idempotent: a
 * resumed run continues after `cursorId`, and the predicate itself excludes work
 * already done.
 *
 * `.server.ts`: never import from a component.
 */

import { prisma } from '@/lib/prisma.server';
import { unfollowUser } from '@/lib/social/engagement.server';
import { adjustNotifUnread } from '@/lib/notifications.server';
import { softDeleteCommentAsAuthor, softDeletePostAsAuthor } from '@/lib/trash/trash.server';
import { excerptOf } from '@/lib/trash/types';
import { REPEATED_RESTARTS_ERROR, BULK_CHUNK_SIZE, BULK_SAMPLE_SIZE, buildWhere, droppedFilters, isBulkKind, normalizeFilter, type BulkFilter, type BulkKind, type BulkOperationView, type BulkPreview, type BulkSample, type BulkStatus } from '@/lib/bulk/types';
import { bulkFilterSchema } from '@/lib/bulk/schema';

/**
 * How old a `RUNNING` row with no heartbeat at all may be before it is reclaimable. Only runs that started before
 * the lease existed have no heartbeat; every newer run is judged by `LEASE_MS`.
 */
export const STALLED_AFTER_MS = 10 * 60 * 1000;

/** A runner owns an operation while its `heartbeatAt` is newer than this. */
export const LEASE_MS = 2 * 60 * 1000;

/** The sweep re-queues an operation at most this many times; the next time it is stopped as FAILED. */
export const MAX_RECLAIMS = 5;


/* -------------------------------------------------------------------------- */
/* Counting and sampling                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Exact count for a filter. Cast at the Prisma boundary: `buildWhere` returns a
 * structural shape on purpose (so `lib/bulk/types.ts` needs no generated client)
 * and this is the one place that shape meets the typed query.
 */
async function countMatches(kind: BulkKind, userId: string, filter: BulkFilter, now: Date) {
  const where = buildWhere(kind, userId, filter, now) as never;
  switch (kind) {
    case 'delete-posts':
      return prisma.rMHark.count({ where });
    case 'delete-comments':
      return prisma.rMHarkComment.count({ where });
    case 'unfollow':
      return prisma.follow.count({ where });
    case 'clear-history':
      return prisma.historyEntry.count({ where });
    case 'clear-bookmarks':
      return prisma.savedItem.count({ where });
    case 'unlike-posts':
      return prisma.rMHarkLike.count({ where });
    case 'delete-reposts':
      return prisma.rMHarkRepost.count({ where });
  }
}

async function sampleMatches(
  kind: BulkKind,
  userId: string,
  filter: BulkFilter,
  now: Date,
): Promise<BulkSample[]> {
  const where = buildWhere(kind, userId, filter, now) as never;
  const take = BULK_SAMPLE_SIZE;

  if (kind === 'delete-posts') {
    const rows = await prisma.rMHark.findMany({
      where,
      take,
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, createdAt: true, likeCount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      label: excerptOf(r.content) || '(no text)',
      detail: `${r.createdAt.toISOString().slice(0, 10)} · ${r.likeCount}`,
    }));
  }
  if (kind === 'delete-comments') {
    const rows = await prisma.rMHarkComment.findMany({
      where,
      take,
      orderBy: { createdAt: 'asc' },
      select: { id: true, content: true, createdAt: true, likeCount: true },
    });
    return rows.map((r) => ({
      id: r.id,
      label: excerptOf(r.content) || '(no text)',
      detail: `${r.createdAt.toISOString().slice(0, 10)} · ${r.likeCount}`,
    }));
  }
  if (kind === 'unfollow') {
    const rows = await prisma.follow.findMany({
      where,
      take,
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        createdAt: true,
        following: { select: { name: true, handle: true, username: true } },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      label: r.following?.handle ?? r.following?.username ?? r.following?.name ?? '(account)',
      detail: r.createdAt.toISOString().slice(0, 10),
    }));
  }
  if (kind === 'clear-history') {
    const rows = await prisma.historyEntry.findMany({
      where,
      take,
      orderBy: { updatedAt: 'asc' },
      select: { id: true, entityType: true, entityId: true, updatedAt: true },
    });
    return rows.map((r) => ({
      id: r.id,
      label: `${r.entityType}: ${r.entityId}`,
      detail: r.updatedAt.toISOString().slice(0, 10),
    }));
  }
  if (kind === 'unlike-posts' || kind === 'delete-reposts') {
    const select = {
      id: true,
      createdAt: true,
      rmhark: { select: { content: true } },
    } as const;
    const rows =
      kind === 'unlike-posts'
        ? await prisma.rMHarkLike.findMany({ where, take, orderBy: { createdAt: 'asc' }, select })
        : await prisma.rMHarkRepost.findMany({ where, take, orderBy: { createdAt: 'asc' }, select });
    return rows.map((r) => ({
      id: r.id,
      label: excerptOf(r.rmhark?.content ?? '') || '(post)',
      detail: r.createdAt.toISOString().slice(0, 10),
    }));
  }
  // Bookmarks are `SavedItem` rows (entityType 'rmhark'). The table is
  // polymorphic, so there is no relation to the post: its text is fetched by id.
  const rows = await prisma.savedItem.findMany({
    where,
    take,
    orderBy: { createdAt: 'asc' },
    select: { id: true, entityId: true, createdAt: true },
  });
  const posts = rows.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: rows.map((r) => r.entityId) } },
        select: { id: true, content: true },
      })
    : [];
  const contentById = new Map(posts.map((p) => [p.id, p.content]));
  return rows.map((r) => ({
    id: r.id,
    label: excerptOf(contentById.get(r.entityId) ?? '') || '(post)',
    detail: r.createdAt.toISOString().slice(0, 10),
  }));
}

/**
 * The exact count plus ten real matches, before anything is confirmable. A bulk
 * delete with a surprising blast radius is the failure mode this exists to
 * prevent, so the sample is drawn oldest-first — the end of the range a user is
 * least likely to be picturing.
 */
export async function previewBulk(
  userId: string,
  kind: BulkKind,
  rawFilter: BulkFilter,
  now: Date = new Date(),
): Promise<BulkPreview> {
  const filter = normalizeFilter(kind, rawFilter);
  const [total, sample] = await Promise.all([
    countMatches(kind, userId, filter, now),
    sampleMatches(kind, userId, filter, now),
  ]);
  return { kind, filter, total, sample, dropped: droppedFilters(kind, rawFilter) };
}

/* -------------------------------------------------------------------------- */
/* Lifecycle                                                                  */
/* -------------------------------------------------------------------------- */

interface BulkRow {
  id: string;
  userId: string;
  kind: string;
  filter: unknown;
  status: string;
  total: number;
  processed: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
  reclaims: number;
  cursorId?: string | null;
}

/** Parse a persisted row back into the wire shape, failing closed on junk JSON. */
export function toBulkView(row: BulkRow): BulkOperationView {
  const parsed = bulkFilterSchema.safeParse(row.filter ?? {});
  return {
    id: row.id,
    kind: (isBulkKind(row.kind) ? row.kind : 'delete-posts') as BulkKind,
    filter: parsed.success ? parsed.data : {},
    status: row.status as BulkStatus,
    total: row.total,
    processed: row.processed,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    finishedAt: row.finishedAt?.toISOString() ?? null,
    reclaims: row.reclaims,
  };
}

const SELECT = {
  id: true,
  userId: true,
  kind: true,
  filter: true,
  status: true,
  total: true,
  processed: true,
  error: true,
  createdAt: true,
  finishedAt: true,
  reclaims: true,
  cursorId: true,
} as const;

export type CreateResult =
  | { ok: true; operation: BulkOperationView }
  | { ok: false; reason: 'already-running'; operation: BulkOperationView };

/**
 * Record an operation and count its matches. One at a time per user: a second
 * concurrent run would race the first one's keyset and make "processed" mean
 * nothing.
 */
export async function createBulkOperation(
  userId: string,
  kind: BulkKind,
  rawFilter: BulkFilter,
  now: Date = new Date(),
): Promise<CreateResult> {
  const active = await prisma.bulkOperation.findFirst({
    where: { userId, status: { in: ['PENDING', 'RUNNING'] } },
    orderBy: { createdAt: 'desc' },
    select: SELECT,
  });
  if (active) {
    return { ok: false, reason: 'already-running', operation: toBulkView(active) };
  }

  const filter = normalizeFilter(kind, rawFilter);
  const total = await countMatches(kind, userId, filter, now);
  const row = await prisma.bulkOperation.create({
    data: { userId, kind, filter, status: 'PENDING', total, processed: 0 },
    select: SELECT,
  });
  return { ok: true, operation: toBulkView(row) };
}

export async function listBulkOperations(userId: string, take = 20): Promise<BulkOperationView[]> {
  const rows = await prisma.bulkOperation.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take,
    select: SELECT,
  });
  return rows.map(toBulkView);
}

export async function getBulkOperation(
  userId: string,
  id: string,
): Promise<BulkOperationView | null> {
  const row = await prisma.bulkOperation.findFirst({ where: { id, userId }, select: SELECT });
  return row ? toBulkView(row) : null;
}

/**
 * Ask a run to stop. Takes effect at the next chunk boundary — rows already
 * processed stay processed, which is what "stops cleanly" means for an operation
 * that is not, and cannot be, one transaction.
 */
export async function cancelBulkOperation(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.bulkOperation.updateMany({
    where: { id, userId, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'CANCELLED', finishedAt: new Date() },
  });
  return count > 0;
}

/** Detach the run from the request that created it, for when the queue is unavailable. Never rejects. */
export function startBulkOperation(id: string): void {
  void runBulkOperation(id).catch((error) => {
    console.error(`[bulk] operation ${id} crashed:`, error);
  });
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                 */
/* -------------------------------------------------------------------------- */

/** One row of the next chunk. `rmheetId` is set for the like and repost kinds, `followingId` for unfollow. */
interface ChunkRow {
  id: string;
  followingId?: string;
  rmheetId?: string;
}

/** Ids for the next chunk, strictly after `afterId`. Ordered so the walk advances. */
async function nextChunk(
  kind: BulkKind,
  userId: string,
  filter: BulkFilter,
  now: Date,
  afterId: string | null,
): Promise<ChunkRow[]> {
  const base = buildWhere(kind, userId, filter, now);
  const where = { ...base, ...(afterId ? { id: { gt: afterId } } : {}) } as never;
  const args = { where, orderBy: { id: 'asc' as const }, take: BULK_CHUNK_SIZE };

  switch (kind) {
    case 'delete-posts':
      return prisma.rMHark.findMany({ ...args, select: { id: true } });
    case 'delete-comments':
      return prisma.rMHarkComment.findMany({ ...args, select: { id: true } });
    case 'unfollow':
      return prisma.follow.findMany({ ...args, select: { id: true, followingId: true } });
    case 'clear-history':
      return prisma.historyEntry.findMany({ ...args, select: { id: true } });
    case 'clear-bookmarks':
      return prisma.savedItem.findMany({ ...args, select: { id: true } });
    case 'unlike-posts':
      return prisma.rMHarkLike.findMany({ ...args, select: { id: true, rmheetId: true } });
    case 'delete-reposts':
      return prisma.rMHarkRepost.findMany({ ...args, select: { id: true, rmheetId: true } });
  }
}

/** Apply the operation to one chunk of the kinds that go through another module. Returns how many rows it changed. */
async function applyChunk(kind: BulkKind, userId: string, rows: ChunkRow[]): Promise<number> {
  switch (kind) {
    case 'delete-posts': {
      let done = 0;
      // Serial on purpose: each soft delete opens its own transaction (hashtag
      // unlink + two counter updates), and fanning those out would put the whole
      // chunk's transactions in flight against a pool of 10.
      for (const row of rows) {
        if ((await softDeletePostAsAuthor(userId, row.id)) === 'deleted') done += 1;
      }
      return done;
    }
    case 'delete-comments': {
      let done = 0;
      for (const row of rows) {
        if ((await softDeleteCommentAsAuthor(userId, row.id)) === 'deleted') done += 1;
      }
      return done;
    }
    case 'unfollow': {
      let done = 0;
      // Through `unfollowUser`, not `follow.deleteMany`: it is what keeps both
      // denormalized follow counters, the cached following-id set and the
      // follow notification consistent.
      for (const row of rows) {
        if (!row.followingId) continue;
        const result = await unfollowUser({ followerId: userId, followingId: row.followingId });
        if (result.ok) done += 1;
      }
      return done;
    }
    case 'clear-history': {
      const { count } = await prisma.historyEntry.deleteMany({
        where: { userId, id: { in: rows.map((r) => r.id) } },
      });
      return count;
    }
    case 'clear-bookmarks': {
      const { count } = await prisma.savedItem.deleteMany({
        where: { userId, entityType: 'rmhark', id: { in: rows.map((r) => r.id) } },
      });
      return count;
    }
    case 'unlike-posts':
    case 'delete-reposts':
      // These run as one transaction with their progress write: `removeEngagementChunk`.
      throw new Error(`[bulk] ${kind} is applied by removeEngagementChunk`);
  }
}

/** Thrown inside a chunk's transaction when the runner no longer holds the lease; rolls the chunk back. */
class LeaseLost extends Error {}

/** Roll a chunk back from inside its transaction. */
function leaseLost(): never {
  throw new LeaseLost('lease lost');
}

/** A chunk's outcome: `false` means this runner no longer owns the operation and must stop. */
type ChunkOutcome = { held: true } | { held: false };

/**
 * Remove one chunk of the member's likes or reposts, keep the post counters
 * right, retract the notifications those likes or reposts created, and advance
 * the cursor — all in ONE transaction, so a crash leaves either all of it or none.
 *
 * Idempotent: rows are deleted by id AND `userId`, and a post's counter goes down
 * by the number of its rows this delete actually removed, so a chunk run again
 * after a crash (or racing a single unlike) finds its rows gone and changes
 * nothing. The progress write is last and is a compare-and-set on the lease: if
 * another runner took the operation, or it was cancelled, it matches no row and
 * the whole chunk is rolled back.
 */
async function removeEngagementChunk(
  kind: 'unlike-posts' | 'delete-reposts',
  userId: string,
  id: string,
  rows: ChunkRow[],
  lease: Date,
  beat: Date,
): Promise<ChunkOutcome> {
  const isLike = kind === 'unlike-posts';
  const lastId = rows[rows.length - 1].id;
  try {
    const done = await prisma.$transaction(
      async (tx) => {
        const perPost = new Map<string, number>();
        let changed = 0;
        for (const row of rows) {
          const { count } = isLike
            ? await tx.rMHarkLike.deleteMany({ where: { id: row.id, userId } })
            : await tx.rMHarkRepost.deleteMany({ where: { id: row.id, userId } });
          if (count > 0 && row.rmheetId) {
            changed += count;
            perPost.set(row.rmheetId, (perPost.get(row.rmheetId) ?? 0) + count);
          }
        }
        for (const [postId, n] of perPost) {
          await tx.rMHark.updateMany({
            where: { id: postId },
            data: isLike ? { likeCount: { decrement: n } } : { repostCount: { decrement: n } },
          });
        }
        // The single unlike / unrepost retracts the (unread) notification; so does a bulk one.
        const notifications = perPost.size
          ? await tx.notification.findMany({
              where: {
                actorId: userId,
                type: isLike ? 'LIKE' : 'REPOST',
                entityType: 'rmhark',
                entityId: { in: [...perPost.keys()] },
                read: false,
              },
              select: { id: true, userId: true },
            })
          : [];
        if (notifications.length > 0) {
          await tx.notification.deleteMany({ where: { id: { in: notifications.map((n) => n.id) } } });
        }
        const progress = await tx.bulkOperation.updateMany({
          where: { id, status: 'RUNNING', heartbeatAt: lease },
          data: { heartbeatAt: beat, processed: { increment: changed }, cursorId: lastId },
        });
        if (progress.count === 0) leaseLost();
        return notifications;
      },
      { timeout: 30_000, maxWait: 5_000 },
    );

    // Recipients' denormalized unread counters (best effort, after commit, like `removeNotification`).
    const perRecipient = new Map<string, number>();
    for (const n of done) perRecipient.set(n.userId, (perRecipient.get(n.userId) ?? 0) + 1);
    for (const [recipient, count] of perRecipient) {
      await adjustNotifUnread(recipient, -count).catch(() => {});
    }
    return { held: true };
  } catch (error) {
    if (error instanceof LeaseLost) return { held: false };
    throw error;
  }
}

/** One chunk of any kind, plus the progress write. */
async function processChunk(
  kind: BulkKind,
  userId: string,
  id: string,
  rows: ChunkRow[],
  lease: Date,
  beat: Date,
): Promise<ChunkOutcome> {
  if (kind === 'unlike-posts' || kind === 'delete-reposts') {
    return removeEngagementChunk(kind, userId, id, rows, lease, beat);
  }
  const changed = await applyChunk(kind, userId, rows);
  // The work is done and cannot be rolled back, so its count is recorded even when
  // the operation was cancelled meanwhile: the CAS accepts RUNNING and CANCELLED, and
  // refuses only a lease someone else holds.
  const progress = await prisma.bulkOperation.updateMany({
    where: { id, status: { in: ['RUNNING', 'CANCELLED'] }, heartbeatAt: lease },
    data: { heartbeatAt: beat, processed: { increment: changed }, cursorId: rows[rows.length - 1].id },
  });
  if (progress.count === 0) return { held: false };
  const current = await prisma.bulkOperation.findUnique({ where: { id }, select: { status: true } });
  return { held: current?.status === 'RUNNING' };
}

/**
 * Take the lease: one conditional update that succeeds for a PENDING operation, a
 * RUNNING one whose lease expired, or a RUNNING one from before the lease existed
 * (no heartbeat) that has made no progress for `STALLED_AFTER_MS`. Returns the
 * heartbeat this runner now holds, or null when another runner owns the operation
 * (or it is finished).
 */
async function claimLease(id: string, now: Date): Promise<Date | null> {
  const beat = new Date();
  const { count } = await prisma.bulkOperation.updateMany({
    where: {
      id,
      OR: [
        { status: 'PENDING' },
        { status: 'RUNNING', heartbeatAt: { lt: new Date(now.getTime() - LEASE_MS) } },
        {
          status: 'RUNNING',
          heartbeatAt: null,
          createdAt: { lt: new Date(now.getTime() - STALLED_AFTER_MS) },
        },
      ],
    },
    data: { status: 'RUNNING', heartbeatAt: beat },
  });
  return count > 0 ? beat : null;
}

/**
 * Walk the match set in chunks until it is exhausted, the run is cancelled, or
 * another runner takes the lease.
 *
 * The walk is a keyset over `id`, not a "re-query the predicate until it comes
 * back empty" drain. A drain loop looks simpler and is a hang waiting to happen:
 * any row the action cannot change — a post that lost a race, a follow edge
 * already gone — stays in the predicate forever and the loop never terminates.
 * Advancing past the last id seen makes progress unconditional.
 *
 * Resumable: `cursorId` is persisted with each chunk's progress, so a reclaimed
 * run continues strictly after it. A run from before the cursor existed has none
 * and starts again from the top; the predicate itself excludes finished work
 * (`deletedAt: null`, or a deleted row) and `processed` only ever grows by the
 * rows a chunk actually changed, so nothing is processed or counted twice.
 *
 * The time window of the filter is fixed at the operation's `createdAt`, so a
 * resumed run selects exactly the rows the preview counted.
 */
export async function runBulkOperation(id: string, now: Date = new Date()): Promise<void> {
  let lease = await claimLease(id, now);
  if (!lease) return;

  const row = await prisma.bulkOperation.findUnique({ where: { id }, select: SELECT });
  if (!row) return;

  const view = toBulkView(row);
  const kind = view.kind;
  const userId = row.userId;
  const filter = view.filter;
  const reference = row.createdAt;

  let afterId: string | null = row.cursorId ?? null;

  try {
    for (;;) {
      const chunk = await nextChunk(kind, userId, filter, reference, afterId);
      if (chunk.length === 0) break;

      const beat = new Date();
      const outcome = await processChunk(kind, userId, id, chunk, lease, beat);
      if (!outcome.held) {
        // Cancelled, or another runner owns it now. Make sure a cancelled run has its end time.
        await prisma.bulkOperation.updateMany({
          where: { id, status: { in: ['CANCELLED', 'DONE', 'FAILED'] }, finishedAt: null },
          data: { finishedAt: new Date() },
        });
        return;
      }
      lease = beat;
      afterId = chunk[chunk.length - 1].id;
    }

    await prisma.bulkOperation.updateMany({
      where: { id, status: 'RUNNING', heartbeatAt: lease },
      data: { status: 'DONE', finishedAt: new Date() },
    });
  } catch (error) {
    // The message reaches the owner's own operations list, so it is truncated to
    // the column width and carries no stack.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bulk] operation ${id} failed:`, error);
    await prisma.bulkOperation
      .updateMany({
        where: { id, status: 'RUNNING', heartbeatAt: lease },
        data: { status: 'FAILED', error: message.slice(0, 300), finishedAt: new Date() },
      })
      .catch(() => {});
  }
}

/** RUNNING rows whose lease expired: a stale heartbeat, or (before the lease existed) no heartbeat and an old start. */
function expiredLeaseWhere(now: Date) {
  return {
    status: 'RUNNING',
    OR: [
      { heartbeatAt: { lt: new Date(now.getTime() - LEASE_MS) } },
      { heartbeatAt: null, createdAt: { lt: new Date(now.getTime() - STALLED_AFTER_MS) } },
    ],
  };
}

/**
 * The reclaim sweep (every minute, in the jobs worker). Finds `RUNNING` operations
 * whose lease expired — a restarted process stopped renewing it — and returns the
 * ids to queue again, counting each in `reclaims`. An operation already re-queued
 * `MAX_RECLAIMS` times is marked FAILED instead, so one that keeps dying never
 * loops forever. Each change is a compare-and-set on the state it read, so two
 * sweeps cannot count one operation twice.
 */
export async function reclaimStalledOperations(
  now: Date = new Date(),
  take = 20,
): Promise<string[]> {
  const expired = expiredLeaseWhere(now);
  const rows = await prisma.bulkOperation.findMany({
    where: expired,
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true, reclaims: true },
  });
  const requeue: string[] = [];
  for (const r of rows) {
    if (r.reclaims >= MAX_RECLAIMS) {
      await prisma.bulkOperation.updateMany({
        where: { id: r.id, reclaims: { gte: MAX_RECLAIMS }, ...expired },
        data: { status: 'FAILED', error: REPEATED_RESTARTS_ERROR, finishedAt: now },
      });
      continue;
    }
    const { count } = await prisma.bulkOperation.updateMany({
      where: { id: r.id, reclaims: r.reclaims, ...expired },
      data: { reclaims: { increment: 1 } },
    });
    if (count > 0) requeue.push(r.id);
  }
  return requeue;
}

/** Account deletion: the member's operations go (anonymisation never fires the cascade). A live run stops at its next chunk. */
export function bulkErasureOps(userId: string) {
  return [prisma.bulkOperation.deleteMany({ where: { userId } })];
}
