import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { createEventBody, listQuery, resolveWindow } from '@/lib/api/v1/events-schema';
import {
  createBudgetExceeded,
  createEventForKey,
  listEventsForKey,
  queryOf,
  readBody,
  readInput,
  writeBudgetExceeded,
} from '@/lib/api/v1/events.server';

/**
 * GET  /api/v1/events — events you can see, repeating ones expanded into dates inside a window of at most 31 days.
 * POST /api/v1/events — host a new event as the key owner (`manage:events`), through the site's `createEvent`.
 */
export const Route = createFileRoute('/api/v1/events')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), listQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const window = resolveWindow(q.data, new Date());
            if (!window.ok) return error('invalid_request', window.message, 400);
            const page = await listEventsForKey(userId, {
              from: window.from,
              to: window.to,
              community: q.data.community,
              limit: q.data.limit,
              cursor: q.data.cursor,
            });
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(page);
          },
          {
            scope: 'read:events',
          },
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const body = await readBody(request, createEventBody);
            if (!body.ok) return error('invalid_request', body.message, 400);
            if (writeBudgetExceeded(userId) || (await createBudgetExceeded(userId)))
              return error('rate_limited', 'Too many events created. Slow down.', 429);
            const out = await createEventForKey(userId, body.data);
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
