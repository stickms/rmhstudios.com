import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { highlightsQuery } from '@/lib/api/v1/reading-schema';
import { listMyHighlightsForKey, queryOf, readInput } from '@/lib/api/v1/reading.server';

/**
 * GET /api/v1/me/highlights — your highlights and notes, newest first; `?since=` returns the ones updated after that
 * instant, oldest update first, for syncing. Highlights cannot be created here.
 */
export const Route = createFileRoute('/api/v1/me/highlights')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), highlightsQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const page = await listMyHighlightsForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(page);
          },
          { scope: 'read:reading' },
        ),
    },
  },
});
