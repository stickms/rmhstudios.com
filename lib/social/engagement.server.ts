/**
 * Canonical social mutations (like, comment, bookmark, follow, post create /
 * delete) with all their side effects — denormalized counters, SSE broadcasts,
 * notifications, XP, quests, achievements, and webhook emission.
 *
 * This is the single source of truth used by BOTH the in-app web routes and the
 * developer API, so the two can never drift. Functions return data (never
 * Responses); callers shape the HTTP response. They are best-effort about
 * gamification/notification side effects (those never block the core action).
 */

import { prisma } from '@/lib/prisma.server';
import { feedEventBus } from '@/lib/feed-sse';
import { createNotification, removeNotification } from '@/lib/notifications.server';
import { notifyMentions } from '@/lib/feed/notify-mentions.server';
import { progressAchievement } from '@/lib/achievements/engine.server';
import { enqueueProgression } from '@/lib/social/engagement-effects.server';
import { resolveMediaForPost } from '@/lib/media/attach.server';
import { userDisplaySelect } from '@/lib/user-display';
import { invalidateFollowingIds } from '@/lib/social/follow-graph.server';
import type { RMHarkAudience } from '@prisma/client';

function postLink(handle: string | null | undefined, userId: string, postId: string): string {
  return `/u/${handle ?? userId}/post/${postId}`;
}

// ─── Likes ───────────────────────────────────────────────────────────────

export interface LikeResult {
  ok: boolean;
  /** False when the target post does not exist. */
  found: boolean;
  liked: boolean;
  likeCount: number;
}

/**
 * Set the like state of a post to `liked` for `userId`. Idempotent: a no-op when
 * already in the requested state. Returns the resulting like state + count.
 */
export async function setPostLike(
  userId: string,
  postId: string,
  liked: boolean,
): Promise<LikeResult> {
  // The post row and the viewer's existing like are independent lookups — fetch
  // them together instead of serially on the highest-traffic write path.
  const [post, existing] = await Promise.all([
    prisma.rMHark.findUnique({
      where: { id: postId },
      select: { userId: true, content: true, likeCount: true, user: { select: { handle: true } } },
    }),
    prisma.rMHarkLike.findUnique({ where: { rmheetId_userId: { rmheetId: postId, userId } } }),
  ]);
  if (!post) return { ok: false, found: false, liked: false, likeCount: 0 };

  // Already in the requested state — no-op.
  if (liked && existing) return { ok: true, found: true, liked: true, likeCount: post.likeCount };
  if (!liked && !existing)
    return { ok: true, found: true, liked: false, likeCount: post.likeCount };

  if (liked) {
    const [, updated] = await prisma.$transaction([
      prisma.rMHarkLike.create({ data: { rmheetId: postId, userId } }),
      prisma.rMHark.update({
        where: { id: postId },
        data: { likeCount: { increment: 1 } },
        select: { likeCount: true },
      }),
    ]);
    feedEventBus.publishPostEngagement(postId, {
      type: 'rmhark.liked',
      rmharkId: postId,
      payload: { id: postId, likeCount: updated.likeCount },
      timestamp: new Date().toISOString(),
    });
    await createNotification({
      userId: post.userId,
      actorId: userId,
      type: 'LIKE',
      entityType: 'rmhark',
      entityId: postId,
      preview: post.content ?? null,
      link: postLink(post.user?.handle, post.userId, postId),
      dedupeUnread: true,
    });
    void enqueueProgression({
      actorId: userId,
      achievement: 'social.first_like_given',
      xp: 5,
      questKey: 'like_given',
      webhook: { event: 'like.created', data: { postId } },
    });
    return { ok: true, found: true, liked: true, likeCount: updated.likeCount };
  }

  const [, updated] = await prisma.$transaction([
    prisma.rMHarkLike.delete({ where: { id: existing!.id } }),
    prisma.rMHark.update({
      where: { id: postId },
      data: { likeCount: { decrement: 1 } },
      select: { likeCount: true },
    }),
  ]);
  feedEventBus.publishPostEngagement(postId, {
    type: 'rmhark.unliked',
    rmharkId: postId,
    payload: { id: postId, likeCount: updated.likeCount },
    timestamp: new Date().toISOString(),
  });
  await removeNotification({
    userId: post.userId,
    actorId: userId,
    type: 'LIKE',
    entityType: 'rmhark',
    entityId: postId,
  });
  return { ok: true, found: true, liked: false, likeCount: updated.likeCount };
}

/** Toggle a like (used by the in-app web route). */
export async function togglePostLike(userId: string, postId: string): Promise<LikeResult> {
  const existing = await prisma.rMHarkLike.findUnique({
    where: { rmheetId_userId: { rmheetId: postId, userId } },
    select: { id: true },
  });
  return setPostLike(userId, postId, !existing);
}

// ─── Comments ──────────────────────────────────────────────────────────────

export type CommentWithUser = Awaited<ReturnType<typeof createCommentRow>>;

function createCommentRow(data: {
  content: string;
  rmheetId: string;
  userId: string;
  parentId: string | null;
}) {
  return prisma.rMHarkComment.create({ data, include: { user: { select: userDisplaySelect } } });
}

export interface CreateCommentResult {
  ok: boolean;
  found: boolean;
  comment?: CommentWithUser;
}

/** Create a comment (or threaded reply) with all notifications + progression. */
export async function createComment(args: {
  userId: string;
  postId: string;
  content: string;
  parentId?: string | null;
}): Promise<CreateCommentResult> {
  const { userId, postId } = args;
  const content = args.content.trim();

  // One read up front for both the existence guard AND the notification target
  // (author id + handle). Previously the same row was read three times per
  // comment: an existence check, a redundant count re-read, and this author read.
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, userId: true, user: { select: { handle: true } } },
  });
  if (!post) return { ok: false, found: false };

  // The transaction's update already returns the incremented count — capture it
  // instead of issuing a separate findUnique afterward.
  const [comment, updated] = await prisma.$transaction([
    createCommentRow({ content, rmheetId: postId, userId, parentId: args.parentId ?? null }),
    prisma.rMHark.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
      select: { commentCount: true },
    }),
  ]);

  feedEventBus.publishPostEngagement(postId, {
    type: 'rmhark.commented',
    rmharkId: postId,
    payload: { id: postId, commentCount: updated.commentCount },
    timestamp: new Date().toISOString(),
  });

  // Notifications (best-effort).
  try {
    const link = postLink(post.user?.handle, post.userId, postId);
    let parentAuthorId: string | null = null;
    if (args.parentId) {
      const parent = await prisma.rMHarkComment.findUnique({
        where: { id: args.parentId },
        select: { userId: true },
      });
      if (parent) {
        parentAuthorId = parent.userId;
        await createNotification({
          userId: parent.userId,
          actorId: userId,
          type: 'REPLY',
          entityType: 'comment',
          entityId: comment.id,
          preview: content,
          link,
        });
      }
    }
    if (post.userId !== parentAuthorId) {
      await createNotification({
        userId: post.userId,
        actorId: userId,
        type: 'COMMENT',
        entityType: 'rmhark',
        entityId: postId,
        preview: content,
        link,
      });
    }
    await notifyMentions({
      content: comment.content,
      author: {
        id: comment.user.id,
        name: comment.user.name ?? null,
        image: comment.user.image ?? null,
        handle: comment.user.handle ?? null,
      },
      postId,
      entityType: 'comment',
      entityId: comment.id,
      link,
      timestamp: comment.createdAt.toISOString(),
    });
  } catch (e) {
    console.error('comment notification error:', e);
  }

  void enqueueProgression({
    actorId: userId,
    achievement: 'social.first_comment',
    xp: 10,
    questKey: 'comment',
    webhook: { event: 'comment.created', data: { postId, commentId: comment.id } },
  });

  return { ok: true, found: true, comment };
}

// ─── Bookmarks ─────────────────────────────────────────────────────────────

export interface BookmarkResult {
  ok: boolean;
  found: boolean;
  bookmarked: boolean;
}

/** Set the bookmark state of a post idempotently. */
export async function setBookmark(
  userId: string,
  postId: string,
  bookmarked: boolean,
): Promise<BookmarkResult> {
  const existing = await prisma.rMHarkBookmark.findUnique({
    where: { userId_rmheetId: { userId, rmheetId: postId } },
    select: { id: true },
  });

  if (bookmarked && existing) return { ok: true, found: true, bookmarked: true };
  if (!bookmarked && !existing) return { ok: true, found: true, bookmarked: false };

  if (bookmarked) {
    const post = await prisma.rMHark.findUnique({ where: { id: postId }, select: { id: true } });
    if (!post) return { ok: false, found: false, bookmarked: false };
    await prisma.rMHarkBookmark.create({ data: { userId, rmheetId: postId } });
    void enqueueProgression({
      actorId: userId,
      achievement: 'social.first_bookmark',
      questKey: 'bookmark',
      webhook: { event: 'bookmark.created', data: { postId } },
    });
    return { ok: true, found: true, bookmarked: true };
  }

  await prisma.rMHarkBookmark.delete({ where: { id: existing!.id } });
  return { ok: true, found: true, bookmarked: false };
}

/** Toggle a bookmark (used by the in-app web route). */
export async function toggleBookmark(userId: string, postId: string): Promise<BookmarkResult> {
  const existing = await prisma.rMHarkBookmark.findUnique({
    where: { userId_rmheetId: { userId, rmheetId: postId } },
    select: { id: true },
  });
  return setBookmark(userId, postId, !existing);
}

// ─── Follows ─────────────────────────────────────────────────────────────

export interface FollowResult {
  ok: boolean;
  found: boolean;
  following: boolean;
  selfFollow?: boolean;
}

async function applyFollow(args: {
  followerId: string;
  followingId: string;
  following: boolean;
  followerHandle?: string | null;
}): Promise<FollowResult> {
  const { followerId, followingId, following } = args;
  if (followerId === followingId)
    return { ok: false, found: true, following: false, selfFollow: true };

  const target = await prisma.user.findUnique({ where: { id: followingId }, select: { id: true } });
  if (!target) return { ok: false, found: false, following: false };

  const existing = await prisma.follow.findUnique({
    where: { followerId_followingId: { followerId, followingId } },
    select: { id: true },
  });

  if (following && existing) return { ok: true, found: true, following: true };
  if (!following && !existing) return { ok: true, found: true, following: false };

  if (following) {
    // One transaction keeps all three writes atomic: the edge, the followed
    // user's follower count, and the follower's own following count. Reuse the
    // returned followerCount for achievement progress (avoids a follow.count).
    const [, followedRow] = await prisma.$transaction([
      prisma.follow.create({ data: { followerId, followingId } }),
      prisma.user.update({
        where: { id: followingId },
        data: { followerCount: { increment: 1 } },
        select: { followerCount: true },
      }),
      prisma.user.update({
        where: { id: followerId },
        data: { followingCount: { increment: 1 } },
        select: { id: true },
      }),
    ]);
    const { followerCount } = followedRow;
    // The follower's cached follow graph is now stale — drop it so their next
    // feed/sidebar read reflects the new follow immediately.
    invalidateFollowingIds(followerId);
    await createNotification({
      userId: followingId,
      actorId: followerId,
      type: 'FOLLOW',
      entityType: 'user',
      entityId: followerId,
      link: args.followerHandle ? `/u/${args.followerHandle}` : `/profile/${followerId}`,
      dedupeUnread: true,
    });
    try {
      await progressAchievement(followingId, 'social.first_follower', {
        setProgress: followerCount,
      });
      await progressAchievement(followingId, 'social.followers_50', { setProgress: followerCount });
      await progressAchievement(followingId, 'social.followers_500', {
        setProgress: followerCount,
      });
    } catch (e) {
      console.error('follow achievement error:', e);
    }
    void enqueueProgression({
      actorId: followerId,
      xp: 5,
      questKey: 'follow',
      webhook: { event: 'follow.created', data: { followingId } },
    });
    return { ok: true, found: true, following: true };
  }

  // Remove the edge and keep both denormalized counters in sync (never below
  // zero), atomically: the followed user's follower count and the follower's
  // own following count.
  await prisma.$transaction([
    prisma.follow.delete({ where: { followerId_followingId: { followerId, followingId } } }),
    prisma.user.updateMany({
      where: { id: followingId, followerCount: { gt: 0 } },
      data: { followerCount: { decrement: 1 } },
    }),
    prisma.user.updateMany({
      where: { id: followerId, followingCount: { gt: 0 } },
      data: { followingCount: { decrement: 1 } },
    }),
  ]);
  invalidateFollowingIds(followerId);
  await removeNotification({
    userId: followingId,
    actorId: followerId,
    type: 'FOLLOW',
    entityType: 'user',
    entityId: followerId,
  });
  void enqueueProgression({
    actorId: followerId,
    webhook: { event: 'follow.deleted', data: { followingId } },
  });
  return { ok: true, found: true, following: false };
}

/** Follow a user idempotently. */
export function followUser(args: {
  followerId: string;
  followingId: string;
  followerHandle?: string | null;
}): Promise<FollowResult> {
  return applyFollow({ ...args, following: true });
}

/** Unfollow a user idempotently. */
export function unfollowUser(args: {
  followerId: string;
  followingId: string;
}): Promise<FollowResult> {
  return applyFollow({ ...args, following: false });
}

/** Toggle follow (used by the in-app web route). */
export async function toggleFollow(args: {
  followerId: string;
  followingId: string;
  followerHandle?: string | null;
}): Promise<FollowResult> {
  if (args.followerId === args.followingId)
    return { ok: false, found: true, following: false, selfFollow: true };
  const existing = await prisma.follow.findUnique({
    where: {
      followerId_followingId: { followerId: args.followerId, followingId: args.followingId },
    },
    select: { id: true },
  });
  return applyFollow({ ...args, following: !existing });
}

// ─── Posts ─────────────────────────────────────────────────────────────────

export interface CreatePostResult {
  ok: boolean;
  error?: string;
  post?: { id: string; content: string; audience: RMHarkAudience; createdAt: Date };
}

/**
 * Create a post on behalf of `userId`, optionally attaching pre-uploaded media.
 * Awards XP, progresses quests, and emits `post.created`. Shared by the API.
 */
export async function createPost(args: {
  userId: string;
  content: string;
  audience?: RMHarkAudience;
  mediaIds?: string[];
}): Promise<CreatePostResult> {
  const { userId } = args;
  const content = args.content.trim();
  const mediaIds = args.mediaIds ?? [];

  const post = await prisma.rMHark.create({
    data: { userId, content, audience: args.audience ?? 'PUBLIC' },
    select: { id: true, content: true, createdAt: true, audience: true },
  });

  if (mediaIds.length > 0) {
    const attached = await resolveMediaForPost({ prisma }, { userId, mediaIds, postId: post.id });
    if (!attached.ok) {
      await prisma.rMHark.delete({ where: { id: post.id } }).catch(() => {});
      return { ok: false, error: attached.error };
    }
    await prisma.rMHark.update({ where: { id: post.id }, data: { imageUrls: attached.urls } });
  }

  void enqueueProgression({
    actorId: userId,
    xp: 25,
    questKey: 'post',
    webhook: { event: 'post.created', data: { postId: post.id } },
  });

  return { ok: true, post };
}

export interface DeletePostResult {
  ok: boolean;
  found: boolean;
  forbidden?: boolean;
}

/** Soft-delete one of the user's own posts. */
export async function deleteOwnPost(userId: string, postId: string): Promise<DeletePostResult> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { userId: true, deletedAt: true },
  });
  if (!post) return { ok: false, found: false };
  if (post.userId !== userId) return { ok: false, found: true, forbidden: true };
  if (!post.deletedAt) {
    await prisma.rMHark.update({ where: { id: postId }, data: { deletedAt: new Date() } });
    void enqueueProgression({
      actorId: userId,
      webhook: { event: 'post.deleted', data: { postId } },
    });
  }
  return { ok: true, found: true };
}
