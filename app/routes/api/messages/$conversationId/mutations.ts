import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { listMutationsSince } from '@/lib/messages/mutations.server';

/**
 * GET /api/messages/$conversationId/mutations?since=<iso> — edits and unsends
 * this client has not applied yet.
 *
 * The catch-up half of realtime. A live client patches its copy from the
 * `message-edited` / `message-deleted` events on the DM bus, but SSE is not a
 * guarantee: the stream recycles every ~30 minutes, a backgrounded tab may miss
 * events entirely, and a phone that slept through a retraction must not wake up
 * still showing it. Asking "what changed since X" is cheaper than refetching the
 * thread and is bounded to 100 rows.
 *
 * It is also what makes the feature correct on a deployment whose shared SSE
 * stream has not yet been taught to forward the two new event names: the bus
 * already emits an unread pulse for every notification, and the client
 * revalidates against this endpoint when it sees one.
 */

const querySchema = z.object({
  since: z.string().datetime(),
});

export const Route = createFileRoute('/api/messages/$conversationId/mutations')({
  server: {
    handlers: {
      GET: defineHandler(
        { rateLimit: 'read', query: querySchema },
        async ({ params, userId, query }) => {
          const since = new Date(query.since);
          if (Number.isNaN(since.getTime())) {
            return Response.json({ error: 'Invalid input' }, { status: 400 });
          }

          const result = await listMutationsSince({
            conversationId: params.conversationId,
            userId,
            since,
          });
          if (!result) return Response.json({ error: 'Conversation not found' }, { status: 404 });

          return Response.json({ ...result, now: new Date().toISOString() });
        },
      ),
    },
  },
});
