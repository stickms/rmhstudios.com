import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { eventPath } from '@/lib/api/v1/events-schema';
import { getEventForKey, readInput } from '@/lib/api/v1/events.server';

/** GET /api/v1/events/{id} — one event with its next dates, counts, hosts and latest updates. */
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
    },
  },
});
