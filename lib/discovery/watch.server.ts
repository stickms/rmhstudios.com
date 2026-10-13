/**
 * A7 · Watch anything. One table, three wired event points (new community
 * posts, build comments, market listings). Each hook starts with a single
 * indexed read of `watch(kind, targetId)`; when nobody watches, that is the
 * whole cost. Notifications are created in one batch per event.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getShopItem } from '@/lib/shop/catalog';
import type { WatchKind, WatchLevel } from './schema';

const MAX_WATCHERS_PER_EVENT = 500;

export async function getWatchLevel(
  userId: string,
  kind: WatchKind,
  targetId: string,
): Promise<WatchLevel> {
  const row = await prisma.watch.findUnique({
    where: { userId_kind_targetId: { userId, kind, targetId } },
    select: { level: true },
  });
  return row?.level === 'all' || row?.level === 'important' ? row.level : 'nothing';
}

export async function setWatchLevel(
  userId: string,
  kind: WatchKind,
  targetId: string,
  level: WatchLevel,
) {
  if (level === 'nothing') {
    await prisma.watch.deleteMany({ where: { userId, kind, targetId } });
    return { ok: true as const };
  }
  if (kind === 'community') {
    const c = await prisma.community.findUnique({
      where: { id: targetId },
      select: { isPrivate: true },
    });
    if (!c) return { ok: false as const, status: 404, error: 'Not found' };
    if (c.isPrivate) {
      const m = await prisma.communityMember.findFirst({
        where: { communityId: targetId, userId },
        select: { id: true },
      });
      if (!m) return { ok: false as const, status: 404, error: 'Not found' };
    }
  } else if (kind === 'build') {
    const b = await prisma.userBuild.findFirst({
      where: { id: targetId, visibility: 'PUBLIC' },
      select: { id: true },
    });
    if (!b) return { ok: false as const, status: 404, error: 'Not found' };
  } else if (!getShopItem(targetId)) {
    return { ok: false as const, status: 404, error: 'Not found' };
  }
  await prisma.watch.upsert({
    where: { userId_kind_targetId: { userId, kind, targetId } },
    create: { userId, kind, targetId, level },
    update: { level },
  });
  return { ok: true as const };
}

export interface WatchEvent {
  kind: WatchKind;
  targetId: string;
  actorId: string | null;
  /** "important" watchers only hear about these. */
  important: () => boolean | Promise<boolean>;
  preview: string;
  link: string;
}

/** Notify everyone watching the target at a matching level, minus blocks/mutes. */
export async function notifyWatchers(ev: WatchEvent): Promise<number> {
  const watchers = await prisma.watch.findMany({
    where: {
      kind: ev.kind,
      targetId: ev.targetId,
      ...(ev.actorId ? { userId: { not: ev.actorId } } : {}),
    },
    take: MAX_WATCHERS_PER_EVENT,
    select: { userId: true, level: true },
  });
  if (!watchers.length) return 0;
  const important = await ev.important();
  let ids = watchers
    .filter((w) => w.level === 'all' || (important && w.level === 'important'))
    .map((w) => w.userId);
  if (!ids.length) return 0;
  if (ev.actorId) {
    const [blocks, mutes] = await Promise.all([
      prisma.userBlock.findMany({
        where: {
          OR: [
            { blockerId: { in: ids }, blockedId: ev.actorId },
            { blockerId: ev.actorId, blockedId: { in: ids } },
          ],
        },
        select: { blockerId: true, blockedId: true },
      }),
      prisma.userMute.findMany({
        where: { muterId: { in: ids }, mutedId: ev.actorId },
        select: { muterId: true },
      }),
    ]);
    const skip = new Set([
      ...blocks.flatMap((b) => [b.blockerId, b.blockedId]),
      ...mutes.map((m) => m.muterId),
    ]);
    ids = ids.filter((id) => !skip.has(id));
  }
  for (const userId of ids) {
    await createNotification({
      userId,
      actorId: ev.actorId,
      type: 'SYSTEM',
      entityType: `watch-${ev.kind}`,
      entityId: ev.targetId,
      preview: ev.preview,
      link: ev.link,
      dedupeUnread: true,
    });
  }
  return ids.length;
}

/** Hook: a comment landed on a build. The build owner's own comments count as important. */
export async function watchBuildComment(
  buildId: string,
  actorId: string,
  text: string,
): Promise<void> {
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { userId: true, slug: true, title: true },
  });
  if (!build) return;
  await notifyWatchers({
    kind: 'build',
    targetId: buildId,
    actorId,
    important: () => actorId === build.userId,
    preview: `${build.title}: ${text.replace(/\s+/g, ' ').trim().slice(0, 120)}`,
    link: `/user-builds/${build.slug}`,
  });
}

/** Hook: a market listing was created. A new lowest price is the important case. */
export async function watchMarketListing(listing: {
  itemId: string;
  priceCoins: number;
  sellerId: string;
  id: string;
}): Promise<void> {
  const name = getShopItem(listing.itemId)?.name ?? 'an item';
  await notifyWatchers({
    kind: 'market',
    targetId: listing.itemId,
    actorId: listing.sellerId,
    important: async () => {
      const lowest = await prisma.marketListing.findFirst({
        where: { itemId: listing.itemId, status: 'ACTIVE', id: { not: listing.id } },
        orderBy: { priceCoins: 'asc' },
        select: { priceCoins: true },
      });
      return !lowest || listing.priceCoins < lowest.priceCoins;
    },
    preview: `New listing for ${name}: ${listing.priceCoins} coins`,
    link: '/market',
  });
}

/** Hook (post-created job): a new post in a community. Posts by mods/admins are important. */
export async function watchCommunityPost(post: {
  id: string;
  userId: string;
  communityId: string;
  content: string;
  handle: string | null;
}): Promise<void> {
  await notifyWatchers({
    kind: 'community',
    targetId: post.communityId,
    actorId: post.userId,
    important: async () => {
      const m = await prisma.communityMember.findFirst({
        where: {
          communityId: post.communityId,
          userId: post.userId,
          role: { in: ['MOD', 'ADMIN'] },
        },
        select: { id: true },
      });
      return !!m;
    },
    preview: post.content.replace(/\s+/g, ' ').trim().slice(0, 140) || 'New post',
    link: `/u/${post.handle ?? post.userId}/post/${post.id}`,
  });
}
