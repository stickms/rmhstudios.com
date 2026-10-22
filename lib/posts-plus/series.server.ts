/**
 * X5 · Post series — server side.
 *
 * A series is a named, ordered list of one author's own PUBLIC posts. Membership
 * and order live in `post_series_item` (one row per post; a post is in at most
 * one series); `rmheet.seriesId` is a read-time hint so the feed can tell a post
 * is a series part without a second query. A series part is "live" when its post
 * is not deleted and not past its TTL - both rules are applied at read time.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { createNotification } from '@/lib/notifications.server';
import {
  userChipSelect,
  userDisplaySelect,
  resolveUser,
  type ResolvedUser,
} from '@/lib/user-display';
import { mapRmharksWithBoundedReactions, rmharkIncludeLite } from '@/lib/feed/map-feed-item.server';
import type { FeedItem } from '@/lib/feed-types';
import { DAY_MS, MAX_SERIES_PER_USER, MAX_SERIES_POSTS, type SeriesNav } from './constants';

export type SeriesResult<T extends object = object> =
  ({ ok: true } & T) | { ok: false; status: number; error: string };

const NAV_CACHE_MS = 30_000;
/** Followers notified per new part, capped so one author cannot fan out unbounded work. */
const NOTIFY_CAP = 500;
/** Adding an old post to a series is housekeeping, not a "new part". */
const NEW_PART_WINDOW_MS = 7 * DAY_MS;

function liveItemWhere(now: Date) {
  return {
    post: {
      deletedAt: null,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
  };
}

function bustNav(seriesId: string): void {
  apiCache.invalidatePrefix(`series:nav:${seriesId}`);
}

/* --------------------------------- CRUD ---------------------------------- */

export async function createSeries(
  userId: string,
  input: { title: string; description?: string },
): Promise<SeriesResult<{ id: string }>> {
  const count = await prisma.postSeries.count({ where: { userId } });
  if (count >= MAX_SERIES_PER_USER) {
    return { ok: false, status: 400, error: `You can have at most ${MAX_SERIES_PER_USER} series` };
  }
  const row = await prisma.postSeries.create({
    data: { userId, title: input.title, description: input.description || null },
    select: { id: true },
  });
  return { ok: true, id: row.id };
}

export async function updateSeries(
  userId: string,
  seriesId: string,
  input: { title?: string; description?: string },
): Promise<SeriesResult> {
  const res = await prisma.postSeries.updateMany({
    where: { id: seriesId, userId },
    data: {
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.description !== undefined ? { description: input.description || null } : {}),
    },
  });
  if (res.count === 0) return { ok: false, status: 404, error: 'Series not found' };
  bustNav(seriesId);
  return { ok: true };
}

export async function deleteSeries(userId: string, seriesId: string): Promise<SeriesResult> {
  const series = await prisma.postSeries.findFirst({
    where: { id: seriesId, userId },
    select: { id: true },
  });
  if (!series) return { ok: false, status: 404, error: 'Series not found' };
  // Items cascade with the series, but the hint column on the posts does not -
  // clear it by id (the post ids come from the indexed item table, so this never
  // scans rmheet).
  const members = await prisma.postSeriesItem.findMany({
    where: { seriesId },
    select: { postId: true },
    take: MAX_SERIES_POSTS + 50,
  });
  await prisma.$transaction([
    prisma.rMHark.updateMany({
      where: { id: { in: members.map((m) => m.postId) }, seriesId },
      data: { seriesId: null },
    }),
    prisma.postSeries.delete({ where: { id: seriesId } }),
  ]);
  bustNav(seriesId);
  return { ok: true };
}

export interface SeriesSummary {
  id: string;
  title: string;
  description: string | null;
  postCount: number;
  followCount: number;
  updatedAt: string;
}

export async function listMine(userId: string): Promise<SeriesSummary[]> {
  const rows = await prisma.postSeries.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    take: MAX_SERIES_PER_USER,
  });
  return rows.map(toSummary);
}

export async function listFollowed(
  userId: string,
): Promise<(SeriesSummary & { author: ResolvedUser })[]> {
  const rows = await prisma.postSeriesFollow.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: { series: { include: { user: { select: userDisplaySelect } } } },
  });
  return rows.map((r) => ({ ...toSummary(r.series), author: resolveUser(r.series.user) }));
}

function toSummary(r: {
  id: string;
  title: string;
  description: string | null;
  postCount: number;
  followCount: number;
  updatedAt: Date;
}): SeriesSummary {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    postCount: r.postCount,
    followCount: r.followCount,
    updatedAt: r.updatedAt.toISOString(),
  };
}

/* ------------------------------ membership ------------------------------- */

/** Why `postId` cannot join one of `userId`'s series, or null. */
async function addPostError(
  userId: string,
  post: {
    userId: string;
    audience: string;
    deletedAt: Date | null;
    seriesId: string | null;
  } | null,
  seriesId: string,
): Promise<string | null> {
  if (!post || post.userId !== userId || post.deletedAt) return 'Post not found';
  if (post.audience !== 'PUBLIC') return 'Only public posts can be part of a series';
  if (post.seriesId && post.seriesId !== seriesId) return 'That post is already in another series';
  return null;
}

/**
 * Validate a series for a post that is about to be created (used by POST
 * /api/rmharks before its transaction). Returns an error message or null.
 */
export async function seriesComposeError(
  userId: string,
  seriesId: string,
  audience: string | undefined,
): Promise<string | null> {
  const series = await prisma.postSeries.findFirst({
    where: { id: seriesId, userId },
    select: { postCount: true },
  });
  if (!series) return 'Series not found';
  if ((audience ?? 'PUBLIC') !== 'PUBLIC') return 'Only public posts can be part of a series';
  if (series.postCount >= MAX_SERIES_POSTS) return 'This series is full';
  return null;
}

/** Append a freshly-created post to a series, inside the creating transaction. */
export async function appendToSeriesTx(
  tx: Prisma.TransactionClient,
  seriesId: string,
  postId: string,
): Promise<void> {
  const last = await tx.postSeriesItem.aggregate({
    where: { seriesId },
    _max: { position: true },
  });
  await tx.postSeriesItem.create({
    data: { seriesId, postId, position: (last._max.position ?? 0) + 1 },
  });
  await tx.postSeries.update({ where: { id: seriesId }, data: { postCount: { increment: 1 } } });
  bustNav(seriesId);
}

export async function addPost(
  userId: string,
  seriesId: string,
  postId: string,
): Promise<SeriesResult> {
  const [series, post] = await Promise.all([
    prisma.postSeries.findFirst({
      where: { id: seriesId, userId },
      select: { id: true, postCount: true },
    }),
    prisma.rMHark.findUnique({
      where: { id: postId },
      select: { userId: true, audience: true, deletedAt: true, seriesId: true, createdAt: true },
    }),
  ]);
  if (!series) return { ok: false, status: 404, error: 'Series not found' };
  const err = await addPostError(userId, post, seriesId);
  if (err) return { ok: false, status: err === 'Post not found' ? 404 : 400, error: err };
  if (post!.seriesId === seriesId) return { ok: true };
  if (series.postCount >= MAX_SERIES_POSTS) {
    return { ok: false, status: 400, error: 'This series is full' };
  }
  try {
    await prisma.$transaction(async (tx) => {
      await appendToSeriesTx(tx, seriesId, postId);
      await tx.rMHark.update({ where: { id: postId }, data: { seriesId } });
    });
  } catch (e) {
    // Lost a race with another add of the same post.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')
      return { ok: true };
    throw e;
  }
  if (Date.now() - post!.createdAt.getTime() < NEW_PART_WINDOW_MS) {
    void notifySeriesFollowers(seriesId, postId, userId);
  }
  return { ok: true };
}

export async function removePost(
  userId: string,
  seriesId: string,
  postId: string,
): Promise<SeriesResult> {
  const series = await prisma.postSeries.findFirst({
    where: { id: seriesId, userId },
    select: { id: true },
  });
  if (!series) return { ok: false, status: 404, error: 'Series not found' };
  await prisma.$transaction(async (tx) => {
    const res = await tx.postSeriesItem.deleteMany({ where: { postId, seriesId } });
    if (res.count === 0) return;
    await tx.rMHark.updateMany({ where: { id: postId, seriesId }, data: { seriesId: null } });
    await tx.postSeries.updateMany({
      where: { id: seriesId, postCount: { gt: 0 } },
      data: { postCount: { decrement: 1 } },
    });
  });
  bustNav(seriesId);
  return { ok: true };
}

/** Swap a part with its neighbour. Positions are an ordering key, not a dense index. */
export async function movePost(
  userId: string,
  seriesId: string,
  postId: string,
  direction: 'up' | 'down',
): Promise<SeriesResult> {
  const series = await prisma.postSeries.findFirst({
    where: { id: seriesId, userId },
    select: { id: true },
  });
  if (!series) return { ok: false, status: 404, error: 'Series not found' };
  const me = await prisma.postSeriesItem.findFirst({
    where: { postId, seriesId },
    select: { position: true },
  });
  if (!me) return { ok: false, status: 404, error: 'Post is not in this series' };
  const neighbour = await prisma.postSeriesItem.findFirst({
    where: {
      seriesId,
      position: direction === 'up' ? { lt: me.position } : { gt: me.position },
    },
    orderBy: { position: direction === 'up' ? 'desc' : 'asc' },
    select: { postId: true, position: true },
  });
  if (!neighbour) return { ok: true };
  await prisma.$transaction([
    prisma.postSeriesItem.update({ where: { postId }, data: { position: neighbour.position } }),
    prisma.postSeriesItem.update({
      where: { postId: neighbour.postId },
      data: { position: me.position },
    }),
  ]);
  bustNav(seriesId);
  return { ok: true };
}

/* -------------------------------- following ------------------------------ */

export async function setFollow(
  userId: string,
  seriesId: string,
  follow: boolean,
): Promise<SeriesResult<{ following: boolean }>> {
  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    select: { userId: true },
  });
  if (!series) return { ok: false, status: 404, error: 'Series not found' };
  if (series.userId === userId) {
    return { ok: false, status: 400, error: 'You already own this series' };
  }
  if (follow) {
    const res = await prisma.postSeriesFollow.createMany({
      data: [{ seriesId, userId }],
      skipDuplicates: true,
    });
    if (res.count > 0) {
      await prisma.postSeries.update({
        where: { id: seriesId },
        data: { followCount: { increment: 1 } },
      });
    }
  } else {
    const res = await prisma.postSeriesFollow.deleteMany({ where: { seriesId, userId } });
    if (res.count > 0) {
      await prisma.postSeries.updateMany({
        where: { id: seriesId, followCount: { gt: 0 } },
        data: { followCount: { decrement: 1 } },
      });
    }
  }
  bustNav(seriesId);
  return { ok: true, following: follow };
}

/** Tell a series' followers about a new part. Best-effort and bounded. */
export async function notifySeriesFollowers(
  seriesId: string,
  postId: string,
  authorId: string,
): Promise<void> {
  try {
    const [series, followers, author] = await Promise.all([
      prisma.postSeries.findUnique({
        where: { id: seriesId },
        select: { title: true, postCount: true },
      }),
      prisma.postSeriesFollow.findMany({
        where: { seriesId },
        orderBy: { createdAt: 'asc' },
        take: NOTIFY_CAP,
        select: { userId: true },
      }),
      prisma.user.findUnique({ where: { id: authorId }, select: userChipSelect }),
    ]);
    if (!series || followers.length === 0) return;
    const link = `/u/${author?.handle ?? authorId}/post/${postId}`;
    const preview = `New part in "${series.title}"`.slice(0, 280);
    for (let i = 0; i < followers.length; i += 20) {
      await Promise.all(
        followers.slice(i, i + 20).map((f) =>
          createNotification({
            userId: f.userId,
            actorId: authorId,
            type: 'SYSTEM',
            entityType: 'series',
            entityId: seriesId,
            preview,
            link,
            groupKey: `series:${seriesId}`,
            dedupeUnread: true,
          }),
        ),
      );
    }
  } catch (e) {
    console.error('[series] follower notification failed:', (e as Error)?.message);
  }
}

/* ---------------------------------- reads -------------------------------- */

type LiveItem = { postId: string; position: number; handle: string | null };

async function liveItems(seriesId: string): Promise<LiveItem[]> {
  const key = `series:nav:${seriesId}`;
  const cached = apiCache.get<LiveItem[]>(key);
  if (cached) return cached;
  const rows = await prisma.postSeriesItem.findMany({
    where: { seriesId, ...liveItemWhere(new Date()) },
    orderBy: { position: 'asc' },
    take: MAX_SERIES_POSTS,
    select: {
      postId: true,
      position: true,
      post: { select: { user: { select: { handle: true } } } },
    },
  });
  const items = rows.map((r) => ({
    postId: r.postId,
    position: r.position,
    handle: r.post.user?.handle ?? null,
  }));
  apiCache.set(key, items, NAV_CACHE_MS);
  return items;
}

/** The "Part k of N" payload for one post, or null when it is not in a (live) series. */
export async function navForPost(
  postId: string,
  viewerId: string | null,
): Promise<SeriesNav | null> {
  const item = await prisma.postSeriesItem.findUnique({
    where: { postId },
    select: {
      seriesId: true,
      series: { select: { id: true, title: true, userId: true } },
    },
  });
  if (!item) return null;
  const items = await liveItems(item.seriesId);
  const index = items.findIndex((i) => i.postId === postId);
  if (index === -1) return null;
  const following = viewerId
    ? !!(await prisma.postSeriesFollow.findUnique({
        where: { seriesId_userId: { seriesId: item.seriesId, userId: viewerId } },
        select: { userId: true },
      }))
    : false;
  const ref = (i: LiveItem | undefined) => (i ? { id: i.postId, handle: i.handle } : null);
  return {
    series: {
      id: item.series.id,
      title: item.series.title,
      total: items.length,
      following,
      authorId: item.series.userId,
    },
    position: index + 1,
    prev: ref(items[index - 1]),
    next: ref(items[index + 1]),
  };
}

export interface SeriesView {
  series: {
    id: string;
    title: string;
    description: string | null;
    total: number;
    followCount: number;
    following: boolean;
    isOwner: boolean;
    author: ResolvedUser;
    updatedAt: string;
  };
  items: FeedItem[];
}

export async function getSeriesView(
  seriesId: string,
  viewerId: string | null,
): Promise<SeriesView | null> {
  const series = await prisma.postSeries.findUnique({
    where: { id: seriesId },
    include: { user: { select: userDisplaySelect } },
  });
  if (!series) return null;
  const rows = await prisma.postSeriesItem.findMany({
    where: { seriesId, ...liveItemWhere(new Date()) },
    orderBy: { position: 'asc' },
    take: MAX_SERIES_POSTS,
    select: { post: { include: rmharkIncludeLite(viewerId) } },
  });
  const items = await mapRmharksWithBoundedReactions(
    rows.map((r) => r.post),
    viewerId,
  );
  const following = viewerId
    ? !!(await prisma.postSeriesFollow.findUnique({
        where: { seriesId_userId: { seriesId, userId: viewerId } },
        select: { userId: true },
      }))
    : false;
  return {
    series: {
      id: series.id,
      title: series.title,
      description: series.description,
      total: items.length,
      followCount: series.followCount,
      following,
      isOwner: viewerId === series.userId,
      author: resolveUser(series.user),
      updatedAt: series.updatedAt.toISOString(),
    },
    items,
  };
}
