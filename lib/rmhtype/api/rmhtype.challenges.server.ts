/**
 * GET  /api/rmhtype/challenges — the caller's received, sent and settled challenges, with the switch.
 * POST /api/rmhtype/challenges — send the caller's best run on a curated passage to a mutual.
 */
import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { listRmhTypeChallengesApi, sendRmhTypeChallengeApi } from '@/lib/rmhtype/challenges.contract';
import { sendChallengeBody } from '@/lib/rmhtype/challenges-schema';
import { listChallenges, sendChallenge } from '@/lib/rmhtype/challenges.server';

export const route = apiRoute('/api/rmhtype/challenges', {
  GET: implement(listRmhTypeChallengesApi, { rateLimit: 'read' }, async ({ userId }) => listChallenges(userId)),

  POST: implement(
    sendRmhTypeChallengeApi,
    { rateLimit: { limit: 30, windowMs: 60 * 60 * 1000, prefix: 'rmhtype-challenge-send' }, body: sendChallengeBody },
    async ({ userId, body }) => {
      const result = await sendChallenge(userId, body.opponentId, body.passageId);
      if (!result.ok) return Response.json({ error: result.error, code: result.code }, { status: result.status });
      return Response.json({ success: true as const, challenge: result.challenge }, { status: 201 });
    },
  ),
});
