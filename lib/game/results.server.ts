/**
 * Standardized game-result reporting for the Arcade Pass.
 *
 * `reportGameResult` is the best-effort seam a game's score/finish endpoint
 * calls when a play ends. It advances any of today's arcade challenges the
 * result satisfies (writing to the shared `UserQuest` table) and, on the first
 * completion of the day, bumps the player's arcade streak.
 *
 * Reads (`getArcadeState`) and claims (`claimArcadeChallenge`) mirror the quest
 * engine's shape (`lib/quests/engine.server.ts`) so the two systems read alike.
 */

import { prisma } from '@/lib/prisma.server';
import { awardCoins } from '@/lib/coins.server';
import { awardXp } from '@/lib/xp/engine.server';
import {
  arcadeDayKey,
  challengesForDay,
  dayKeyFromChallengeId,
  type ArcadeChallenge,
  type ArcadeState,
} from '@/lib/quests/arcade';

export interface GameResultPayload {
  /** Game id — must match an `id` in `lib/games.ts`. */
  game: string;
  score?: number;
  won?: boolean;
  cleared?: number;
}

/**
 * Does a result satisfy a challenge's metric? Returns the next progress value
 * and whether it now counts as complete. For quantitative metrics we keep the
 * best-so-far value for a nicer progress bar; `plays` increments by one.
 */
function evaluate(
  challenge: ArcadeChallenge,
  payload: GameResultPayload,
  prevProgress: number,
): { progress: number; completed: boolean } {
  switch (challenge.metric) {
    case 'score': {
      const best = Math.max(prevProgress, Math.min(payload.score ?? 0, challenge.target));
      return { progress: best, completed: best >= challenge.target };
    }
    case 'clear': {
      const best = Math.max(prevProgress, Math.min(payload.cleared ?? 0, challenge.target));
      return { progress: best, completed: best >= challenge.target };
    }
    case 'win': {
      const completed = payload.won === true;
      return { progress: completed ? challenge.target : prevProgress, completed };
    }
    case 'plays': {
      const next = Math.min(prevProgress + 1, challenge.target);
      return { progress: next, completed: next >= challenge.target };
    }
    default:
      return { progress: prevProgress, completed: false };
  }
}

/**
 * Bump the arcade streak, at most once per UTC day. current = previous + 1 when
 * yesterday was the last active day, otherwise resets to 1; best is the running
 * max. No-ops if the streak was already touched today.
 */
async function touchArcadeStreak(userId: string): Promise<void> {
  const today = arcadeDayKey();
  const yesterday = arcadeDayKey(new Date(Date.now() - 86_400_000));
  const existing = await prisma.arcadeStreak.findUnique({
    where: { userId },
    select: { current: true, best: true, lastDay: true },
  });
  if (existing?.lastDay === today) return;

  const current = existing?.lastDay === yesterday ? existing.current + 1 : 1;
  const best = Math.max(existing?.best ?? 0, current);
  await prisma.arcadeStreak.upsert({
    where: { userId },
    create: { userId, current, best, lastDay: today },
    update: { current, best, lastDay: today },
  });
}

/**
 * Report a finished game. Best-effort: never throws — a failure here must not
 * fail the underlying game-result save. Idempotent-ish for terminal metrics
 * (already-completed challenges are skipped); `plays` progresses per call.
 */
export async function reportGameResult(userId: string, payload: GameResultPayload): Promise<void> {
  try {
    const dayKey = arcadeDayKey();
    const matching = challengesForDay(dayKey).filter((c) => c.game === payload.game);
    if (matching.length === 0) return;

    const rows = await prisma.userQuest.findMany({
      where: { userId, periodKey: dayKey, questId: { in: matching.map((c) => c.id) } },
      select: { questId: true, progress: true, completed: true },
    });
    const byId = new Map(rows.map((r) => [r.questId, r]));

    const results = await Promise.all(
      matching.map(async (challenge) => {
        const row = byId.get(challenge.id);
        if (row?.completed) return false;
        const { progress, completed } = evaluate(challenge, payload, row?.progress ?? 0);
        await prisma.userQuest.upsert({
          where: { userId_questId_periodKey: { userId, questId: challenge.id, periodKey: dayKey } },
          create: { userId, questId: challenge.id, periodKey: dayKey, progress, completed },
          update: { progress, completed },
        });
        return completed && !row?.completed;
      }),
    );

    if (results.some(Boolean)) await touchArcadeStreak(userId);
  } catch (err) {
    console.error('[arcade] reportGameResult failed:', err);
  }
}

/** Today's challenges merged with the viewer's progress, plus their streak. */
export async function getArcadeState(userId: string): Promise<ArcadeState> {
  const dayKey = arcadeDayKey();
  const challenges = challengesForDay(dayKey);

  const [rows, streak] = await Promise.all([
    prisma.userQuest.findMany({
      where: { userId, periodKey: dayKey, questId: { in: challenges.map((c) => c.id) } },
      select: { questId: true, progress: true, completed: true, claimed: true },
    }),
    prisma.arcadeStreak.findUnique({
      where: { userId },
      select: { current: true, best: true },
    }),
  ]);
  const byId = new Map(rows.map((r) => [r.questId, r]));

  return {
    dayKey,
    challenges: challenges.map((c) => {
      const row = byId.get(c.id);
      return {
        ...c,
        progress: Math.min(row?.progress ?? 0, c.target),
        completed: row?.completed ?? false,
        claimed: row?.claimed ?? false,
      };
    }),
    streak: { current: streak?.current ?? 0, best: streak?.best ?? 0 },
  };
}

/**
 * Claim a completed arcade challenge's reward. Returns { xp, coins } granted,
 * or null if it isn't claimable. The claim flip is atomic (guarded in the
 * WHERE clause) so concurrent claims can't double-grant — mirrors `claimQuest`.
 */
export async function claimArcadeChallenge(
  userId: string,
  challengeId: string,
): Promise<{ xp: number; coins: number } | null> {
  const dayKey = dayKeyFromChallengeId(challengeId);
  if (!dayKey) return null;
  const def = challengesForDay(dayKey).find((c) => c.id === challengeId);
  if (!def) return null;

  const claim = await prisma.userQuest.updateMany({
    where: { userId, questId: challengeId, periodKey: dayKey, completed: true, claimed: false },
    data: { claimed: true },
  });
  if (claim.count === 0) return null;

  if (def.coins > 0) {
    await awardCoins(userId, def.coins, {
      type: 'REWARD',
      note: `Arcade: ${def.title}`,
      entityType: 'arcade',
      entityId: def.id,
    });
  }
  if (def.xp > 0) await awardXp(userId, def.xp);

  return { xp: def.xp, coins: def.coins };
}
