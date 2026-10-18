import { prisma } from '@/lib/prisma.server';
import { plausibleRun } from '@/lib/arcade/validate';
import { utcDayKey } from '@/lib/arcade/seeded';
import { BASKET_GAME, basketFor } from '@/lib/arcade/basket';
import { MAX_ATTEMPT_MS, board } from '@/lib/arcade/runs.server';

const where = (userId: string, day: string) => ({
  kind_gameId_seedKey_userId: { kind: 'basket', gameId: BASKET_GAME, seedKey: day, userId },
});

export const getBasketBoard = (day: string) => board('basket', BASKET_GAME, day, 25);

export const getMyBasket = (userId: string, day: string) =>
  prisma.arcadeSeedRun.findUnique({
    where: where(userId, day),
    select: { score: true, detail: true, startedAt: true, finishedAt: true },
  });

/** Claim today's one counted attempt. `counted: false` = already used (practice run). */
export async function startBasket(userId: string): Promise<{ counted: boolean }> {
  try {
    await prisma.arcadeSeedRun.create({
      data: { kind: 'basket', gameId: BASKET_GAME, seedKey: utcDayKey(), userId },
    });
    return { counted: true };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { counted: false };
    throw e;
  }
}

export type FinishResult =
  { ok: true; counted: boolean } | { ok: false; status: number; error: string };

/** First finish wins; the score must be reachable for the sorted count and the run's elapsed time. */
export async function finishBasket(
  userId: string,
  score: number,
  detail: Record<string, number>,
): Promise<FinishResult> {
  const day = utcDayKey();
  const row = await getMyBasket(userId, day);
  if (!row) return { ok: false, status: 400, error: 'No attempt was started today' };
  if (row.finishedAt) return { ok: true, counted: false };
  const elapsed = Date.now() - row.startedAt.getTime();
  if (elapsed > MAX_ATTEMPT_MS || !plausibleRun('laundry-sort', score, elapsed, detail)) {
    return { ok: false, status: 400, error: 'Implausible result' };
  }
  const claimed = await prisma.arcadeSeedRun.updateMany({
    where: { kind: 'basket', gameId: BASKET_GAME, seedKey: day, userId, finishedAt: null },
    data: { score, detail, finishedAt: new Date() },
  });
  return { ok: true, counted: claimed.count === 1 };
}

export { basketFor };
