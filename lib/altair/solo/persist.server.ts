/**
 * Persist a VERIFIED single-player run. The only numbers written are the replay's. The run row's
 * status flip (submitted -> verified) is the idempotency key: it happens in the same transaction as the
 * coin credit and the leaderboard rows, and only one caller can win it.
 */
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { MAX_COINS } from '@/lib/altair/meta-guard';
import type { SoloResult } from './solo-run';
import { FIRST_CLEAR_BONUS } from './loadout';

export type SoloPersistOutcome =
  | { saved: true; coins: number; firstClearBonus: number }
  | { saved: false; reason: 'duplicate' };

export async function persistVerifiedSoloRun(runId: string, userId: string, run: SoloResult): Promise<SoloPersistOutcome> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userChipSelect });
  const baseName = (user?.name || 'Player').slice(0, 32);

  const saved = await prisma.$transaction(async (tx) => {
    // The status flip is the idempotency key: only the caller that wins it pays anything.
    const flipped = await tx.altairSoloRun.updateMany({
      where: { id: runId, userId, status: 'submitted' },
      data: { status: 'verified', verifiedAt: new Date(), steps: run.steps },
    });
    if (flipped.count === 0) return null;

    // The meta row exists from here on, and is locked so two victories of one class verified at the same
    // moment cannot both find "no first clear yet".
    // (Insert-if-absent in SQL: a Prisma upsert is not atomic and loses a race to a concurrent first save.)
    await tx.$executeRaw`INSERT INTO "altair_meta_progress" ("id", "userId", "updatedAt")
      VALUES (${randomUUID()}, ${userId}, NOW()) ON CONFLICT ("userId") DO NOTHING`;
    await tx.$queryRaw`SELECT "id" FROM "altair_meta_progress" WHERE "userId" = ${userId} FOR UPDATE`;
    const meta = await tx.altairMetaProgress.findUniqueOrThrow({
      where: { userId },
      select: { coins: true, classFirstClears: true },
    });

    // First clear: a verified victory with a class this account has never been PAID a first clear for.
    // The source of truth is the server's own run ledger (firstClearBonus > 0), not the client-saved
    // classFirstClears list, which the browser can edit and which was marked without ever paying.
    let firstClearBonus = 0;
    let cleared = (meta.classFirstClears ?? []) as string[];
    if (run.status === 'victory') {
      const row = await tx.altairSoloRun.findUniqueOrThrow({ where: { id: runId }, select: { classId: true } });
      const paid = await tx.altairSoloRun.findFirst({
        where: { userId, classId: row.classId, firstClearBonus: { gt: 0 } },
        select: { id: true },
      });
      if (!paid) firstClearBonus = FIRST_CLEAR_BONUS;
      if (!cleared.includes(row.classId)) cleared = [...cleared, row.classId];
    }
    const credited = run.finalCoins + firstClearBonus;
    const stored: SoloResult = firstClearBonus
      ? { ...run, coinBreakdown: { ...run.coinBreakdown, firstClearBonus } }
      : run;
    await tx.altairSoloRun.update({
      where: { id: runId },
      data: { result: stored as never, coinsCredited: credited, firstClearBonus },
    });
    await tx.altairMetaProgress.update({
      where: { userId },
      data: { coins: Math.min(MAX_COINS, meta.coins + credited), classFirstClears: cleared as never },
    });

    // Leaderboard totals (what /api/altair/score used to take from the client).
    const profile = await tx.altairPlayer.findUnique({ where: { userId } });
    if (profile) {
      await tx.altairPlayer.update({
        where: { id: profile.id },
        data: {
          bestTime: Math.max(profile.bestTime, run.gameTime),
          totalKills: { increment: run.kills },
          totalXP: { increment: run.xp },
          totalGold: { increment: run.finalCoins },
          totalTimeSurvived: { increment: run.gameTime },
          gamesPlayed: { increment: 1 },
          updatedAt: new Date(),
        },
      });
    } else {
      const taken = await tx.altairPlayer.findUnique({ where: { username: baseName }, select: { id: true } });
      await tx.altairPlayer.create({
        data: {
          userId,
          username: taken ? `${baseName.slice(0, 24)}-${userId.slice(-6)}` : baseName,
          bestTime: run.gameTime,
          totalKills: run.kills,
          totalXP: run.xp,
          totalGold: run.finalCoins,
          totalTimeSurvived: run.gameTime,
          gamesPlayed: 1,
        },
      });
    }
    return { firstClearBonus };
  });
  if (!saved) return { saved: false, reason: 'duplicate' };

  try {
    await recordGamePlay(userId);
  } catch (e) {
    console.error('altair solo quest error:', e);
  }
  return { saved: true, coins: run.finalCoins + saved.firstClearBonus, firstClearBonus: saved.firstClearBonus };
}
