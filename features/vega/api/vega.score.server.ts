import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { submitVegaScoreApi } from '@features/vega/engine/vega.contract';
import { vegaScoreBody } from '@features/vega/engine/score-schema';
import { maxScoreThrough } from '@features/vega/engine/scoring';
import { plausibleFacts, vegaAchievementsFor, type VegaRunFacts } from '@features/vega/engine/achievements';
import type { TowerType } from '@features/vega/engine/data';
import { validateScore } from '@/lib/game/registry';
import { grantAchievement } from '@/lib/achievements/engine.server';
import { prisma } from '@/lib/prisma.server';
import { recordGamePlay } from '@/lib/quests/engine.server';
import { consumeAssistRun } from '@/lib/game/assist-run.server';

/**
 * Record a finished Project Vega run.
 *
 * Storage: the VegaPlayer row predates the rework, so its columns are reused rather than migrated:
 * `highestLevel` holds the best run score and `highestLoop` the best wave cleared (the generic adapter in
 * lib/game/adapters.server.ts already reads them as score and progress). Rows written by the old game keep their
 * small loop/level numbers and simply rank below any reworked run.
 *
 * Checks, in order: the catalog rules (ceiling, wave cap, score per second, minimum duration), the score formula's
 * bound for the waves cleared on that map, and the consistency of the achievement facts. A run that fails the
 * first two is refused; implausible facts only withhold the achievements.
 *
 * The run claim is consumed first, so a refused run spends it too (s14-20).
 *
 * An assisted run (P7) never reaches the board. The server decides, from the claim made at run start
 * (`consumeAssistRun`), never from the body: the player row IS this game's board, so it is left alone, no
 * achievement is granted, and the play still counts toward quests. The response says `ranked: false`.
 */
export const route = apiRoute('/api/vega/score', {
  POST: implement(
    submitVegaScoreApi,
    {
      rateLimit: { limit: 5, windowMs: 60_000, prefix: 'vega-score' },
      body: vegaScoreBody,
      invalid: () => Response.json({ error: 'Invalid data' }, { status: 400 }),
    },
    async ({ session, body }) => {
      const { score, cleared, map, durationMs, facts } = body;

      const userId = session.user.id;

      // s14-20: the run-start claim is spent before the run is judged. A refused run spends it too (an honest client
      // never sends one), so a re-POST after turning assists off cannot rank on the strength of a claim that survived.
      const assisted = await consumeAssistRun(userId, 'vega');

      const verdict = validateScore('vega', { score, durationMs, progress: cleared });
      if (!verdict.ok || score > maxScoreThrough(cleared, map)) {
        return Response.json({ error: 'Invalid data' }, { status: 400 });
      }

      if (assisted) {
        await recordGamePlay(userId);
        const best = await prisma.vegaPlayer.findUnique({ where: { userId } });
        return Response.json({
          success: true,
          isRecord: false,
          bestScore: best?.highestLevel ?? 0,
          bestWave: best?.highestLoop ?? 0,
          unlocked: [],
          ranked: false,
        });
      }

      const username = session.user.name || session.user.email || 'Anonymous';
      const existing = await prisma.vegaPlayer.findUnique({ where: { userId } });
      const isRecord = !existing || score > existing.highestLevel;
      const row = existing
        ? await prisma.vegaPlayer.update({
            where: { userId },
            data: {
              highestLevel: Math.max(existing.highestLevel, score),
              highestLoop: Math.max(existing.highestLoop, cleared),
              gamesPlayed: { increment: 1 },
              username,
            },
          })
        : await prisma.vegaPlayer.create({
            data: { userId, username, highestLevel: score, highestLoop: cleared, gamesPlayed: 1 },
          });
      await recordGamePlay(userId);

      const runFacts: VegaRunFacts = { map, cleared, ...facts, typesBuilt: facts.typesBuilt as TowerType[] };
      const unlocked: string[] = [];
      if (plausibleFacts(runFacts)) {
        for (const id of vegaAchievementsFor(runFacts)) {
          if (await grantAchievement(userId, id)) unlocked.push(id);
        }
      }

      return Response.json({
        success: true,
        isRecord,
        bestScore: row.highestLevel,
        bestWave: row.highestLoop,
        unlocked,
        ranked: true,
      });
    },
  ),
});
