import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { eventPath, postUpdateApiBody } from '@/lib/api/v1/events-schema';
import {
  listUpdatesForKey,
  postUpdateForKey,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/events.server';

/**
 * GET  /api/v1/events/{id}/updates — the host updates, as attendees see them (`read:events`).
 * POST /api/v1/events/{id}/updates — post one as the host or a co-host (`manage:events`); the people coming are told
 * through the site's own durable fan-out.
 */
export const Route = createFileRoute('/api/v1/events/$id/updates')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const data = await listUpdatesForKey(p.data.id, userId);
            if (!data) return error('not_found', 'Not found.', 404);
            return json({ data });
          },
          {
            scope: 'read:events',
          },
        ),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const body = await readBody(request, postUpdateApiBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId)) return error('rate_limited', 'Too many writes. Slow down.', 429);
            const out = await postUpdateForKey(p.data.id, userId, body.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result, 201);
          },
          {
            scope: 'manage:events',
            idempotent: true,
          },
        ),
    },
  },
});
