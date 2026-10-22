/**
 * A4 · Custom feeds. A feed is tags + people + keywords. Each source is read
 * through an existing index (post_hashtag, rmheet(userId, createdAt), and a
 * 14-day window for keywords), merged on the same (createdAt, id) keyset, and
 * only then hydrated — so paging is exact and no source scans the posts table.
 */
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import { getHiddenAuthorIdsStrict } from '@/lib/moderation.server';
import { getMutedWords, applyMutedWords } from '@/lib/feed/timeline';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { FeedItem } from '@/lib/feed-types';
import { MAX_FEEDS_PER_USER, type CustomFeedInput } from './schema';

const PAGE = 20;
const KEYWORD_WINDOW_MS = 14 * 86_400_000;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const feedSelect = {
  id: true,
  ownerId: true,
  name: true,
  description: true,
  tags: true,
  authorIds: true,
  keywords: true,
  isPublic: true,
  subscriberCount: true,
} as const;

export interface FeedSummary {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  keywords: string[];
  peopleCount: number;
  isPublic: boolean;
  subscriberCount: number;
  isOwner: boolean;
  subscribed: boolean;
}

function summary(
  f: Prisma.CustomFeedGetPayload<{ select: typeof feedSelect }>,
  viewerId: string | null,
  subscribed: boolean,
): FeedSummary {
  return {
    id: f.id,
    name: f.name,
    description: f.description,
    tags: f.tags,
    keywords: f.keywords,
    peopleCount: f.authorIds.length,
    isPublic: f.isPublic,
    subscriberCount: f.subscriberCount,
    isOwner: f.ownerId === viewerId,
    subscribed,
  };
}

export async function listFeeds(userId: string) {
  const [mine, subs, popular] = await Promise.all([
    prisma.customFeed.findMany({
      where: { ownerId: userId },
      orderBy: { createdAt: 'desc' },
      take: MAX_FEEDS_PER_USER,
      select: feedSelect,
    }),
    prisma.customFeedSubscription.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
      select: { feed: { select: feedSelect } },
    }),
    prisma.customFeed.findMany({
      where: { isPublic: true },
      orderBy: [{ subscriberCount: 'desc' }, { createdAt: 'desc' }],
      take: 12,
      select: feedSelect,
    }),
  ]);
  const subbed = new Set(subs.map((s) => s.feed.id));
  return {
    mine: mine.map((f) => summary(f, userId, subbed.has(f.id))),
    subscribed: subs
      .filter((s) => s.feed.ownerId !== userId)
      .map((s) => summary(s.feed, userId, true)),
    popular: popular
      .filter((f) => f.ownerId !== userId)
      .map((f) => summary(f, userId, subbed.has(f.id))),
  };
}

async function resolvePeople(people: string[]): Promise<string[]> {
  if (!people.length) return [];
  const clean = people.map((p) => p.replace(/^@/, ''));
  const rows = await prisma.user.findMany({
    where: { OR: [{ handle: { in: clean, mode: 'insensitive' } }, { id: { in: clean } }] },
    select: { id: true },
    take: 20,
  });
  return rows.map((r) => r.id);
}

async function normalize(input: CustomFeedInput) {
  const authorIds = await resolvePeople(input.people);
  if (!input.tags.length && !authorIds.length && !input.keywords.length) {
    return fail(400, 'Add at least one tag, person or keyword');
  }
  return {
    ok: true as const,
    data: {
      name: input.name,
      description: input.description || null,
      tags: [...new Set(input.tags)],
      authorIds,
      keywords: [...new Set(input.keywords.map((k) => k.toLowerCase()))],
      isPublic: input.isPublic,
    },
  };
}

export async function createFeed(userId: string, input: CustomFeedInput) {
  const n = await normalize(input);
  if (!n.ok) return n;
  if ((await prisma.customFeed.count({ where: { ownerId: userId } })) >= MAX_FEEDS_PER_USER) {
    return fail(409, `You can have at most ${MAX_FEEDS_PER_USER} feeds`);
  }
  const f = await prisma.customFeed.create({
    data: { ownerId: userId, ...n.data },
    select: feedSelect,
  });
  return { ok: true as const, feed: summary(f, userId, false) };
}

export async function updateFeed(userId: string, id: string, input: CustomFeedInput) {
  const n = await normalize(input);
  if (!n.ok) return n;
  const res = await prisma.customFeed.updateMany({ where: { id, ownerId: userId }, data: n.data });
  return res.count ? { ok: true as const } : fail(404, 'Not found');
}

export async function deleteFeed(userId: string, id: string) {
  const res = await prisma.customFeed.deleteMany({ where: { id, ownerId: userId } });
  return res.count ? { ok: true as const } : fail(404, 'Not found');
}

export async function setSubscribed(userId: string, id: string, on: boolean) {
  const feed = await prisma.customFeed.findUnique({
    where: { id },
    select: { ownerId: true, isPublic: true },
  });
  if (!feed || !feed.isPublic || feed.ownerId === userId) return fail(404, 'Not found');
  await prisma.$transaction(async (tx) => {
    if (on) {
      const r = await tx.customFeedSubscription.createMany({
        data: [{ feedId: id, userId }],
        skipDuplicates: true,
      });
      if (r.count)
        await tx.customFeed.update({ where: { id }, data: { subscriberCount: { increment: 1 } } });
    } else {
      const r = await tx.customFeedSubscription.deleteMany({ where: { feedId: id, userId } });
      if (r.count)
        await tx.customFeed.update({ where: { id }, data: { subscriberCount: { decrement: 1 } } });
    }
  });
  return { ok: true as const };
}

function parseCursor(cursor?: string): { at: Date; id: string } | null {
  const [iso, id] = (cursor ?? '').split('|');
  const at = iso ? new Date(iso) : null;
  return at && !Number.isNaN(at.getTime()) && id ? { at, id } : null;
}

export async function getFeedView(feedId: string, viewerId: string | null, cursor?: string) {
  const feed = await prisma.customFeed.findUnique({
    where: { id: feedId },
    select: { ...feedSelect, owner: { select: userDisplaySelect } },
  });
  if (!feed || (!feed.isPublic && feed.ownerId !== viewerId)) return null;

  const hidden = await getHiddenAuthorIdsStrict(viewerId);
  const cur = parseCursor(cursor);
  const base: Prisma.RMHarkWhereInput = {
    deletedAt: null,
    audience: 'PUBLIC',
    communityId: null,
    ...(hidden.length ? { userId: { notIn: hidden } } : {}),
    ...(cur
      ? { OR: [{ createdAt: { lt: cur.at } }, { createdAt: cur.at, id: { lt: cur.id } }] }
      : {}),
  };
  const sel = { id: true, createdAt: true } as const;
  const order = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];
  const take = PAGE + 1;
  const reads: Promise<{ id: string; createdAt: Date }[]>[] = [];
  if (feed.tags.length) {
    reads.push(
      prisma.rMHark.findMany({
        where: { ...base, hashtags: { some: { hashtag: { tag: { in: feed.tags } } } } },
        orderBy: order,
        take,
        select: sel,
      }),
    );
  }
  if (feed.authorIds.length) {
    const allowed = feed.authorIds.filter((a) => !hidden.includes(a));
    if (allowed.length)
      reads.push(
        prisma.rMHark.findMany({
          where: { ...base, userId: { in: allowed } },
          orderBy: order,
          take,
          select: sel,
        }),
      );
  }
  if (feed.keywords.length) {
    const recent = { createdAt: { gte: new Date(Date.now() - KEYWORD_WINDOW_MS) } };
    reads.push(
      prisma.rMHark.findMany({
        where: {
          AND: [
            base,
            recent,
            {
              OR: feed.keywords.map((k) => ({
                content: { contains: k, mode: 'insensitive' as const },
              })),
            },
          ],
        },
        orderBy: order,
        take,
        select: sel,
      }),
    );
  }
  const merged = new Map<string, { id: string; createdAt: Date }>();
  for (const r of (await Promise.all(reads)).flat()) merged.set(r.id, r);
  const ordered = [...merged.values()].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1),
  );
  const page = ordered.slice(0, PAGE);
  const last = page[page.length - 1];

  const rows = page.length
    ? await prisma.rMHark.findMany({
        where: { id: { in: page.map((p) => p.id) } },
        include: rmharkIncludeLite(viewerId),
      })
    : [];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const sorted = page.map((p) => byId.get(p.id)).filter((r): r is NonNullable<typeof r> => !!r);
  const muted = viewerId ? await getMutedWords(viewerId) : [];
  const items: FeedItem[] = applyMutedWords(
    await mapRmharksWithBoundedReactions(sorted, viewerId),
    muted,
  );

  const subscribed = viewerId
    ? !!(await prisma.customFeedSubscription.findUnique({
        where: { feedId_userId: { feedId, userId: viewerId } },
        select: { userId: true },
      }))
    : false;
  // Owners get their people back as @handles so the edit form round-trips them.
  const people =
    viewerId === feed.ownerId && feed.authorIds.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: feed.authorIds } },
            select: { id: true, handle: true },
          })
        ).map((u) => (u.handle ? `@${u.handle}` : u.id))
      : [];
  return {
    feed: {
      ...summary(feed, viewerId, subscribed),
      tags: feed.tags,
      keywords: feed.keywords,
      people,
      owner: resolveUser(feed.owner),
    },
    items,
    nextCursor: ordered.length > PAGE && last ? `${last.createdAt.toISOString()}|${last.id}` : null,
  };
}
