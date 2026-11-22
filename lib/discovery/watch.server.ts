/**
 * A7 · Watch anything. One table, three wired event points (new community
 * posts, build comments, market listings). Each hook starts with a single
 * indexed read of `watch(kind, targetId)`; when nobody watches, that is the
 * whole cost. Notifications are created in one batch per event.
 */
import { previewTextFor } from '@/lib/feed/content-warning';
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { getShopItem } from '@/lib/shop/catalog';
import type { WatchKind, WatchLevel } from './schema';
import { lowestCosmeticPrice } from '@/lib/listings/listings.server';

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

export const RELEASE_ENTITY = 'watch-build-release';

export interface WatchEvent {
  kind: WatchKind;
  targetId: string;
  actorId: string | null;
  /** "important" watchers only hear about these. */
  important: () => boolean | Promise<boolean>;
  preview: string;
  link: string;
  /** Members who hear about it without watching (a build's unlockers), before the block and mute filter. */
  alsoNotify?: () => Promise<string[]>;
  /** Of these recipients, the ones to leave out (already told about this exact event). Runs after the block and mute filter. */
  skip?: (userIds: string[]) => Promise<string[]>;
  /** Notification entity type; defaults to `watch-<kind>`. A distinct one keeps this event out of other events' unread merge. */
  entityType?: string;
  /** Collapse into the member's unread notice for the same entity (default true). */
  dedupe?: boolean;
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
  const extra = ev.alsoNotify ? await ev.alsoNotify() : [];
  if (!watchers.length && !extra.length) return 0;
  const important = await ev.important();
  let ids = [
    ...new Set([
      ...watchers
        .filter((w) => w.level === 'all' || (important && w.level === 'important'))
        .map((w) => w.userId),
      ...extra.filter((id) => id !== ev.actorId),
    ]),
  ].slice(0, MAX_WATCHERS_PER_EVENT);
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
  if (ev.skip && ids.length) {
    const dropped = new Set(await ev.skip(ids));
    ids = ids.filter((id) => !dropped.has(id));
  }
  for (const userId of ids) {
    await createNotification({
      userId,
      actorId: ev.actorId,
      type: 'SYSTEM',
      entityType: ev.entityType ?? `watch-${ev.kind}`,
      entityId: ev.targetId,
      preview: ev.preview,
      link: ev.link,
      dedupeUnread: ev.dedupe ?? true,
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
    link: `/builds/${build.slug}`,
  });
}

/**
 * Hook: a release of a PUBLIC build was published. A release is always important, so watchers at either level hear
 * it, and so do the members who unlocked the build. One notification each (blocks, mutes and the owner excluded, at
 * most 500). A member who already holds this exact notification is skipped, so deleting a release and publishing the
 * same version again does not tell them twice.
 */
export async function watchBuildRelease(
  buildId: string,
  actorId: string,
  preview: string,
): Promise<number> {
  const build = await prisma.userBuild.findUnique({
    where: { id: buildId },
    select: { slug: true, visibility: true },
  });
  if (!build || build.visibility !== 'PUBLIC') return 0;
  return notifyWatchers({
    kind: 'build',
    targetId: buildId,
    actorId,
    important: () => true,
    preview,
    link: `/builds/${build.slug}#releases`,
    // Its own entity type and no unread merge: a release is never swallowed by a comment notice or by another release.
    entityType: RELEASE_ENTITY,
    dedupe: false,
    alsoNotify: async () => {
      const unlocks = await prisma.buildUnlock.findMany({
        where: { buildId },
        take: MAX_WATCHERS_PER_EVENT,
        select: { userId: true },
      });
      return unlocks.map((u) => u.userId);
    },
    skip: async (userIds) => {
      const held = await prisma.notification.findMany({
        where: {
          userId: { in: userIds },
          type: 'SYSTEM',
          entityType: RELEASE_ENTITY,
          entityId: buildId,
          preview,
        },
        select: { userId: true },
      });
      return held.map((n) => n.userId);
    },
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
      const lowest = await lowestCosmeticPrice(listing.itemId, { excludeId: listing.id });
      return lowest == null || listing.priceCoins < lowest;
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
  /** The post's content warning reason (sprint 06 #16): the preview shows it instead of the text. */
  contentWarning?: string | null;
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
    preview: (previewTextFor(post) ?? '').replace(/\s+/g, ' ').trim().slice(0, 140) || 'New post',
    link: `/u/${post.handle ?? post.userId}/post/${post.id}`,
  });
}
