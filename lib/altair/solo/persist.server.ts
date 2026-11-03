/**
 * Persist a VERIFIED single-player run. The only numbers written are the replay's. The run row's
 * status flip (submitted -> verified) is the idempotency key: it happens in the same transaction as the
 * coin credit and the leaderboard rows, and only one caller can win it.
 */
import { prisma } from '@/lib/prisma.server';
import { userChipSelect } from '@/lib/user-display';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { MAX_COINS } from '@/lib/altair/meta-guard';
import type { SoloResult } from './solo-run';

export type SoloPersistOutcome = { saved: true; coins: number } | { saved: false; reason: 'duplicate' };

export async function persistVerifiedSoloRun(runId: string, userId: string, run: SoloResult): Promise<SoloPersistOutcome> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: userChipSelect });
  const baseName = (user?.name || 'Player').slice(0, 32);

  const saved = await prisma.$transaction(async (tx) => {
    const flipped = await tx.altairSoloRun.updateMany({
      where: { id: runId, userId, status: 'submitted' },
      data: {
        status: 'verified',
        verifiedAt: new Date(),
        steps: run.steps,
        result: run as never,
        coinsCredited: run.finalCoins,
      },
    });
    if (flipped.count === 0) return false;

    // Coins: the replay's payout, added to the server's own balance.
    const meta = await tx.altairMetaProgress.findUnique({ where: { userId }, select: { coins: true } });
    if (meta) {
      await tx.altairMetaProgress.update({
        where: { userId },
        data: { coins: Math.min(MAX_COINS, meta.coins + run.finalCoins) },
      });
    } else {
      await tx.altairMetaProgress.create({ data: { userId, coins: Math.min(MAX_COINS, run.finalCoins) } });
    }

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
    return true;
  });
  if (!saved) return { saved: false, reason: 'duplicate' };

  try {
    await recordGamePlay(userId);
  } catch (e) {
    console.error('altair solo quest error:', e);
  }
  return { saved: true, coins: run.finalCoins };
}
