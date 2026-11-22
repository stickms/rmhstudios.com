import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { goalQuery } from '@/lib/api/v1/reading-schema';
import { getMyReadingGoal, queryOf, readInput } from '@/lib/api/v1/reading.server';

/** GET /api/v1/me/reading-goal — your yearly goal and progress (`?year=`, default the current UTC year). */
export const Route = createFileRoute('/api/v1/me/reading-goal')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = readInput(queryOf(request), goalQuery);
            if (!q.ok) return error('invalid_request', q.message, 400);
            const year = q.data.year ?? new Date().getUTCFullYear();
            return json(await getMyReadingGoal(userId, year));
          },
          { scope: 'read:reading' },
        ),
    },
  },
});
