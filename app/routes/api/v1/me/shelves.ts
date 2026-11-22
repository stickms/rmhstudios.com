import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { shelvesQuery } from '@/lib/api/v1/reading-schema';
import { listMyShelvesForKey, queryOf, readInput } from '@/lib/api/v1/reading.server';

/** GET /api/v1/me/shelves — your shelf entries (want, reading, read), most recently changed first. */
export const Route = createFileRoute('/api/v1/me/shelves')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), shelvesQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            return json(await listMyShelvesForKey(userId, q.data.shelf));
          },
          { scope: 'read:reading' },
        ),
    },
  },
});
