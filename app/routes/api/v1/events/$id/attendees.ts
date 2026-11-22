import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { attendeesQuery, eventPath } from '@/lib/api/v1/events-schema';
import { listAttendeesForKey, queryOf, readInput } from '@/lib/api/v1/events.server';

/** GET /api/v1/events/{id}/attendees — who is going or maybe for one date; the host and co-hosts only. */
export const Route = createFileRoute('/api/v1/events/$id/attendees')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = readInput(params, eventPath);
            if (!p.ok) return error('invalid_request', p.message, 400);
            const q = readInput(queryOf(request), attendeesQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const page = await listAttendeesForKey(p.data.id, userId, q.data);
            if (page === 'not_found') return error('not_found', 'Not found.', 404);
            if (page === 'forbidden')
              return error(
                'forbidden',
                'Only the host and co-hosts can read the guest list. The event endpoint has the counts.',
                403,
              );
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            if (page === 'bad_occurrence') return error('invalid_request', 'Not a date of this event.', 400);
            return json(page);
          },
          {
            scope: 'read:events',
          },
        ),
    },
  },
});
