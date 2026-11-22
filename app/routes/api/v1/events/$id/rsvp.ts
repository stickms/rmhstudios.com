import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { eventPath, rsvpBody, unrsvpQuery } from '@/lib/api/v1/events-schema';
import {
  queryOf,
  readBody,
  readInput,
  rsvpForKey,
  unrsvpForKey,
  writeBudgetExceeded,
} from '@/lib/api/v1/events.server';

/**
 * PUT    /api/v1/events/{id}/rsvp — answer going or maybe (the site's rsvp: a full event answers `waitlisted`).
 * DELETE /api/v1/events/{id}/rsvp — take your answer back (the site's unrsvp).
 */
export const Route = createFileRoute('/api/v1/events/$id/rsvp')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PUT: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, rsvpBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const out = await rsvpForKey(p.data.id, userId, body.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'write:events',
            idempotent: true,
          },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const q = readInput(queryOf(request), unrsvpQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const out = await unrsvpForKey(p.data.id, userId, q.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'write:events',
            idempotent: true,
          },
        ),
    },
  },
});
