/**
 * Community Hub discussions and the hub's read models. Plain text only (see
 * `hub-rules.ts`); counters are maintained in the same transaction as the rows they
 * count; see docs/superpowers/specs/2026-10-30-game-community-hub-design.md.
 */

import { prisma } from '@/lib/prisma.server';
import { listCuratedBuilds } from '@/lib/builds/curated';
import { userDisplaySelect, resolveUserDisplay } from '@/lib/user-display';
import { isTrackableTitle } from '@/lib/games/route-match';
import { getLibraryExtras } from '@/lib/games/detail.server';
import { notifyHubReply } from '@/lib/cards/notify.server';
import { listGuides, listReviews } from '@/lib/games/meta.server';
import {
  MAX_POSTS_PER_HOUR,
  MAX_REPLIES_SHOWN,
  MAX_THREADS_PER_DAY,
  PAGE_SIZE,
  snippet,
  validatePost,
  validateThread,
} from '@/lib/games/hub-rules';
import type { PersonRef } from '@/lib/games/community-types';
import type { HubData, ThreadPage, ThreadSummary } from '@/lib/games/hub-types';

export type HubErrorCode =
  | 'BAD_INPUT'
  | 'NOT_FOUND'
  | 'BANNED'
  | 'RATE_LIMITED'
  | 'LOCKED'
  | 'FORBIDDEN';

const STATUS: Record<HubErrorCode, number> = {
  BAD_INPUT: 400,
  NOT_FOUND: 404,
  BANNED: 403,
  RATE_LIMITED: 429,
  LOCKED: 409,
  FORBIDDEN: 403,
};

export class HubError extends Error {
  readonly status: number;
  constructor(readonly code: HubErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'HubError';
    this.status = STATUS[code];
  }
}

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

async function assertNotBanned(userId: string): Promise<void> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { bannedUntil: true } });
  if (u?.bannedUntil && u.bannedUntil.getTime() > Date.now()) throw new HubError('BANNED');
}

export async function createThread(input: {
  userId: string;
  gameId: string;
  title: string;
  body: string;
}): Promise<{ id: string }> {
  const v = validateThread(input);
  if (!v.ok) throw new HubError('BAD_INPUT');
  if (!isTrackableTitle(input.gameId)) throw new HubError('NOT_FOUND');
  await assertNotBanned(input.userId);
  const recent = await prisma.gameThread.count({
    where: { authorId: input.userId, createdAt: { gte: new Date(Date.now() - DAY_MS) } },
  });
  if (recent >= MAX_THREADS_PER_DAY) throw new HubError('RATE_LIMITED');
  const t = await prisma.gameThread.create({
    data: { gameId: input.gameId, authorId: input.userId, title: v.title, body: v.body },
    select: { id: true },
  });
  return { id: t.id };
}

export async function createPost(input: {
  userId: string;
  threadId: string;
  body: string;
}): Promise<{ id: string }> {
  const v = validatePost(input.body);
  if (!v.ok) throw new HubError('BAD_INPUT');
  await assertNotBanned(input.userId);
  const made = await prisma.$transaction(async (tx) => {
    const thread = await tx.gameThread.findUnique({
      where: { id: input.threadId },
      select: { id: true, locked: true, authorId: true, gameId: true, title: true },
    });
    if (!thread) throw new HubError('NOT_FOUND');
    if (thread.locked) throw new HubError('LOCKED');
    const recent = await tx.gameThreadPost.count({
      where: { authorId: input.userId, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (recent >= MAX_POSTS_PER_HOUR) throw new HubError('RATE_LIMITED');
    const post = await tx.gameThreadPost.create({
      data: { threadId: thread.id, authorId: input.userId, body: v.body },
      select: { id: true },
    });
    // The counters move with the row, in the same transaction.
    await tx.gameThread.update({
      where: { id: thread.id },
      data: { replyCount: { increment: 1 }, lastPostAt: new Date() },
    });
    return { id: post.id, thread };
  });
  // After the commit: tell the thread's author (never about their own reply).
  await notifyHubReply({
    threadAuthorId: made.thread.authorId,
    replierId: input.userId,
    gameId: made.thread.gameId,
    threadId: made.thread.id,
    threadTitle: made.thread.title,
  });
  return { id: made.id };
}

export async function deleteThread(input: {
  userId: string;
  isAdmin: boolean;
  threadId: string;
}): Promise<void> {
  const t = await prisma.gameThread.findUnique({
    where: { id: input.threadId },
    select: { authorId: true },
  });
  if (!t) throw new HubError('NOT_FOUND');
  if (t.authorId !== input.userId && !input.isAdmin) throw new HubError('FORBIDDEN');
  await prisma.gameThread.delete({ where: { id: input.threadId } });
}

export async function deletePost(input: {
  userId: string;
  isAdmin: boolean;
  postId: string;
}): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.gameThreadPost.findUnique({
      where: { id: input.postId },
      select: { authorId: true, threadId: true },
    });
    if (!p) throw new HubError('NOT_FOUND');
    if (p.authorId !== input.userId && !input.isAdmin) throw new HubError('FORBIDDEN');
    await tx.gameThreadPost.delete({ where: { id: input.postId } });
    // Never below zero, even if the counter had drifted.
    await tx.gameThread.updateMany({
      where: { id: p.threadId, replyCount: { gt: 0 } },
      data: { replyCount: { decrement: 1 } },
    });
  });
}

export async function moderateThread(input: {
  threadId: string;
  action: 'lock' | 'unlock' | 'pin' | 'unpin';
}): Promise<void> {
  const t = await prisma.gameThread.findUnique({ where: { id: input.threadId }, select: { id: true } });
  if (!t) throw new HubError('NOT_FOUND');
  const data =
    input.action === 'lock'
      ? { locked: true }
      : input.action === 'unlock'
        ? { locked: false }
        : input.action === 'pin'
          ? { pinned: true }
          : { pinned: false };
  await prisma.gameThread.update({ where: { id: input.threadId }, data });
}

type AuthorRow = Parameters<typeof resolveUserDisplay>[0] & { id: string; handle: string | null };

function person(u: AuthorRow): PersonRef {
  const d = resolveUserDisplay(u);
  return { userId: u.id, handle: u.handle, name: d.name ?? u.handle ?? 'Player', image: d.image ?? null };
}

/** The titles each of these members holds a badge for, i.e. whose emoticons they own. */
async function emoteTitlesFor(userIds: string[]): Promise<Record<string, string[]>> {
  if (userIds.length === 0) return {};
  const rows = await prisma.gameBadge.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, gameId: true },
  });
  const out: Record<string, Set<string>> = {};
  for (const r of rows) (out[r.userId] ??= new Set()).add(r.gameId);
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, [...v].sort()]));
}

export async function getHub(
  viewer: { id: string | null; isAdmin: boolean },
  gameId: string,
  page: number,
): Promise<HubData | null> {
  const title = listCuratedBuilds().find((b) => b.id === gameId);
  if (!title || !isTrackableTitle(gameId)) return null;
  const skip = Math.max(0, page - 1) * PAGE_SIZE;

  const [rows, extras, guides, reviews, onSale, mine] = await Promise.all([
    prisma.gameThread.findMany({
      where: { gameId },
      orderBy: [{ pinned: 'desc' }, { lastPostAt: 'desc' }],
      skip,
      take: PAGE_SIZE + 1,
      select: {
        id: true,
        title: true,
        body: true,
        createdAt: true,
        lastPostAt: true,
        replyCount: true,
        locked: true,
        pinned: true,
        author: { select: userDisplaySelect },
      },
    }),
    getLibraryExtras(viewer.id, gameId),
    listGuides(gameId, viewer.id),
    listReviews(gameId, viewer.id, 'recent'),
    prisma.cardListing.count({
      where: {
        gameId,
        status: 'ACTIVE',
        ...(viewer.id ? { sellerId: { not: viewer.id } } : {}),
      },
    }),
    viewer.id ? emoteTitlesFor([viewer.id]) : Promise.resolve({} as Record<string, string[]>),
  ]);

  const threads: ThreadSummary[] = rows.slice(0, PAGE_SIZE).map((r) => ({
    id: r.id,
    title: r.title,
    snippet: snippet(r.body, 140),
    author: person(r.author as AuthorRow),
    createdAt: r.createdAt.toISOString(),
    lastPostAt: r.lastPostAt.toISOString(),
    replyCount: r.replyCount,
    locked: r.locked,
    pinned: r.pinned,
  }));

  return {
    gameId,
    title: title.title,
    hue: title.hue,
    image: title.thumbnailUrl,
    playHref: title.href,
    signedIn: !!viewer.id,
    isAdmin: viewer.isAdmin,
    threads,
    hasMore: rows.length > PAGE_SIZE,
    page: Math.max(1, page),
    friends: extras.friends,
    topPlayers: extras.topPlayers,
    communities: extras.communities,
    guides: guides.slice(0, 5),
    reviews: reviews.slice(0, 3),
    cardsOnSale: onSale,
    myEmoteTitles: viewer.id ? (mine[viewer.id] ?? []) : [],
  };
}

export async function getThreadPage(
  viewer: { id: string | null; isAdmin: boolean },
  gameId: string,
  threadId: string,
): Promise<ThreadPage | null> {
  const title = listCuratedBuilds().find((b) => b.id === gameId);
  if (!title) return null;
  const t = await prisma.gameThread.findUnique({
    where: { id: threadId },
    select: {
      id: true,
      gameId: true,
      title: true,
      body: true,
      createdAt: true,
      locked: true,
      pinned: true,
      author: { select: userDisplaySelect },
      posts: {
        orderBy: { createdAt: 'asc' },
        take: MAX_REPLIES_SHOWN,
        select: { id: true, body: true, createdAt: true, authorId: true, author: { select: userDisplaySelect } },
      },
    },
  });
  if (!t || t.gameId !== gameId) return null;
  const author = person(t.author as AuthorRow);
  const ids = [...new Set([author.userId, ...t.posts.map((p) => p.authorId), ...(viewer.id ? [viewer.id] : [])])];
  const emotes = await emoteTitlesFor(ids);
  return {
    gameId,
    gameTitle: title.title,
    thread: {
      id: t.id,
      title: t.title,
      body: t.body,
      createdAt: t.createdAt.toISOString(),
      locked: t.locked,
      pinned: t.pinned,
      author,
      canDelete: viewer.isAdmin || viewer.id === author.userId,
    },
    posts: t.posts.map((p) => ({
      id: p.id,
      body: p.body,
      createdAt: p.createdAt.toISOString(),
      author: person(p.author as AuthorRow),
      canDelete: viewer.isAdmin || viewer.id === p.authorId,
    })),
    signedIn: !!viewer.id,
    isAdmin: viewer.isAdmin,
    authorEmotes: emotes,
    myEmoteTitles: viewer.id ? (emotes[viewer.id] ?? []) : [],
  };
}
