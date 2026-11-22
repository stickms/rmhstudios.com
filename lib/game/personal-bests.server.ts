/**
 * Personal best history (sprint 05 #04) — the database half. `submitGameScore` calls
 * `recordPersonalBest` when a run is a first score or a new best; the endpoint reads, and clears,
 * the caller's own rows. Nothing here reads another member's history.
 */
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { PERSONAL_BEST_KEEP, type personalBestsSchema } from '@/lib/game/personal-bests-schema';
import type { z } from 'zod';

type Db = Pick<Prisma.TransactionClient, 'gamePersonalBest' | '$executeRaw'>;

export interface PersonalBestInput {
  userId: string;
  gameId: string;
  score: number;
  /** The best before this run; null for the first score. */
  previous: number | null;
  progress?: number | null;
}

/**
 * Append one record. The unique key (user, game, score) makes a retried submission a no-op, since a
 * score is a new best only once. When a row was written, one statement prunes everything beyond the
 * newest {@link PERSONAL_BEST_KEEP} for that member and game; a run that is not a record never
 * reaches this function, so ordinary submissions pay nothing.
 */
export async function recordPersonalBest(db: Db, input: PersonalBestInput): Promise<boolean> {
  const { count } = await db.gamePersonalBest.createMany({
    data: [
      {
        userId: input.userId,
        gameId: input.gameId,
        score: input.score,
        previous: input.previous,
        progress: input.progress ?? null,
      },
    ],
    skipDuplicates: true,
  });
  if (count === 0) return false;
  await db.$executeRaw`
    DELETE FROM "game_personal_best"
    WHERE "id" IN (
      SELECT "id" FROM "game_personal_best"
      WHERE "userId" = ${input.userId} AND "gameId" = ${input.gameId}
      ORDER BY "createdAt" DESC, "id" DESC
      OFFSET ${PERSONAL_BEST_KEEP}
    )`;
  return true;
}

type Listed = z.infer<typeof personalBestsSchema>['rows'];

/** The member's records in one game, newest first, at most {@link PERSONAL_BEST_KEEP}. */
export async function listPersonalBests(userId: string, gameId: string): Promise<Listed> {
  const rows = await prisma.gamePersonalBest.findMany({
    where: {
      userId,
      gameId,
    },
    orderBy: [
      {
        createdAt: 'desc',
      },
      {
        id: 'desc',
      },
    ],
    take: PERSONAL_BEST_KEEP,
  });
  return rows.map((r) => ({
    id: r.id.toString(),
    score: r.score,
    previous: r.previous,
    progress: r.progress,
    at: r.createdAt.toISOString(),
  }));
}

/** Delete the member's history in one game; returns how many rows went. The board is not touched. */
export async function clearPersonalBests(userId: string, gameId: string): Promise<number> {
  const { count } = await prisma.gamePersonalBest.deleteMany({
    where: {
      userId,
      gameId,
    },
  });
  return count;
}

/** Every record the member holds, for the account export. */
export async function exportPersonalBests(userId: string) {
  const rows = await prisma.gamePersonalBest.findMany({
    where: {
      userId,
    },
    orderBy: [
      {
        gameId: 'asc',
      },
      {
        createdAt: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });
  return rows.map((r) => ({
    gameId: r.gameId,
    score: r.score,
    previous: r.previous,
    progress: r.progress,
    createdAt: r.createdAt.toISOString(),
  }));
}
