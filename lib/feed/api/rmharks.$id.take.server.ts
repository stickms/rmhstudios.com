import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { takeVoteSchema } from '@/lib/feed/take';
import { castTakeVote, getTakeState } from '@/lib/feed/take.server';
import { getTakeApi } from '@/lib/feed/rmhark-actions.contract';
import { voteTakeApi } from '@/lib/feed/rmhark-actions.contract';

/**
 * Take meter (X6).
 *
 * GET  — the viewer's view of a take: their own vote, and the agree/disagree
 *        split only if they are the author or have already voted.
 * POST — cast a vote. Body: { vote: 'agree' | 'disagree' }. One vote per
 *        member; the response is the revealed state.
 */
export const route = apiRoute('/api/rmharks/$id/take', {
  GET: implement(
    getTakeApi,
    { auth: 'optional', rateLimit: 'read' },
    async ({ userId, params }) => {
      const state = await getTakeState(params.id, userId);
      if (!state) return Response.json({ error: 'Take not found' }, { status: 404 });
      return Response.json(state, { headers: { 'Cache-Control': 'private, no-store' } });
    },
  ),
  POST: implement(
    voteTakeApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'take-vote' }, body: takeVoteSchema },
    async ({ userId, params, body }) => {
      const result = await castTakeVote(params.id, userId, body.vote);
      if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
      return Response.json(result.state);
    },
  ),
});
