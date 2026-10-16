import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { respondPollSchema } from '@/lib/calendar/schema';
import { respondToPoll } from '@/lib/calendar/polls.server';

/** PUT /api/when/:id/respond — save the caller's grid (one character per slot). */
export const Route = createFileRoute('/api/when/$id/respond')({
  server: {
    handlers: {
      PUT: defineHandler(
        {
          rateLimit: { limit: 60, windowMs: 60_000, prefix: 'poll-respond' },
          body: respondPollSchema,
        },
        async ({ userId, params, body }) => {
          const result = await respondToPoll(params.id, userId, body.answers);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value);
        },
      ),
    },
  },
});
