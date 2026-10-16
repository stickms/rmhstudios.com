import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { lockPollSchema } from '@/lib/calendar/schema';
import { lockPoll } from '@/lib/calendar/polls.server';

/** POST /api/when/:id/lock — organiser locks in a run (creates the community event if attached). */
export const Route = createFileRoute('/api/when/$id/lock')({
  server: {
    handlers: {
      POST: defineHandler(
        { rateLimit: 'write', body: lockPollSchema },
        async ({ userId, params, body }) => {
          const result = await lockPoll(params.id, userId, body.startMin, body.endMin);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value);
        },
      ),
    },
  },
});
