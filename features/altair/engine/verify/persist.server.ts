/**
 * Persist a VERIFIED co-op run. The only input is the replay's result (plus the hub's trusted
 * roster for names) -- never anything the host's browser claimed. Idempotent on `runId`: a second
 * submission of the same run hits the unique index and changes nothing.
 */
import { prisma } from '@/lib/prisma.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { recordGamePlay } from '@/lib/quests/engine.server';
import type { CoopRunJob } from './job';
import type { VerifiedCoopRun } from './verify-coop';

export type PersistOutcome =
  | { saved: true; matchId: string }
  | { saved: false; reason: 'duplicate' | 'no_players' };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

export async function persistVerifiedCoopRun(job: CoopRunJob, run: VerifiedCoopRun): Promise<PersistOutcome> {
  const names = new Map([...job.roster, ...job.joins].map((p) => [p.userId, p.userName]));
  // Only real accounts get profiles/match rows (the roster comes from the hub, but be strict).
  const realUserIds = new Set(
    (
      await prisma.user.findMany({
        where: { id: { in: run.players.map((p) => p.userId) } },
        select: { id: true },
      })
    ).map((u) => u.id),
  );
  const players = run.players.filter((p) => realUserIds.has(p.userId));
  if (players.length === 0) return { saved: false, reason: 'no_players' };

  let matchId: string;
  try {
    matchId = await prisma.$transaction(async (tx) => {
      const match = await tx.altairMatch.create({
        data: {
          runId: job.runId,
          lobbyId: job.lobbyId,
          playerCount: players.length,
          doubleTime: job.doubleTime,
          victory: run.victory,
          sharedKills: run.sharedKills,
          bossesDefeated: run.bossesDefeated,
          durationMs: Math.round(run.gameTime * 1000),
          endedAt: new Date(),
          // The replay's numbers, never the host's claim.
          results: { verified: true, steps: run.steps, seed: job.seed, players: run.players } as never,
        },
      });
      await tx.altairMatchPlayer.createMany({
        data: players.map((p) => ({
          matchId: match.id,
          userId: p.userId,
          userName: names.get(p.userId) ?? 'Player',
          classId: p.classId,
          slot: p.slot,
          finalLevel: p.level,
          kills: p.kills,
          coinsEarned: p.coins,
          timeSurvived: p.timeSurvived,
          wasDowned: p.wasDowned,
          wasRevived: p.revivesReceived > 0,
          revivesGiven: p.revivesGiven,
          wasAliveAtEnd: p.wasAliveAtEnd,
          stats: {},
        })),
      });
      for (const p of players) {
        await tx.altairCoopProfile.upsert({
          where: { userId: p.userId },
          create: {
            userId: p.userId,
            totalCoopRuns: 1,
            totalCoopWins: run.victory ? 1 : 0,
            totalRevivesGiven: p.revivesGiven,
            totalRevivesReceived: p.revivesReceived,
            totalCoopKills: p.kills,
            totalCoopCoins: p.coins,
            favoriteClassId: p.classId,
          },
          update: {
            totalCoopRuns: { increment: 1 },
            totalCoopWins: run.victory ? { increment: 1 } : undefined,
            totalRevivesGiven: { increment: p.revivesGiven },
            totalRevivesReceived: { increment: p.revivesReceived },
            totalCoopKills: { increment: p.kills },
            totalCoopCoins: { increment: p.coins },
          },
        });
      }
      return match.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) return { saved: false, reason: 'duplicate' };
    throw e;
  }

  // Achievements are best-effort and only follow a freshly saved run (a duplicate returned above).
  try {
    for (const p of players) {
      await grantAchievement(p.userId, 'game.altair.first_run');
      if (run.victory) await grantAchievement(p.userId, 'game.altair.first_victory');
      if (p.revivesGiven > 0) {
        await progressAchievement(p.userId, 'game.altair.coop_revives_10', { by: p.revivesGiven });
      }
      await recordGamePlay(p.userId);
    }
  } catch (e) {
    console.error('altair achievement error:', e);
  }
  return { saved: true, matchId };
}
