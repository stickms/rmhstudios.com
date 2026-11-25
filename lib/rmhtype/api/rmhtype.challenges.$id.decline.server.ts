/** `POST /api/rmhtype/challenges/$id/decline` — the opponent declines a pending challenge (nobody is told). */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { declineRmhTypeChallengeApi } from '@/lib/rmhtype/challenges.contract';
import { declineChallenge } from '@/lib/rmhtype/challenges.server';

export const route = apiRoute('/api/rmhtype/challenges/$id/decline', {
  POST: implement(declineRmhTypeChallengeApi, { rateLimit: 'write' }, async ({ userId, params }) => {
    const result = await declineChallenge(userId, params.id);
    if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
    return { success: true as const };
  }),
});
