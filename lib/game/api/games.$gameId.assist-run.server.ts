import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { startAssistRunApi } from '@/lib/game/assist-run.contract';
import { startAssistRun } from '@/lib/game/assist-run.server';

/**
 * POST /api/games/$gameId/assist-run — called by an adopting game when a run
 * starts. The server computes the profile from the stored settings and records
 * the claim `submitGameScore` reads; the client never says whether it was
 * assisted. Signed-out players cannot call it and play the ranked profile.
 */
export const route = apiRoute('/api/games/$gameId/assist-run', {
  POST: implement(
    startAssistRunApi,
    {
      rateLimit: {
        limit: 30,
        windowMs: 60_000,
        prefix: 'assist-run',
      },
    },
    async ({ params, session }) => ({
      profile: await startAssistRun(session.user.id, params.gameId),
    }),
  ),
});
