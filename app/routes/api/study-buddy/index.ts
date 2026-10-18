import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { studyBuddyRequestSchema } from '@/lib/calendar/schema';
import { cancelRequest, getStatus, requestMatch } from '@/lib/calendar/study-buddy.server';

/**
 * GET    /api/study-buddy — pending requests and upcoming matches (also expires stale ones).
 * POST   /api/study-buddy — ask for a body-doubling partner now or for a slot (F5).
 * DELETE /api/study-buddy?requestId= — withdraw a pending request.
 */
export const Route = createFileRoute('/api/study-buddy/')({
  server: {
    handlers: {
      GET: defineHandler({ rateLimit: 'read' }, async ({ userId }) =>
        Response.json(await getStatus(userId), {
          headers: { 'Cache-Control': 'private, no-store' },
        }),
      ),
      POST: defineHandler(
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'study-buddy' },
          body: studyBuddyRequestSchema,
        },
        async ({ userId, body }) => {
          const result = await requestMatch(userId, body);
          if (!result.ok) return Response.json({ error: result.error }, { status: result.status });
          return Response.json(result.value, { status: 201 });
        },
      ),
      DELETE: defineHandler(
        { rateLimit: 'write', query: z.object({ requestId: z.string().min(1).max(40) }) },
        async ({ userId, query }) => {
          const ok = await cancelRequest(userId, query.requestId);
          return ok
            ? Response.json({ ok: true })
            : Response.json({ error: 'Not found' }, { status: 404 });
        },
      ),
    },
  },
});
