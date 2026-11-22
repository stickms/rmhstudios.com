import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { searchPeopleQuery } from '@/lib/api/v1/search-schema';
import { searchPeopleForKey } from '@/lib/api/v1/search.server';

/** GET /api/v1/search/people — find members by name, handle or display name (?q, ?limit). Three units against the daily quota. */
export const Route = createFileRoute('/api/v1/search/people')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = searchPeopleQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            return json(
              await searchPeopleForKey({
                ...q.data,
                userId,
              }),
            );
          },
          {
            scope: 'read:search',
            cost: 3,
          },
        ),
    },
  },
});
