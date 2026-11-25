import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { applicationsQuery } from '@/lib/api/v1/ladder-schema';
import { NO_STORE, listApplicationsForKey, queryOf, readInput } from '@/lib/api/v1/ladder.server';

/**
 * GET /api/v1/me/ladder/applications — your RMHLadder applications with their jobs' public fields, most recently
 * changed first. Needs the explicit `read:ladder` scope. Never carries offers, pay, resumes or contacts.
 */
export const Route = createFileRoute('/api/v1/me/ladder/applications')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), applicationsQuery);
            if (!q.ok) return error('invalid_request', q.message, 400, NO_STORE);
            const page = await listApplicationsForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400, NO_STORE);
            return json(page, 200, NO_STORE);
          },
          { scope: 'read:ladder' },
        ),
    },
  },
});
