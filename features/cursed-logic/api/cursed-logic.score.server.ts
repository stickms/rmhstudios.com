/**
 * POST /api/cursed-logic/score — one finished run.
 *
 * The run's fields are checked against each other (`claimProblem`: the score fits the duels and pacts claimed, a
 * victory is nine duels, the sector matches) before the shared pipeline (`submitGameScore`: per-user rate limit,
 * the catalog ceilings, personal best, quests) stores it. Achievements are granted from the same validated run.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitGameScore } from '@/lib/game/submit.server';
import { grantAchievement, progressAchievement } from '@/lib/achievements/engine.server';
import { submitCursedLogicScoreApi } from '@features/cursed-logic/engine/cursed-logic.contract';
import { cursedLogicScoreBody } from '@features/cursed-logic/engine/score-schema';
import { claimProblem } from '@features/cursed-logic/engine/score';
import { achievementsForRun } from '@features/cursed-logic/engine/achievements';
import { CURSED_LOGIC_ID } from '@features/cursed-logic/api/score-adapter.server';

export const route = apiRoute('/api/cursed-logic/score', {
  POST: implement(
    submitCursedLogicScoreApi,
    {
      rateLimit: { limit: 6, windowMs: 60_000, prefix: 'cursed-logic-score' },
      body: cursedLogicScoreBody,
      invalid: () => Response.json({ error: 'Invalid run' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const problem = claimProblem(body);
      if (problem) {
        return Response.json({ error: 'Invalid run', reason: problem }, { status: 400 });
      }
      const userId = session.user.id;
      const result = await submitGameScore({
        gameId: CURSED_LOGIC_ID,
        userId,
        score: body.score,
        progress: body.duelsWon,
        durationMs: body.durationMs,
        username: session.user.name ?? null,
        meta: { sector: body.sector, victory: body.victory ? 1 : 0, pacts: body.pacts.length },
      });
      if (!result.ok) {
        return Response.json({ error: result.error, reason: result.reason }, { status: result.status });
      }

      // Best-effort: a failed grant never fails a recorded run.
      const earned = achievementsForRun(body);
      const unlocked: string[] = [];
      for (const id of earned.grant) {
        if (await grantAchievement(userId, id).catch(() => false)) unlocked.push(id);
      }
      for (const p of earned.progress) {
        if (await progressAchievement(userId, p.id, { by: p.by }).catch(() => false)) unlocked.push(p.id);
      }

      return Response.json({ success: true, ranked: result.ranked, moment: result.moment ?? null, unlocked });
    },
  ),
});
