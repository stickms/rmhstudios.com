/**
 * Pinned posts in communities (s09-06, server-only). Moderators pin up to three top-level posts; the cap is a
 * check-then-insert, so it runs under `lockKey(tx, 'community-pins:<id>')`, and every change writes its mod-log row in
 * the same transaction. The readers (`loadPinnedItems`, `getCommunityPins`) go through the feed's own visibility filter
 * and serialiser, so blocks (both directions), removed and held posts, quiet counts, content warnings, GIF
 * descriptions and quiz reveals apply to a pinned row exactly as to the row in the feed.
 *
 * Read-path registries: this file selects no post text, GIF or poll column itself. It loads ids and hands the rows to
 * the feed's own mapper (`rmharkIncludeLite` + `mapRmharksWithBoundedReactions`), which carries the content-warning
 * reason, the GIF description, the quiz reveal and the quiet counts, so it is in none of those read-path lists;
 * `lib/communities/__tests__/pins-feed.test.ts` holds that a pinned row goes through that mapper and nowhere else.
 */
import { notice } from '@/lib/notifications/notice-keys';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { lockKey } from '@/lib/db/advisory-lock.server';
import { logModAction } from '@/lib/communities/modlog.server';
import { PIN_LIMIT, PIN_LIMIT_MESSAGE, type PinErrorCode } from '@/lib/communities/pins';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { viewerVisiblePostWhere } from '@/lib/feed/audience.server';
import { loadFlairsForPosts } from '@/lib/communities/flairs.server';
import { createNotification } from '@/lib/notifications.server';
import type { FeedItem } from '@/lib/feed-types';

export class PinError extends Error {
  constructor(
    readonly status: 404 | 409,
    readonly code: PinErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** The notification's `entityType`; its label is `system-label-community-pin` (components/feed/notification-labels.ts). */
export const PIN_NOTICE_ENTITY = 'community-pin';

/** A pin whose post was deleted, removed or held (`deletedAt`) is not a pin: it takes no slot and shows nowhere. */
const LIVE = { post: { deletedAt: null } } as const;

interface PinRow {
  postId: string;
  position: number;
}

/** The community's pin rows, in the moderators' order. One indexed query on `(communityId, position)`. */
export async function readPinRows(communityId: string): Promise<PinRow[]> {
  const rows = await prisma.communityPinnedPost.findMany({
    where: { communityId, ...LIVE },
    orderBy: { position: 'asc' },
    select: { postId: true, position: true },
  });
  return Array.isArray(rows) ? rows : [];
}

/**
 * The pinned posts a viewer sees, in order. `visible` is the feed's `viewerVisiblePostWhere` (the same filter, so a
 * blocked author's pin is dropped in both directions, and a deleted, removed or held post - `deletedAt` set - drops
 * out), and only top-level posts of this community count. One query for the rows and one batch to serialise them.
 */
export async function loadPinnedItems(args: {
  communityId: string;
  slug: string;
  viewerId: string | null;
  visible: Record<string, unknown>;
  rows: readonly PinRow[];
}): Promise<FeedItem[]> {
  if (args.rows.length === 0) return [];
  const posts = await prisma.rMHark.findMany({
    where: {
      id: { in: args.rows.map((r) => r.postId) },
      communityId: args.communityId,
      threadRootId: null,
      ...args.visible,
    },
    include: rmharkIncludeLite(args.viewerId),
  });
  const [items, flairs] = await Promise.all([
    mapRmharksWithBoundedReactions(posts, args.viewerId),
    loadFlairsForPosts(posts.map((p) => p.id)),
  ]);
  const byId = new Map(items.map((i) => [i.id, i]));
  const out: FeedItem[] = [];
  for (const r of args.rows) {
    const item = byId.get(r.postId);
    if (!item) continue;
    item.communitySlug = args.slug;
    item.communityPinned = true;
    const flair = flairs.get(item.id);
    if (flair) item.communityFlair = flair;
    out.push(item);
  }
  return out;
}

/** The community's pinned posts for one viewer (the pinned block and the menu). The caller has checked readability. */
export async function getCommunityPins(args: {
  communityId: string;
  slug: string;
  viewerId: string | null;
  canModerate: boolean;
}): Promise<{ items: FeedItem[]; order: string[]; canModerate: boolean; limit: number }> {
  const [rows, visible] = await Promise.all([
    readPinRows(args.communityId),
    viewerVisiblePostWhere(args.viewerId, { hideMuted: true }),
  ]);
  const items = await loadPinnedItems({
    communityId: args.communityId,
    slug: args.slug,
    viewerId: args.viewerId,
    visible,
    rows,
  });
  return { items, order: rows.map((r) => r.postId), canModerate: args.canModerate, limit: PIN_LIMIT };
}

/** Which of these posts are pinned, for the developer API's `pinned` field. One indexed query on the page's ids. */
export async function pinnedAmong(communityId: string, postIds: readonly string[]): Promise<Set<string>> {
  if (postIds.length === 0) return new Set();
  const rows = await prisma.communityPinnedPost.findMany({
    where: { communityId, postId: { in: [...postIds] }, ...LIVE },
    select: { postId: true },
  });
  return new Set((Array.isArray(rows) ? rows : []).map((r) => r.postId));
}

/** Close the gaps after a removal so positions stay 0..n-1. Runs inside the caller's transaction (and its lock). */
async function repack(tx: Prisma.TransactionClient, communityId: string): Promise<string[]> {
  const rows = await tx.communityPinnedPost.findMany({
    where: { communityId, ...LIVE },
    orderBy: { position: 'asc' },
    select: { postId: true, position: true },
  });
  const list = Array.isArray(rows) ? rows : [];
  for (const [i, r] of list.entries()) {
    if (r.position === i) continue;
    await tx.communityPinnedPost.update({
      where: { communityId_postId: { communityId, postId: r.postId } },
      data: { position: i },
    });
  }
  return list.map((r) => r.postId);
}

export interface PinResult {
  order: string[];
}

/**
 * Pin a top-level, live, public post of this community. Already pinned is a no-op that answers the current order.
 * The author hears once per post (not when a moderator pins their own, and not again after an unpin and a re-pin).
 */
export async function pinPost(args: {
  communityId: string;
  communityName: string;
  communitySlug: string;
  postId: string;
  actorId: string;
}): Promise<PinResult> {
  const outcome = await prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-pins:${args.communityId}`);
    // A comment is not an RMHark, a thread follow-up has a `threadRootId`, a held or removed post has `deletedAt`,
    // and a post whose own audience is narrower than the community would show a different thing to each reader.
    const post = await tx.rMHark.findFirst({
      where: {
        id: args.postId,
        communityId: args.communityId,
        threadRootId: null,
        deletedAt: null,
        audience: 'PUBLIC',
      },
      select: { id: true, userId: true },
    });
    if (!post) throw new PinError(404, 'not_found', 'Not found');

    const existing = await tx.communityPinnedPost.findMany({
      where: { communityId: args.communityId, ...LIVE },
      orderBy: { position: 'asc' },
      select: { postId: true },
    });
    const current = (Array.isArray(existing) ? existing : []).map((r) => r.postId);
    if (current.includes(post.id)) return { order: current, authorId: null as string | null };
    if (current.length >= PIN_LIMIT) throw new PinError(409, 'pin_limit', PIN_LIMIT_MESSAGE);

    await tx.communityPinnedPost.create({
      data: { communityId: args.communityId, postId: post.id, position: current.length, pinnedById: args.actorId },
    });
    await logModAction(tx, {
      communityId: args.communityId,
      actorId: args.actorId,
      action: 'post_pinned',
      targetUserId: post.userId,
      targetType: 'post',
      targetId: post.id,
    });
    return { order: [...current, post.id], authorId: post.userId as string | null };
  });

  if (outcome.authorId && outcome.authorId !== args.actorId) {
    await notifyAuthor({
      authorId: outcome.authorId,
      actorId: args.actorId,
      postId: args.postId,
      communityName: args.communityName,
      communitySlug: args.communitySlug,
    });
  }
  return { order: outcome.order };
}

/** "Moderators of X pinned your post", once per post: an unpin and a re-pin do not tell the author again. */
async function notifyAuthor(args: {
  authorId: string;
  actorId: string;
  postId: string;
  communityName: string;
  communitySlug: string;
}): Promise<void> {
  try {
    const before = await prisma.notification.findFirst({
      where: { userId: args.authorId, type: 'SYSTEM', entityType: PIN_NOTICE_ENTITY, entityId: args.postId },
      select: { id: true },
    });
    if (before) return;
    await createNotification({
      userId: args.authorId,
      type: 'SYSTEM',
      entityType: PIN_NOTICE_ENTITY,
      entityId: args.postId,
      preview: notice('community-pin', { community: args.communityName }),
      link: `/c/${args.communitySlug}`,
    });
  } catch (e) {
    console.error('[community-pins] author notice error:', e);
  }
}

/** Unpin. Silent for the author. Not pinned is a no-op. Later pins move up a place. */
export async function unpinPost(args: { communityId: string; postId: string; actorId: string }): Promise<PinResult> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-pins:${args.communityId}`);
    const row = await tx.communityPinnedPost.findUnique({
      where: { communityId_postId: { communityId: args.communityId, postId: args.postId } },
      select: { postId: true },
    });
    if (!row) {
      const rows = await tx.communityPinnedPost.findMany({
        where: { communityId: args.communityId },
        orderBy: { position: 'asc' },
        select: { postId: true },
      });
      return { order: (Array.isArray(rows) ? rows : []).map((r) => r.postId) };
    }
    const post = await tx.rMHark.findUnique({ where: { id: args.postId }, select: { userId: true } });
    await tx.communityPinnedPost.delete({
      where: { communityId_postId: { communityId: args.communityId, postId: args.postId } },
    });
    await logModAction(tx, {
      communityId: args.communityId,
      actorId: args.actorId,
      action: 'post_unpinned',
      targetUserId: post?.userId ?? null,
      targetType: 'post',
      targetId: args.postId,
    });
    return { order: await repack(tx, args.communityId) };
  });
}

/** Set the order. The list must hold exactly the posts pinned now, once each; anything else is a 409. */
export async function reorderPins(args: {
  communityId: string;
  postIds: readonly string[];
  actorId: string;
}): Promise<PinResult> {
  return prisma.$transaction(async (tx) => {
    await lockKey(tx, `community-pins:${args.communityId}`);
    const rows = await tx.communityPinnedPost.findMany({
      where: { communityId: args.communityId, ...LIVE },
      orderBy: { position: 'asc' },
      select: { postId: true },
    });
    const current = (Array.isArray(rows) ? rows : []).map((r) => r.postId);
    const wanted = [...args.postIds];
    const sameSet =
      wanted.length === current.length &&
      new Set(wanted).size === wanted.length &&
      wanted.every((id) => current.includes(id));
    if (!sameSet) throw new PinError(409, 'order_mismatch', 'The pinned posts changed. Reload and try again.');
    if (wanted.every((id, i) => id === current[i])) return { order: current };
    for (const [i, postId] of wanted.entries()) {
      await tx.communityPinnedPost.update({
        where: { communityId_postId: { communityId: args.communityId, postId } },
        data: { position: i },
      });
    }
    await logModAction(tx, {
      communityId: args.communityId,
      actorId: args.actorId,
      action: 'pins_reordered',
      targetType: 'post',
      detail: { count: wanted.length },
    });
    return { order: wanted };
  });
}
