/**
 * /api/groupcalls/history — this account's recent group calls.
 *
 * Scoped to calls the viewer was actually on the roster of; there is no way to
 * read anyone else's, and no parameter that would widen it. Missed rings are
 * included on purpose — a call history that only lists calls you answered is
 * missing the rows people go looking for.
 *
 * Paginated by keyset. `cursor` is the last row's `callId` and is opaque to the
 * client: it is only meaningful together with the viewer's own id, which comes
 * from the session, so it cannot be pointed at somebody else's page.
 */
import { createFileRoute } from '@tanstack/react-router';
import { z } from 'zod';
import { defineHandler } from '@/lib/api/handler.server';
import { getGroupCallHistory } from '@/lib/groupcall.server';

export const Route = createFileRoute('/api/groupcalls/history')({
  server: {
    handlers: {
      GET: defineHandler(
        {
          rateLimit: 'read',
          query: z.object({
            take: z.coerce.number().int().min(1).max(50).default(20),
            cursor: z.string().max(64).optional(),
          }),
        },
        async ({ userId, query }) =>
          Response.json(
            await getGroupCallHistory(userId, { take: query.take, cursor: query.cursor ?? null }),
          ),
      ),
    },
  },
});
