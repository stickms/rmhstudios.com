/** `GET /api/rmhtype/challenges/runs` — the caller's own bests that can be sent as a challenge. */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listRmhTypeChallengeableRunsApi } from '@/lib/rmhtype/challenges.contract';
import { listChallengeableRuns } from '@/lib/rmhtype/challenges.server';

export const route = apiRoute('/api/rmhtype/challenges/runs', {
  GET: implement(listRmhTypeChallengeableRunsApi, { rateLimit: 'read' }, async ({ userId }) => ({
    runs: await listChallengeableRuns(userId),
  })),
});
