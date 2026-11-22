import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { eventPath, updateEventBody } from '@/lib/api/v1/events-schema';
import {
  getEventForKey,
  readBody,
  readInput,
  updateEventForKey,
  writeBudgetExceeded,
} from '@/lib/api/v1/events.server';

/**
 * GET   /api/v1/events/{id} — one event with its next dates, counts, hosts and latest updates.
 * PATCH /api/v1/events/{id} — edit it as the host or a co-host (`manage:events`), through the site's `updateEvent`.
 */
export const Route = createFileRoute('/api/v1/events/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const event = await getEventForKey(p.data.id, userId);
            if (!event) return error('not_found', 'Not found.', 404);
            return json(event);
          },
          {
            scope: 'read:events',
          },
        ),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, updateEventBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const out = await updateEventForKey(p.data.id, userId, body.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'manage:events',
            idempotent: true,
          },
        ),
    },
  },
});
