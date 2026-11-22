import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { searchPostsQuery } from '@/lib/api/v1/search-schema';
import { searchPostsForKey } from '@/lib/api/v1/search.server';

/**
 * GET /api/v1/search/posts — keyword search over public posts with the site's operators (?q, ?limit, ?cursor).
 * Posts are serialised by `serializePublicPost`, as the feed's are. Three units against the daily quota.
 */
export const Route = createFileRoute('/api/v1/search/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = searchPostsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const result = await searchPostsForKey({
              ...q.data,
              userId,
            });
            if (!result.ok) return error('invalid_request', result.message, 400);
            return json({
              data: result.data,
              nextCursor: result.nextCursor,
            });
          },
          {
            scope: 'read:search',
            cost: 3,
          },
        ),
    },
  },
});
