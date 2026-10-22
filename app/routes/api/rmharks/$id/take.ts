import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { takeVoteSchema } from '@/lib/feed/take';
import { castTakeVote, getTakeState } from '@/lib/feed/take.server';

/**
 * Take meter (X6).
 *
 * GET  — the viewer's view of a take: their own vote, and the agree/disagree
 *        split only if they are the author or have already voted.
 * POST — cast a vote. Body: { vote: 'agree' | 'disagree' }. One vote per
 *        member; the response is the revealed state.
 */
export const Route = createFileRoute('/api/rmharks/$id/take')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional', rateLimit: 'read' }, async ({ userId, params }) => {
        const state = await getTakeState(params.id, userId);
        if (!state) return Response.json({ error: 'Take not found' }, { status: 404 });
        return Response.json(state, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'take-vote' }, body: takeVoteSchema },
        async ({ userId, params, body }) => {
          const result = await castTakeVote(params.id, userId, body.vote);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.state);
        },
      ),
    },
  },
});
