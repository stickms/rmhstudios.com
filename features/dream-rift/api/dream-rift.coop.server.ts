import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { CACHE_POLICY } from '@/lib/api/cache-policies';
import { ERROR_CODES, refusalBody } from '@/lib/errors/codes';
import { listDreamRiftCoopApi, submitDreamRiftCoopApi } from '@features/dream-rift/engine/dream-rift.contract';
import { coopBoardQuery, coopFinishBody } from '@features/dream-rift/engine/coop-schema';
import { finishCoopRun, listCoopBoard } from '@features/dream-rift/engine/coop-runs.server';

export const route = apiRoute('/api/dream-rift/coop', {
  // ── Co-op leaderboards: top finished runs by combined score or time survived, names resolved live ──
  GET: implement(
    listDreamRiftCoopApi,
    {
      auth: 'none',
      rateLimit: { limit: 20, windowMs: 60_000, prefix: 'dream-rift-coop-get' },
      query: coopBoardQuery,
      // ?difficulty= and ?metric= are in the URL, so each variant caches alone. The same for every caller: a member
      // who turned boards off is "A player" for everybody.
      cache: CACHE_POLICY.leaderboard,
    },
    async ({ query }) => listCoopBoard(query.difficulty ?? 'normal', query.metric ?? 'combined'),
  ),

  // ── The host finishes the run the hub started (authenticated, once) ──
  POST: implement(
    submitDreamRiftCoopApi,
    { rateLimit: { limit: 5, windowMs: 60_000, prefix: 'dream-rift-coop-post' }, body: coopFinishBody },
    async ({ userId, body }) => {
      const finished = await finishCoopRun(userId, {
        runId: body.runId,
        combinedScore: Math.round(body.combinedScore),
        timeSurvived: Math.round(body.timeSurvived),
        stageReached: Math.round(body.stageReached),
        cleared: body.cleared,
        players: body.players.map((p) => ({
          slot: p.slot,
          name: p.name.trim().slice(0, 24),
          charId: p.charId,
          score: Math.round(p.score),
        })),
      });
      if (!finished) {
        return Response.json(refusalBody('COOP_RUN_UNKNOWN'), { status: ERROR_CODES.COOP_RUN_UNKNOWN.http });
      }
      return { success: true as const };
    },
  ),
});
