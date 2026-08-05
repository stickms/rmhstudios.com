/**
 * The recycle bin — server logic (plan I1).
 *
 * List, restore and purge the caller's own soft-deleted posts and comments, and
 * the author-attributed soft delete that bulk operations route through so a
 * bulk clean-up lands in the bin like any other delete.
 *
 * The rules live in `./types.ts` (pure, unit-tested); this file is the Prisma
 * half. `.server.ts`: never import it from a component.
 *
 * ── Restore is not `deletedAt = null` ──────────────────────────────────────
 *
 * Three things make it a feature rather than a footgun, and all three are here:
 *
 *  1. **The parent chain may be gone.** A comment under a hard-deleted post, or
 *     a quote-repost of a deleted original, restores to a broken object. The
 *     ancestors are resolved and handed to `checkRestoreEligibility`, which
 *     refuses with `parent-missing` / `parent-deleted` rather than a bare 400.
 *  2. **Counters moved on delete.** The post delete path unlinks hashtags
 *     (decrementing `Hashtag.postCount`) and decrements the author's and the
 *     community's `postCount`. Restore puts all three back inside one
 *     transaction — see `restorePostCounters` for why two of them are a
 *     recount rather than an increment.
 *  3. **Moderation is not undoable.** `resolveDeletedBy` fails closed and only
 *     `'author'` restores.
 *
 * ── Known interaction, not fixed here ─────────────────────────────────────
 *
 * `lib/media/sweep-policy.ts` reclaims media whose post has been soft-deleted
 * for more than `DELETED_POST_GRACE_MS` (7 days), which is shorter than either
 * retention window. A post restored on day 20 therefore comes back with its
 * text, thread and reactions intact but its images already collected. Raising
 * that grace period to `TRASH_WINDOW_DAYS_MEMBER` is the fix; it lives in a file
 * this change does not own, so `listTrash` reports `imageCount` and the UI warns
 * instead of pretending.
 */

import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { feedEventBus } from '@/lib/feed-sse';
import { linkPostHashtags, unlinkPostHashtags } from '@/lib/tags-extract.server';
import { screenNewContent } from '@/lib/moderation/auto-moderate.server';
import { deleteObject } from '@/lib/storage/s3.server';
import { purgeFromCdn } from '@/lib/storage/cdn.server';
import {
  TRASH_PAGE_SIZE,
  checkPurgeEligibility,
  checkRestoreEligibility,
  daysRemaining,
  excerptOf,
  trashExpiresAt,
  type ParentState,
  type RestoreEligibility,
  type RestoreRefusal,
  type TrashItem,
  type TrashKind,
  type TrashPage,
} from '@/lib/trash/types';

type Tx = Prisma.TransactionClient;

export type TrashResult = { ok: true } | { ok: false; reason: RestoreRefusal };

/* -------------------------------------------------------------------------- */
/* Cursor                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The bin merges two tables, so one page carries one cursor per table.
 *
 * A single `deletedAt` cursor would have been simpler and wrong: a bulk delete
 * stamps a whole chunk with the same timestamp, so `deletedAt < cursor` silently
 * drops every row that shares the boundary millisecond. Ids are cuids and
 * contain no `~`.
 */
interface TrashCursor {
  post?: string;
  comment?: string;
}

function encodeCursor(cursor: TrashCursor): string | null {
  if (!cursor.post && !cursor.comment) return null;
  return `${cursor.post ?? ''}~${cursor.comment ?? ''}`;
}

function decodeCursor(raw: string | null | undefined): TrashCursor {
  if (!raw) return {};
  const [post, comment] = raw.split('~');
  return { post: post || undefined, comment: comment || undefined };
}

/* -------------------------------------------------------------------------- */
/* List                                                                       */
/* -------------------------------------------------------------------------- */

interface DeletedRow {
  kind: TrashKind;
  id: string;
  content: string;
  createdAt: Date;
  deletedAt: Date;
  deletedBy: string | null;
  deletedByAdmin: boolean;
  imageCount?: number;
  postId?: string;
  parents: ParentState[];
}

/**
 * One page of the caller's bin, newest deletion first.
 *
 * Every row is evaluated against the same eligibility rules the restore
 * endpoint applies, so the list can render a disabled Restore button with the
 * real reason instead of letting the user find out by clicking.
 */
export async function listTrash(
  userId: string,
  windowDays: number,
  opts: { kind?: TrashKind; cursor?: string | null } = {},
  now: Date = new Date(),
): Promise<TrashPage> {
  const cursor = decodeCursor(opts.cursor);
  const wantPosts = opts.kind !== 'comment';
  const wantComments = opts.kind !== 'post';
  const take = TRASH_PAGE_SIZE + 1;

  const [posts, comments] = await Promise.all([
    wantPosts
      ? prisma.rMHark.findMany({
          where: { userId, deletedAt: { not: null } },
          orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursor.post ? { cursor: { id: cursor.post }, skip: 1 } : {}),
          select: {
            id: true,
            content: true,
            imageUrls: true,
            createdAt: true,
            deletedAt: true,
            deletedBy: true,
            deletedByAdmin: true,
            original: { select: { id: true, deletedAt: true } },
            originalId: true,
            threadRootId: true,
          },
        })
      : [],
    wantComments
      ? prisma.rMHarkComment.findMany({
          where: { userId, deletedAt: { not: null } },
          orderBy: [{ deletedAt: 'desc' }, { id: 'desc' }],
          take,
          ...(cursor.comment ? { cursor: { id: cursor.comment }, skip: 1 } : {}),
          select: {
            id: true,
            content: true,
            createdAt: true,
            deletedAt: true,
            deletedBy: true,
            deletedByAdmin: true,
            rmheetId: true,
            rmhark: { select: { id: true, deletedAt: true } },
            parentId: true,
            parent: { select: { id: true, deletedAt: true } },
          },
        })
      : [],
  ]);

  // Thread roots are the one ancestor not reachable by a relation (`threadRootId`
  // is a plain column, not an FK), so they are resolved in one extra query for
  // the whole page rather than one per row.
  const rootIds = [...new Set(posts.map((p) => p.threadRootId).filter((v): v is string => !!v))];
  const roots = rootIds.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: rootIds } },
        select: { id: true, deletedAt: true },
      })
    : [];
  const rootById = new Map(roots.map((r) => [r.id, r]));

  const rows: DeletedRow[] = [
    ...posts.map((p): DeletedRow => {
      const parents: ParentState[] = [];
      if (p.originalId) {
        parents.push({
          label: 'post',
          exists: !!p.original,
          deletedAt: p.original?.deletedAt ?? null,
        });
      }
      if (p.threadRootId) {
        const root = rootById.get(p.threadRootId);
        parents.push({ label: 'post', exists: !!root, deletedAt: root?.deletedAt ?? null });
      }
      return {
        kind: 'post',
        id: p.id,
        content: p.content,
        createdAt: p.createdAt,
        deletedAt: p.deletedAt as Date,
        deletedBy: p.deletedBy,
        deletedByAdmin: p.deletedByAdmin,
        imageCount: p.imageUrls.length,
        parents,
      };
    }),
    ...comments.map((c): DeletedRow => {
      const parents: ParentState[] = [
        { label: 'post', exists: !!c.rmhark, deletedAt: c.rmhark?.deletedAt ?? null },
      ];
      if (c.parentId) {
        parents.push({
          label: 'comment',
          exists: !!c.parent,
          deletedAt: c.parent?.deletedAt ?? null,
        });
      }
      return {
        kind: 'comment',
        id: c.id,
        content: c.content,
        createdAt: c.createdAt,
        deletedAt: c.deletedAt as Date,
        deletedBy: c.deletedBy,
        deletedByAdmin: c.deletedByAdmin,
        postId: c.rmheetId,
        parents,
      };
    }),
  ].sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());

  const page = rows.slice(0, TRASH_PAGE_SIZE);
  const hasMore = rows.length > TRASH_PAGE_SIZE;

  // Each table advances only as far as the merged page actually consumed it, so
  // the next request resumes both streams at the right place.
  const lastPost = [...page].reverse().find((r) => r.kind === 'post');
  const lastComment = [...page].reverse().find((r) => r.kind === 'comment');
  const nextCursor = hasMore
    ? encodeCursor({
        post: lastPost?.id ?? cursor.post,
        comment: lastComment?.id ?? cursor.comment,
      })
    : null;

  return {
    items: page.map((row) => toTrashItem(row, userId, windowDays, now)),
    nextCursor,
    windowDays,
  };
}

function toTrashItem(row: DeletedRow, userId: string, windowDays: number, now: Date): TrashItem {
  const eligibility = checkRestoreEligibility(
    userId,
    {
      ownerId: userId,
      deletedAt: row.deletedAt,
      deletedBy: row.deletedBy,
      deletedByAdmin: row.deletedByAdmin,
      parents: row.parents,
    },
    now,
    windowDays,
  );
  return {
    kind: row.kind,
    id: row.id,
    excerpt: excerptOf(row.content),
    createdAt: row.createdAt.toISOString(),
    deletedAt: row.deletedAt.toISOString(),
    expiresAt: trashExpiresAt(row.deletedAt, windowDays).toISOString(),
    daysRemaining: daysRemaining(row.deletedAt, windowDays, now),
    restorable: eligibility.ok,
    reason: eligibility.ok ? null : eligibility.reason,
    ...(row.kind === 'post' ? { imageCount: row.imageCount ?? 0 } : { postId: row.postId }),
  };
}

/* -------------------------------------------------------------------------- */
/* Restore                                                                    */
/* -------------------------------------------------------------------------- */

/** Put one row back. Returns a typed refusal rather than throwing. */
export async function restoreItem(
  userId: string,
  kind: TrashKind,
  id: string,
  windowDays: number,
  now: Date = new Date(),
): Promise<TrashResult> {
  return kind === 'post'
    ? restorePost(userId, id, windowDays, now)
    : restoreComment(userId, id, windowDays, now);
}

async function restorePost(
  userId: string,
  id: string,
  windowDays: number,
  now: Date,
): Promise<TrashResult> {
  const post = await prisma.rMHark.findUnique({
    where: { id },
    select: {
      userId: true,
      content: true,
      deletedAt: true,
      deletedBy: true,
      deletedByAdmin: true,
      communityId: true,
      originalId: true,
      original: { select: { id: true, deletedAt: true } },
      threadRootId: true,
    },
  });
  if (!post) return { ok: false, reason: 'not-found' };

  const parents: ParentState[] = [];
  if (post.originalId) {
    parents.push({
      label: 'post',
      exists: !!post.original,
      deletedAt: post.original?.deletedAt ?? null,
    });
  }
  if (post.threadRootId) {
    const root = await prisma.rMHark.findUnique({
      where: { id: post.threadRootId },
      select: { id: true, deletedAt: true },
    });
    parents.push({ label: 'post', exists: !!root, deletedAt: root?.deletedAt ?? null });
  }

  const eligible = checkRestoreEligibility(
    userId,
    { ownerId: post.userId, ...post, parents },
    now,
    windowDays,
  );
  if (!eligible.ok) return eligible;

  await prisma.$transaction(async (tx) => {
    // `updateMany` with the deleted predicate makes the restore idempotent under
    // a double-submit: the second one matches zero rows and the counter work
    // below is skipped with it.
    const { count } = await tx.rMHark.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null, deletedBy: null, deletedByAdmin: false },
    });
    if (count === 0) return;
    await linkPostHashtags(tx, id, post.content);
    await restorePostCounters(tx, userId, post.communityId);
  });

  // The post reappears for anyone holding its detail view open. There is no
  // `rmhark.restored` event type and `lib/feed-sse.ts` is not this change's to
  // extend, so this rides `rmhark.edited` — which is exactly what the client
  // does with it: patch the item in place with the real content and clear the
  // tombstone.
  feedEventBus.publishPostEngagement(id, {
    type: 'rmhark.edited',
    rmharkId: id,
    payload: { id, content: post.content, deletedAt: null, deletedByAdmin: false },
    timestamp: now.toISOString(),
  });

  // Re-screen rather than trusting the verdict that stood when it was deleted:
  // the risk this feature carries is restoring something reported in the interim
  // (plan I1 §Risks). Fire-and-forget by design — `screenNewContent` swallows
  // everything and never blocks.
  void screenNewContent({
    entityType: 'rmhark',
    entityId: id,
    authorId: userId,
    text: post.content,
  });

  return { ok: true };
}

/**
 * Put the two denormalized post counts back.
 *
 * A recount, not an increment, because the two soft-delete paths in the codebase
 * disagree: `app/routes/api/rmharks/$id.ts` decrements both counters, while
 * `deleteOwnPost` in `lib/social/engagement.server.ts` (the developer API's
 * path) only stamps `deletedAt`. An unconditional `+1` would therefore drift
 * upward by one for every post deleted through the second path and restored
 * through this one. The counts are per-author / per-community and index-backed,
 * and a restore is a rare, single-row operation — the exact answer is cheap
 * enough here in a way it would not be on the delete path.
 */
async function restorePostCounters(
  tx: Tx,
  userId: string,
  communityId: string | null,
): Promise<void> {
  const live = await tx.rMHark.count({ where: { userId, deletedAt: null } });
  await tx.user.update({ where: { id: userId }, data: { postCount: live } });
  if (communityId) {
    const communityLive = await tx.rMHark.count({ where: { communityId, deletedAt: null } });
    await tx.community.updateMany({
      where: { id: communityId },
      data: { postCount: communityLive },
    });
  }
}

async function restoreComment(
  userId: string,
  id: string,
  windowDays: number,
  now: Date,
): Promise<TrashResult> {
  const comment = await prisma.rMHarkComment.findUnique({
    where: { id },
    select: {
      userId: true,
      content: true,
      deletedAt: true,
      deletedBy: true,
      deletedByAdmin: true,
      rmheetId: true,
      rmhark: { select: { id: true, deletedAt: true } },
      parentId: true,
      parent: { select: { id: true, deletedAt: true } },
    },
  });
  if (!comment) return { ok: false, reason: 'not-found' };

  const parents: ParentState[] = [
    { label: 'post', exists: !!comment.rmhark, deletedAt: comment.rmhark?.deletedAt ?? null },
  ];
  if (comment.parentId) {
    parents.push({
      label: 'comment',
      exists: !!comment.parent,
      deletedAt: comment.parent?.deletedAt ?? null,
    });
  }

  const eligible = checkRestoreEligibility(
    userId,
    { ownerId: comment.userId, ...comment, parents },
    now,
    windowDays,
  );
  if (!eligible.ok) return eligible;

  // No counter work, and that is deliberate rather than an omission. Grep the
  // tree: `commentCount` (on RMHark) and `replyCount` (on RMHarkComment) are
  // ONLY ever incremented — no delete path decrements either. Re-incrementing on
  // restore would therefore inflate both by one per restored comment, which is
  // the exact drift this feature is supposed to avoid. Restoring through the
  // same paths that decremented means doing nothing when nothing decremented.
  await prisma.rMHarkComment.updateMany({
    where: { id, userId, deletedAt: { not: null } },
    data: { deletedAt: null, deletedBy: null, deletedByAdmin: false },
  });

  void screenNewContent({
    entityType: 'comment',
    entityId: id,
    authorId: userId,
    text: comment.content,
  });

  return { ok: true };
}

/* -------------------------------------------------------------------------- */
/* Purge                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Hard-delete now — the "I meant that" escape hatch.
 *
 * For a post this also releases the attached `Media` (object store + CDN + row)
 * rather than leaving it to the weekly sweep, so "Delete forever" reclaims the
 * storage the user asked to reclaim. The FK is `onDelete: SetNull`, so without
 * this the rows would simply go orphaned and wait.
 */
export async function purgeItem(userId: string, kind: TrashKind, id: string): Promise<TrashResult> {
  if (kind === 'comment') {
    const comment = await prisma.rMHarkComment.findUnique({
      where: { id },
      select: { userId: true, deletedAt: true, deletedBy: true, deletedByAdmin: true },
    });
    if (!comment) return { ok: false, reason: 'not-found' };
    const eligible = checkPurgeEligibility(userId, { ownerId: comment.userId, ...comment });
    if (!eligible.ok) return eligible;
    await prisma.rMHarkComment.deleteMany({ where: { id, userId, deletedAt: { not: null } } });
    return { ok: true };
  }

  const post = await prisma.rMHark.findUnique({
    where: { id },
    select: { userId: true, deletedAt: true, deletedBy: true, deletedByAdmin: true },
  });
  if (!post) return { ok: false, reason: 'not-found' };
  const eligible = checkPurgeEligibility(userId, { ownerId: post.userId, ...post });
  if (!eligible.ok) return eligible;

  await releasePostMedia(id);
  await prisma.rMHark.deleteMany({ where: { id, userId, deletedAt: { not: null } } });
  return { ok: true };
}

/**
 * Delete a post's media objects, then their rows. Object-store failures are
 * logged and skipped — the row survives so `sweepUnreferencedMedia` retries it
 * later, which is strictly better than deleting the row and losing the key.
 */
async function releasePostMedia(postId: string): Promise<void> {
  const media = await prisma.media.findMany({ where: { postId }, select: { id: true, key: true } });
  if (media.length === 0) return;
  const released: string[] = [];
  for (const item of media) {
    try {
      await deleteObject(item.key);
      await purgeFromCdn(item.key);
      released.push(item.id);
    } catch (error) {
      console.error(`[trash] failed to release media ${item.key}:`, error);
    }
  }
  if (released.length > 0) {
    await prisma.media.deleteMany({ where: { id: { in: released } } });
  }
}

/* -------------------------------------------------------------------------- */
/* Author-attributed soft delete (the path bulk operations take)              */
/* -------------------------------------------------------------------------- */

export type SoftDeleteOutcome = 'deleted' | 'already-deleted' | 'not-found';

/**
 * Soft-delete one of the caller's own posts, stamped `deletedBy: 'author'` so it
 * lands in the bin as restorable.
 *
 * A faithful copy of the side effects in `app/routes/api/rmharks/$id.ts`'s
 * DELETE — hashtag unlink, author `postCount`, community `postCount`, the SSE
 * tombstone — because a bulk delete that skipped them would leave the trending
 * tags and both profile counters wrong across thousands of rows at once. The
 * counters decrement here rather than recount: this runs per row inside a bulk
 * loop, where a `count()` per row is not affordable, and it is symmetric with
 * the restore above.
 */
export async function softDeletePostAsAuthor(
  userId: string,
  postId: string,
  now: Date = new Date(),
): Promise<SoftDeleteOutcome> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { userId: true, deletedAt: true, communityId: true },
  });
  if (!post || post.userId !== userId) return 'not-found';
  if (post.deletedAt) return 'already-deleted';

  await prisma.$transaction(async (tx) => {
    const { count } = await tx.rMHark.updateMany({
      where: { id: postId, userId, deletedAt: null },
      data: { deletedAt: now, deletedBy: 'author' },
    });
    // Lost the race with another delete — leave the one-shot side effects to
    // whoever won it, or the counters double-decrement.
    if (count === 0) return;
    await unlinkPostHashtags(tx, postId);
    await tx.user.updateMany({
      where: { id: userId, postCount: { gt: 0 } },
      data: { postCount: { decrement: 1 } },
    });
    if (post.communityId) {
      await tx.community.updateMany({
        where: { id: post.communityId, postCount: { gt: 0 } },
        data: { postCount: { decrement: 1 } },
      });
    }
  });

  feedEventBus.publishPostEngagement(postId, {
    type: 'rmhark.deleted',
    rmharkId: postId,
    payload: {
      id: postId,
      deletedAt: now.toISOString(),
      deletedByAdmin: false,
      content: '[This RMHark was deleted by the user]',
    },
    timestamp: now.toISOString(),
  });

  return 'deleted';
}

/** Soft-delete one of the caller's own comments, stamped `deletedBy: 'author'`. */
export async function softDeleteCommentAsAuthor(
  userId: string,
  commentId: string,
  now: Date = new Date(),
): Promise<SoftDeleteOutcome> {
  const { count } = await prisma.rMHarkComment.updateMany({
    where: { id: commentId, userId, deletedAt: null },
    data: { deletedAt: now, deletedBy: 'author' },
  });
  if (count > 0) return 'deleted';
  const exists = await prisma.rMHarkComment.findFirst({
    where: { id: commentId, userId },
    select: { id: true },
  });
  return exists ? 'already-deleted' : 'not-found';
}

export type { RestoreEligibility };
