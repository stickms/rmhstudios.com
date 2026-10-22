import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { guessSchema } from '@/lib/party/connections-schema';
import { submitGuess } from '@/lib/party/connections.server';

/** POST /api/connections/grids/:id/guess — check four items server-side. */
export const Route = createFileRoute('/api/connections/grids/$id/guess')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'connections-guess' },
          body: guessSchema,
        },
        async ({ userId, params, body }) => {
          const r = await submitGuess(userId, params.id, body.items);
          if (!r.ok) return Response.json({ error: r.error }, { status: r.status });
          return Response.json(r);
        },
      ),
    },
  },
});
