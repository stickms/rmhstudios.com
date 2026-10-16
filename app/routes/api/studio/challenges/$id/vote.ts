import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { castVote } from '@/lib/studio/challenge/challenge.server';
import { voteSchema } from '@/lib/studio/challenge/shared';

/** POST /api/studio/challenges/:id/vote — one vote per member, while voting is open (F12). */
export const Route = createFileRoute('/api/studio/challenges/$id/vote')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'studio-challenge-vote' },
          body: voteSchema,
        },
        async ({ userId, params, body }) => {
          const r = await castVote(userId, params.id, body.entryId);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json({ ok: true });
        },
      ),
    },
  },
});
