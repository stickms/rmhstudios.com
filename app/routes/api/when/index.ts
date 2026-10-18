import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { createPollSchema } from '@/lib/calendar/schema';
import { createPoll, listMyPolls } from '@/lib/calendar/polls.server';

/**
 * GET  /api/when — polls the caller organises, was invited to, or answered (K1).
 * POST /api/when — create an availability poll.
 */
export const Route = createFileRoute('/api/when/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) => {
        const polls = await listMyPolls(userId);
        return Response.json({ polls }, { headers: { 'Cache-Control': 'private, no-store' } });
      }),
      POST: defineHandler(
        {
          rateLimit: { limit: 10, windowMs: 60_000, prefix: 'poll-create' },
          body: createPollSchema,
        },
        async ({ userId, body }) => {
          const result = await createPoll(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value, { status: 201 });
        },
      ),
    },
  },
});
