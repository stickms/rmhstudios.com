/**
 * POST /api/signal-forge/score: a finished run. The score goes through the shared pipeline (`submitGameScore`:
 * the catalog ceilings, points-per-second, assist runs, personal bests, quests), and the run's facts decide the
 * achievements (`signalForgeAchievementsForRun`), granted idempotently.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitSignalForgeScoreApi } from '@features/signal-forge/engine/signal-forge.contract';
import { signalForgeScoreBody, signalForgeScoreMessage } from '@features/signal-forge/engine/score-schema';
import { signalForgeAchievementsForRun } from '@features/signal-forge/engine/achievements';
import { submitGameScore } from '@/lib/game/submit.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

export const route = apiRoute('/api/signal-forge/score', {
  POST: implement(
    submitSignalForgeScoreApi,
    {
      rateLimit: { limit: 5, windowMs: 60_000, prefix: 'signal-forge-score' },
      body: signalForgeScoreBody,
      invalid: (error) => Response.json({ error: signalForgeScoreMessage(error) }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { score, floorReached, durationMs, facts } = body;
      const result = await submitGameScore({
        gameId: 'signal-forge',
        userId: session.user.id,
        score,
        progress: floorReached,
        ...(durationMs !== undefined ? { durationMs } : {}),
        username: session.user.name || undefined,
      });
      if (!result.ok) {
        return Response.json({ error: result.error, reason: result.reason }, { status: result.status });
      }

      const granted: string[] = [];
      if (facts) {
        for (const id of signalForgeAchievementsForRun(facts)) {
          // Best-effort: a failed grant never fails a recorded score.
          if (await grantAchievement(session.user.id, id).catch(() => false)) granted.push(id);
        }
      }
      return Response.json({
        success: true,
        ranked: result.ranked,
        isRecord: result.moment?.kind === 'pb' || result.moment?.kind === 'first-score',
        achievements: granted,
      });
    },
  ),
});
