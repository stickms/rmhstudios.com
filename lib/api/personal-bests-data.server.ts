import { prisma } from '@/lib/prisma.server';
import { gameTitleOf } from '@/lib/webhooks/game-events';
import { encodePersonalBestCursor, type ApiPersonalBest } from '@/lib/api/personal-bests-serializers';

/**
 * The member's newest personal-best row per game (each row is a new best, so the
 * newest is the current one), ordered by game id. `since` keeps only games whose
 * current best was set at or after it. Reads `userId`'s rows only.
 */
export async function loadPersonalBests(
  userId: string,
  opts: {
    gameId?: string | undefined;
    since?: string | undefined;
    cursor: string | null;
    limit: number;
  },
): Promise<{
  data: ApiPersonalBest[];
  nextCursor: string | null;
}> {
  const rows = await prisma.gamePersonalBest.findMany({
    where: {
      userId,
      // One game never pages; otherwise resume after the cursor's game id.
      ...(opts.gameId
        ? {
            gameId: opts.gameId,
          }
        : opts.cursor
          ? {
              gameId: {
                gt: opts.cursor,
              },
            }
          : {}),
    },
    distinct: ['gameId'],
    orderBy: [
      {
        gameId: 'asc',
      },
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    select: {
      gameId: true,
      score: true,
      previous: true,
      createdAt: true,
    },
  });
  const since = opts.since ? new Date(opts.since) : null;
  const current = since ? rows.filter((r) => r.createdAt >= since) : rows;
  const hasMore = current.length > opts.limit;
  const pageRows = hasMore ? current.slice(0, opts.limit) : current;
  const last = pageRows[pageRows.length - 1];
  return {
    data: pageRows.map((r) => ({
      gameId: r.gameId,
      gameTitle: gameTitleOf(r.gameId),
      score: r.score,
      previousScore: r.previous,
      achievedAt: r.createdAt.toISOString(),
    })),
    nextCursor: hasMore && last ? encodePersonalBestCursor(last.gameId) : null,
  };
}
