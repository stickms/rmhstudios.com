import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { plausibleRun } from '@/lib/arcade/validate';
import {
  dailyMutator,
  findModifier,
  parseSeedKey,
  utcDayKey,
  isSeededGame,
  type SeededGameId,
} from '@/lib/arcade/seeded';

/** A daily attempt that has been open longer than this is not a real run. */
const MAX_ATTEMPT_MS = 3 * 60 * 60 * 1000;

export interface BoardRow {
  rank: number;
  userId: string;
  score: number;
  user: ReturnType<typeof resolveUser>;
}

async function board(
  kind: 'daily' | 'seed',
  gameId: string,
  seedKey: string,
  take: number,
): Promise<BoardRow[]> {
  return cached(`arcade:board:${kind}:${gameId}:${seedKey}`, 30_000, async () => {
    const rows = await prisma.arcadeSeedRun.findMany({
      where: { kind, gameId, seedKey, score: { not: null } },
      orderBy: [{ score: 'desc' }, { finishedAt: 'asc' }],
      take,
      select: { userId: true, score: true, user: { select: userDisplaySelect } },
    });
    return rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      score: r.score ?? 0,
      user: resolveUser(r.user),
    }));
  });
}

export const getDailyBoard = (day: string, gameId: string) => board('daily', gameId, day, 25);
export const getSeedBoard = (gameId: string, seedKey: string) => board('seed', gameId, seedKey, 10);

/** The caller's attempt for today, if they already started one. */
export async function getMyDaily(userId: string, day: string, gameId: string) {
  return prisma.arcadeSeedRun.findUnique({
    where: { kind_gameId_seedKey_userId: { kind: 'daily', gameId, seedKey: day, userId } },
    select: { score: true, startedAt: true, finishedAt: true },
  });
}

/** Claim today's one counted attempt. `counted: false` = already used. */
export async function startDaily(userId: string): Promise<{ counted: boolean }> {
  const { day, gameId } = dailyMutator(utcDayKey());
  try {
    await prisma.arcadeSeedRun.create({ data: { kind: 'daily', gameId, seedKey: day, userId } });
    return { counted: true };
  } catch (e) {
    if ((e as { code?: string }).code === 'P2002') return { counted: false };
    throw e;
  }
}

export type SubmitRunResult =
  { ok: true; counted: boolean; best?: number } | { ok: false; status: number; error: string };

export async function submitRun(input: {
  userId: string;
  kind: 'daily' | 'seed';
  gameId: string;
  seedKey: string;
  score: number;
  detail?: Record<string, number>;
}): Promise<SubmitRunResult> {
  const { userId, kind, gameId, seedKey, score, detail } = input;
  if (!isSeededGame(gameId)) return { ok: false, status: 404, error: 'Unknown game' };
  const g: SeededGameId = gameId;

  if (kind === 'daily') {
    const today = dailyMutator(utcDayKey());
    if (seedKey !== today.day || g !== today.gameId) {
      return { ok: false, status: 400, error: "Not today's challenge" };
    }
    const row = await getMyDaily(userId, seedKey, g);
    if (!row) return { ok: false, status: 400, error: 'No attempt was started' };
    if (row.finishedAt) return { ok: true, counted: false };
    const elapsed = Date.now() - row.startedAt.getTime();
    if (elapsed > MAX_ATTEMPT_MS || !plausibleRun(g, score, elapsed, detail)) {
      return { ok: false, status: 400, error: 'Implausible result' };
    }
    // First finish wins: only an unfinished row can be claimed.
    const claimed = await prisma.arcadeSeedRun.updateMany({
      where: { kind: 'daily', gameId: g, seedKey, userId, finishedAt: null },
      data: { score, detail, finishedAt: new Date() },
    });
    return { ok: true, counted: claimed.count === 1, best: score };
  }

  const parsed = parseSeedKey(seedKey);
  if (!parsed || !findModifier(g, parsed.variant)) {
    return { ok: false, status: 400, error: 'Bad seed' };
  }
  // A shared-seed submit is a one-off after the run, so there is no start row:
  // the ceiling check is the guard, with the floor duration waived.
  if (!plausibleRun(g, score, Number.MAX_SAFE_INTEGER, detail)) {
    return { ok: false, status: 400, error: 'Implausible result' };
  }
  const existing = await prisma.arcadeSeedRun.findUnique({
    where: { kind_gameId_seedKey_userId: { kind: 'seed', gameId: g, seedKey, userId } },
    select: { score: true },
  });
  if (existing && (existing.score ?? -1) >= score)
    return { ok: true, counted: false, best: existing.score ?? 0 };
  await prisma.arcadeSeedRun.upsert({
    where: { kind_gameId_seedKey_userId: { kind: 'seed', gameId: g, seedKey, userId } },
    create: { kind: 'seed', gameId: g, seedKey, userId, score, detail, finishedAt: new Date() },
    update: { score, detail, finishedAt: new Date() },
  });
  return { ok: true, counted: true, best: score };
}
