import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { feedPath } from '@/lib/api/v1/feeds-schema';
import { getMyFeed } from '@/lib/api/v1/feeds.server';

/** GET /api/v1/me/feeds/{id} — one of your feeds, with its people's handles. Another member's is a 404. */
export const Route = createFileRoute('/api/v1/me/feeds/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = feedPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid feed.', 400);
            const feed = await getMyFeed(userId, p.data.id);
            if (!feed) return error('not_found', 'Feed not found.', 404);
            return json(feed);
          },
          { scope: 'read:feeds' },
        ),
    },
  },
});
