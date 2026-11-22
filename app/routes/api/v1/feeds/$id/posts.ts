import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { hasScope } from '@/lib/api/scopes';
import { feedPath, feedPostsQuery } from '@/lib/api/v1/feeds-schema';
import { getFeedPostsForKey } from '@/lib/api/v1/feeds.server';

/**
 * GET /api/v1/feeds/{id}/posts — a feed's or list's posts as the site pages them for you, newest first (?cursor,
 * ?limit). Your own feed, or one readable by others. Needs `read:feeds` and `read:posts`.
 */
export const Route = createFileRoute('/api/v1/feeds/$id/posts')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error, scopes }) => {
            if (!hasScope(scopes, 'read:posts')) {
              return error(
                'insufficient_scope',
                'Reading a feed\'s posts requires the "read:posts" scope as well, which this key does not have.',
                403,
                { 'X-Accepted-Scope': 'read:feeds read:posts' },
              );
            }
            const p = feedPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid feed.', 400);
            const q = feedPostsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const out = await getFeedPostsForKey(userId, p.data.id, q.data);
            if (!out.ok) {
              if (out.reason === 'not_a_timeline') {
                return error('not_a_timeline', 'A saved search or keyword alert is a query, not a timeline.', 409);
              }
              if (out.reason === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
              return error('not_found', 'Feed not found.', 404);
            }
            return json({ data: out.data, nextCursor: out.nextCursor });
          },
          { scope: 'read:feeds', cost: 2 },
        ),
    },
  },
});
