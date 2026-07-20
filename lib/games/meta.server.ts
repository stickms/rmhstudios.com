/**
 * Game hubs — server logic (§6). Ratings/reviews (with helpful votes) and
 * player guides (markdown + revisions). Aggregate ratings are cached.
 *
 * Play-gating (review only after a recorded play) is a follow-up: the ~20
 * games use heterogeneous player models, so a generic gate needs
 * reportGameResult adoption. v1 allows one review per signed-in user per game.
 */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { games } from '@/lib/games';
import { resolveUser, userDisplaySelect } from '@/lib/user-display';
import type { RatingAgg, ReviewView, GuideSummary } from '@/lib/games/reviews';

export class GameMetaError extends Error {}

export function isValidGame(gameId: string): boolean {
  return games.some((g) => g.id === gameId);
}

const aggKey = (gameId: string) => `game-rating:${gameId}`;

export async function getRatingAgg(gameId: string): Promise<RatingAgg> {
  const cached = apiCache.get<RatingAgg>(aggKey(gameId));
  if (cached) return cached;
  const res = await prisma.gameReview.aggregate({
    where: { gameId },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const agg: RatingAgg = {
    average: res._avg.stars ? Math.round(res._avg.stars * 10) / 10 : 0,
    count: res._count._all,
  };
  apiCache.set(aggKey(gameId), agg, 60_000);
  return agg;
}

/** Ratings for many games at once (games directory badges). */
export async function getRatingAggs(gameIds: string[]): Promise<Record<string, RatingAgg>> {
  const rows = await prisma.gameReview.groupBy({
    by: ['gameId'],
    where: { gameId: { in: gameIds } },
    _avg: { stars: true },
    _count: { _all: true },
  });
  const out: Record<string, RatingAgg> = {};
  for (const r of rows) {
    out[r.gameId] = {
      average: r._avg.stars ? Math.round(r._avg.stars * 10) / 10 : 0,
      count: r._count._all,
    };
  }
  return out;
}

export async function listReviews(
  gameId: string,
  viewerId: string | null,
  sort: 'helpful' | 'recent' = 'helpful',
): Promise<ReviewView[]> {
  const reviews = await prisma.gameReview.findMany({
    where: { gameId },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true,
      userId: true,
      stars: true,
      body: true,
      createdAt: true,
      updatedAt: true,
      user: { select: userDisplaySelect },
      votes: { select: { userId: true, helpful: true } },
    },
  });
  const mapped = reviews.map((r): ReviewView => {
    const helpfulCount = r.votes.filter((v) => v.helpful).length;
    const author = resolveUser(r.user);
    return {
      id: r.id,
      userId: r.userId,
      stars: r.stars,
      body: r.body,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
      helpfulCount,
      author: { name: author.name, handle: author.handle, image: author.image },
      myVote: viewerId ? (r.votes.find((v) => v.userId === viewerId)?.helpful ?? null) : null,
      isMine: viewerId === r.userId,
    };
  });
  if (sort === 'helpful') mapped.sort((a, b) => b.helpfulCount - a.helpfulCount);
  return mapped;
}

export async function upsertReview(
  userId: string,
  gameId: string,
  data: { stars: number; body?: string | null },
): Promise<void> {
  if (!isValidGame(gameId)) throw new GameMetaError('UNKNOWN_GAME');
  await prisma.gameReview.upsert({
    where: { userId_gameId: { userId, gameId } },
    create: { userId, gameId, stars: data.stars, body: data.body ?? null },
    update: { stars: data.stars, body: data.body ?? null },
  });
  apiCache.invalidate(aggKey(gameId));
}

export async function deleteReview(userId: string, gameId: string): Promise<void> {
  await prisma.gameReview.deleteMany({ where: { userId, gameId } });
  apiCache.invalidate(aggKey(gameId));
}

export async function voteReview(userId: string, reviewId: string, helpful: boolean): Promise<void> {
  const review = await prisma.gameReview.findUnique({ where: { id: reviewId }, select: { userId: true } });
  if (!review) throw new GameMetaError('NOT_FOUND');
  if (review.userId === userId) throw new GameMetaError('OWN_REVIEW');
  await prisma.gameReviewVote.upsert({
    where: { reviewId_userId: { reviewId, userId } },
    create: { reviewId, userId, helpful },
    update: { helpful },
  });
}

export async function unvoteReview(userId: string, reviewId: string): Promise<void> {
  await prisma.gameReviewVote.deleteMany({ where: { reviewId, userId } });
}

// ── Guides ──────────────────────────────────────────────────────────────────

export async function listGuides(gameId: string, viewerId: string | null): Promise<GuideSummary[]> {
  const guides = await prisma.gameGuide.findMany({
    where: { gameId, OR: [{ published: true }, ...(viewerId ? [{ authorId: viewerId }] : [])] },
    orderBy: { updatedAt: 'desc' },
    take: 100,
    select: {
      id: true,
      title: true,
      published: true,
      updatedAt: true,
      author: { select: userDisplaySelect },
    },
  });
  return guides.map((g) => {
    const a = resolveUser(g.author);
    return {
      id: g.id,
      title: g.title,
      published: g.published,
      updatedAt: g.updatedAt.toISOString(),
      author: { name: a.name, handle: a.handle },
    };
  });
}

export async function getGuide(id: string, viewerId: string | null) {
  const guide = await prisma.gameGuide.findUnique({
    where: { id },
    select: {
      id: true,
      gameId: true,
      authorId: true,
      title: true,
      body: true,
      published: true,
      updatedAt: true,
      author: { select: userDisplaySelect },
    },
  });
  if (!guide) return null;
  if (!guide.published && guide.authorId !== viewerId) return null;
  const a = resolveUser(guide.author);
  return {
    id: guide.id,
    gameId: guide.gameId,
    authorId: guide.authorId,
    title: guide.title,
    body: guide.body,
    published: guide.published,
    updatedAt: guide.updatedAt.toISOString(),
    isAuthor: viewerId === guide.authorId,
    author: { name: a.name, handle: a.handle, image: a.image },
  };
}

export async function createGuide(
  authorId: string,
  data: { gameId: string; title: string; body: string },
): Promise<string> {
  if (!isValidGame(data.gameId)) throw new GameMetaError('UNKNOWN_GAME');
  const guide = await prisma.gameGuide.create({
    data: { authorId, gameId: data.gameId, title: data.title, body: data.body },
    select: { id: true },
  });
  return guide.id;
}

const MAX_REVISIONS = 50;

export async function updateGuide(
  authorId: string,
  id: string,
  data: { title?: string; body?: string; note?: string },
): Promise<void> {
  const guide = await prisma.gameGuide.findUnique({ where: { id }, select: { authorId: true, body: true } });
  if (!guide) throw new GameMetaError('NOT_FOUND');
  if (guide.authorId !== authorId) throw new GameMetaError('FORBIDDEN');

  await prisma.$transaction(async (tx) => {
    // On a changed body, snapshot the previous revision (bounded to MAX_REVISIONS).
    if (data.body !== undefined && data.body !== guide.body) {
      await tx.gameGuideRevision.create({ data: { guideId: id, body: guide.body, note: data.note ?? null } });
      const count = await tx.gameGuideRevision.count({ where: { guideId: id } });
      if (count > MAX_REVISIONS) {
        const oldest = await tx.gameGuideRevision.findMany({
          where: { guideId: id },
          orderBy: { createdAt: 'asc' },
          take: count - MAX_REVISIONS,
          select: { id: true },
        });
        await tx.gameGuideRevision.deleteMany({ where: { id: { in: oldest.map((o) => o.id) } } });
      }
    }
    await tx.gameGuide.update({
      where: { id },
      data: {
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.body !== undefined ? { body: data.body } : {}),
      },
    });
  });
}

export async function deleteGuide(authorId: string, id: string): Promise<void> {
  const res = await prisma.gameGuide.deleteMany({ where: { id, authorId } });
  if (res.count === 0) throw new GameMetaError('NOT_FOUND');
}

export async function publishGuide(authorId: string, id: string, published: boolean): Promise<void> {
  const res = await prisma.gameGuide.updateMany({ where: { id, authorId }, data: { published } });
  if (res.count === 0) throw new GameMetaError('NOT_FOUND');
}
