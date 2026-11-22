import { prisma } from '@/lib/prisma.server';
import { cached } from '@/lib/cached.server';
import { userNotHiddenWhere } from '@/lib/game/leaderboard-privacy';
import { leaderboardHiddenUserIds } from '@/lib/game/leaderboard-privacy.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { plausibleRun } from '@/lib/arcade/validate';
import { consumeAssistRun } from '@/lib/game/assist-run.server';
import {
  dailyMutator,
  findModifier,
  parseSeedKey,
  utcDayKey,
  isSeededGame,
  type SeededGameId,
} from '@/lib/arcade/seeded';

/** A daily attempt that has been open longer than this is not a real run. */
export const MAX_ATTEMPT_MS = 3 * 60 * 60 * 1000;

export interface BoardRow {
  rank: number;
  userId: string;
  score: number;
  user: ReturnType<typeof resolveUser>;
}

export async function board(
  kind: 'daily' | 'seed' | 'basket',
  gameId: string,
  seedKey: string,
  take: number,
): Promise<BoardRow[]> {
  return cached(`arcade:board:${kind}:${gameId}:${seedKey}`, 30_000, async () => {
    // Hidden members are left out before the cut; the hidden set is the same for every caller.
    const hidden = await leaderboardHiddenUserIds();
    const rows = await prisma.arcadeSeedRun.findMany({
      where: { kind, gameId, seedKey, score: { not: null }, ...userNotHiddenWhere(hidden) },
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

/**
 * An assisted run (P7) is stored, never ranked: `score` stays null, which every
 * board query filters out, and the real score is kept in `detail` so it still
 * shows in the member's own history. The claim is peeked, not consumed: the
 * results screen files the personal score and the seeded run, and whichever
 * lands second must see the same answer. The next run start rewrites the claim.
 */
export function assistedDetail(
  detail: Record<string, number> | undefined,
  score: number,
) {
  return { ...(detail ?? {}), assisted: true, assistedScore: score };
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
    const assisted = await consumeAssistRun(userId, g, { keepClaim: true });
    // First finish wins: only an unfinished row can be claimed.
    const claimed = await prisma.arcadeSeedRun.updateMany({
      where: { kind: 'daily', gameId: g, seedKey, userId, finishedAt: null },
      data: assisted
        ? { score: null, detail: assistedDetail(detail, score), finishedAt: new Date() }
        : { score, detail, finishedAt: new Date() },
    });
    return { ok: true, counted: claimed.count === 1 && !assisted, best: score };
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
  if (await consumeAssistRun(userId, g, { keepClaim: true })) {
    // Never replaces a ranked score; with none yet, the run is kept unranked.
    if (!existing) {
      await prisma.arcadeSeedRun.create({
        data: {
          kind: 'seed',
          gameId: g,
          seedKey,
          userId,
          score: null,
          detail: assistedDetail(detail, score),
          finishedAt: new Date(),
        },
      });
    }
    return { ok: true, counted: false, best: existing?.score ?? 0 };
  }
  if (existing && (existing.score ?? -1) >= score)
    return { ok: true, counted: false, best: existing.score ?? 0 };
  await prisma.arcadeSeedRun.upsert({
    where: { kind_gameId_seedKey_userId: { kind: 'seed', gameId: g, seedKey, userId } },
    create: { kind: 'seed', gameId: g, seedKey, userId, score, detail, finishedAt: new Date() },
    update: { score, detail, finishedAt: new Date() },
  });
  return { ok: true, counted: true, best: score };
}
