/**
 * A4 · Custom feeds — the /feeds surface over the one Feed model
 * (`CustomFeed`, `lib/feeds/kinds.ts`). A custom feed is tags + people +
 * keywords; lists, saved searches and keyword alerts are Feeds of other kinds
 * and are read here too (`getFeedView` serves `/feeds/$id` for every kind).
 * The post reader itself is `readFeedPage` in `lib/feeds/feeds.server.ts`,
 * shared with the list timeline.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { rmharkIncludeLite, mapRmharksWithBoundedReactions } from '@/lib/feed/map-feed-item.server';
import {
  feedMemberIds,
  readFeedPage,
  readableByOthers,
  setFeedPeople,
  toFeedSource,
} from '@/lib/feeds/feeds.server';
import type { FeedKind } from '@/lib/feeds/kinds';
import { getMutedWords, applyMutedWords } from '@/lib/feed/timeline';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { FeedItem } from '@/lib/feed-types';
import { MAX_FEEDS_PER_USER, type CustomFeedInput } from './schema';

const PAGE = 20;

type Fail = { ok: false; status: number; error: string };
const fail = (status: number, error: string): Fail => ({ ok: false, status, error });

const feedSelect = {
  id: true,
  ownerId: true,
  kind: true,
  name: true,
  description: true,
  tags: true,
  keywords: true,
  query: true,
  isPublic: true,
  visibility: true,
  subscriberCount: true,
  _count: { select: { members: true } },
} as const;

export interface FeedSummary {
  id: string;
  kind: FeedKind;
  /** A saved search's query or a keyword alert's terms; null for other kinds. */
  query: string | null;
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
    kind: f.kind as FeedKind,
    query: f.query,
    name: f.name,
    description: f.description,
    tags: f.tags ?? [],
    keywords: f.keywords ?? [],
    peopleCount: f._count.members,
    isPublic: f.isPublic,
    subscriberCount: f.subscriberCount,
    isOwner: f.ownerId === viewerId,
    subscribed,
  };
}

export async function listFeeds(userId: string) {
  const [mine, subs, popular] = await Promise.all([
    prisma.customFeed.findMany({
      where: { ownerId: userId, kind: 'feed' },
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
      keywords: [...new Set(input.keywords.map((k) => k.toLowerCase()))],
      isPublic: input.isPublic,
      visibility: input.isPublic ? ('PUBLIC' as const) : ('PRIVATE' as const),
    },
    people: authorIds,
  };
}

export async function createFeed(userId: string, input: CustomFeedInput) {
  const n = await normalize(input);
  if (!n.ok) return n;
  const count = await prisma.customFeed.count({ where: { ownerId: userId, kind: 'feed' } });
  if (count >= MAX_FEEDS_PER_USER) {
    return fail(409, `You can have at most ${MAX_FEEDS_PER_USER} feeds`);
  }
  const created = await prisma.customFeed.create({
    data: { ownerId: userId, kind: 'feed', ...n.data },
    select: { id: true },
  });
  if (n.people.length) await setFeedPeople(created.id, n.people);
  const f = await prisma.customFeed.findUniqueOrThrow({
    where: { id: created.id },
    select: feedSelect,
  });
  return { ok: true as const, feed: summary(f, userId, false) };
}

export async function updateFeed(userId: string, id: string, input: CustomFeedInput) {
  const n = await normalize(input);
  if (!n.ok) return n;
  // Only a custom feed is edited by this form; the other kinds have their own.
  const res = await prisma.customFeed.updateMany({
    where: { id, ownerId: userId, kind: 'feed' },
    data: n.data,
  });
  if (!res.count) return fail(404, 'Not found');
  await setFeedPeople(id, n.people);
  return { ok: true as const };
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
  // Subscribing is to published feeds only; a link-shared one is read, not followed.
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

export async function getFeedView(feedId: string, viewerId: string | null, cursor?: string) {
  const feed = await prisma.customFeed.findUnique({
    where: { id: feedId },
    select: { ...feedSelect, owner: { select: userDisplaySelect } },
  });
  if (!feed || (feed.ownerId !== viewerId && !readableByOthers(feed))) return null;

  const { page, nextCursor } = await readFeedPage(toFeedSource(feed), viewerId, {
    cursor,
    pageSize: PAGE,
  });
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
  const memberIds = viewerId === feed.ownerId ? await feedMemberIds(feedId) : [];
  const people = memberIds.length
    ? (
        await prisma.user.findMany({
          where: { id: { in: memberIds } },
          select: { id: true, handle: true },
        })
      ).map((u) => (u.handle ? `@${u.handle}` : u.id))
    : [];
  return {
    feed: {
      ...summary(feed, viewerId, subscribed),
      people,
      owner: resolveUser(feed.owner),
    },
    items,
    nextCursor,
  };
}
