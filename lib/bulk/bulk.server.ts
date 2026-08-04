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
 * `startBulkOperation` detaches the run from the request that created it, which
 * satisfies "must not run in a request" on a single web instance. It is not a
 * durable queue: a deploy mid-run leaves the row `RUNNING`, and
 * `reclaimStalledOperations` is the seam a pg-boss job in `lib/jobs/` should
 * call to pick those up — `runBulkOperation(id)` is idempotent for exactly that
 * reason (it resumes from the highest id it already processed).
 *
 * `.server.ts`: never import from a component.
 */

import { prisma } from '@/lib/prisma.server';
import { unfollowUser } from '@/lib/social/engagement.server';
import { softDeleteCommentAsAuthor, softDeletePostAsAuthor } from '@/lib/trash/trash.server';
import { excerptOf } from '@/lib/trash/types';
import {
  BULK_CHUNK_SIZE,
  BULK_SAMPLE_SIZE,
  buildWhere,
  bulkFilterSchema,
  droppedFilters,
  isBulkKind,
  isTerminal,
  normalizeFilter,
  type BulkFilter,
  type BulkKind,
  type BulkOperationView,
  type BulkPreview,
  type BulkSample,
  type BulkStatus,
} from '@/lib/bulk/types';

/** How long a `RUNNING` row may go without progress before it is reclaimable. */
export const STALLED_AFTER_MS = 10 * 60 * 1000;

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
      return prisma.rMHarkBookmark.count({ where });
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
  const rows = await prisma.rMHarkBookmark.findMany({
    where,
    take,
    orderBy: { createdAt: 'asc' },
    select: { id: true, createdAt: true, rmhark: { select: { content: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    label: excerptOf(r.rmhark?.content ?? '') || '(post)',
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

/** Detach the run from the request that created it. Never rejects. */
export function startBulkOperation(id: string): void {
  void runBulkOperation(id).catch((error) => {
    console.error(`[bulk] operation ${id} crashed:`, error);
  });
}

/* -------------------------------------------------------------------------- */
/* The runner                                                                 */
/* -------------------------------------------------------------------------- */

/** Ids for the next chunk, strictly after `afterId`. Ordered so the walk advances. */
async function nextChunk(
  kind: BulkKind,
  userId: string,
  filter: BulkFilter,
  now: Date,
  afterId: string | null,
): Promise<{ id: string; followingId?: string }[]> {
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
      return prisma.rMHarkBookmark.findMany({ ...args, select: { id: true } });
  }
}

/** Apply the operation to one chunk. Returns how many rows it actually changed. */
async function applyChunk(
  kind: BulkKind,
  userId: string,
  rows: { id: string; followingId?: string }[],
): Promise<number> {
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
      const { count } = await prisma.rMHarkBookmark.deleteMany({
        where: { userId, id: { in: rows.map((r) => r.id) } },
      });
      return count;
    }
  }
}

/**
 * Walk the match set in chunks until it is exhausted or the run is cancelled.
 *
 * The walk is a keyset over `id`, not a "re-query the predicate until it comes
 * back empty" drain. A drain loop looks simpler and is a hang waiting to happen:
 * any row the action cannot change — a post that lost a race, a follow edge
 * already gone — stays in the predicate forever and the loop never terminates.
 * Advancing past the last id seen makes progress unconditional.
 *
 * Idempotent, so a reclaimed run resumes rather than double-counting. The keyset
 * restarts at the beginning, but the predicate itself excludes finished work —
 * `deletedAt: null` for the two soft deletes, and a deleted row for the three
 * hard ones — and `applyChunk` only counts rows it actually changed, so
 * `processed` accumulates on top of the previous attempt's total instead of
 * re-counting it.
 */
export async function runBulkOperation(id: string, now: Date = new Date()): Promise<void> {
  const claimed = await prisma.bulkOperation.updateMany({
    where: { id, status: { in: ['PENDING', 'RUNNING'] } },
    data: { status: 'RUNNING' },
  });
  if (claimed.count === 0) return;

  const row = await prisma.bulkOperation.findUnique({ where: { id }, select: SELECT });
  if (!row) return;

  const view = toBulkView(row);
  const kind = view.kind;
  const userId = row.userId;
  const filter = view.filter;

  let afterId: string | null = null;
  let processed = row.processed;

  try {
    for (;;) {
      const chunk = await nextChunk(kind, userId, filter, now, afterId);
      if (chunk.length === 0) break;

      const changed = await applyChunk(kind, userId, chunk);
      afterId = chunk[chunk.length - 1].id;
      processed += changed;

      // Write progress and re-read the status in the same round trip, so a
      // cancel issued during the chunk is observed at its boundary.
      const updated = await prisma.bulkOperation.update({
        where: { id },
        data: { processed },
        select: { status: true },
      });
      if (isTerminal(updated.status)) {
        await prisma.bulkOperation.updateMany({
          where: { id, finishedAt: null },
          data: { finishedAt: new Date() },
        });
        return;
      }
    }

    await prisma.bulkOperation.updateMany({
      where: { id, status: 'RUNNING' },
      data: { status: 'DONE', processed, finishedAt: new Date() },
    });
  } catch (error) {
    // The message reaches the owner's own operations list, so it is truncated to
    // the column width and carries no stack.
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bulk] operation ${id} failed:`, error);
    await prisma.bulkOperation
      .updateMany({
        where: { id, status: 'RUNNING' },
        data: { status: 'FAILED', processed, error: message.slice(0, 300), finishedAt: new Date() },
      })
      .catch(() => {});
  }
}

/**
 * Ids of runs abandoned by a restarted process — `RUNNING` with no progress for
 * `STALLED_AFTER_MS`. Nothing calls this yet; it is the seam for a pg-boss job,
 * which would pass each id straight back to `runBulkOperation`.
 */
export async function reclaimStalledOperations(
  now: Date = new Date(),
  take = 20,
): Promise<string[]> {
  const rows = await prisma.bulkOperation.findMany({
    where: { status: 'RUNNING', createdAt: { lt: new Date(now.getTime() - STALLED_AFTER_MS) } },
    orderBy: { createdAt: 'asc' },
    take,
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
