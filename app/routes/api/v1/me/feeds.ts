import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { myFeedsQuery } from '@/lib/api/v1/feeds-schema';
import { listMyFeeds } from '@/lib/api/v1/feeds.server';

/** GET /api/v1/me/feeds — your feeds, lists, saved searches and keyword alerts, newest first (?kind, ?limit, ?cursor). */
export const Route = createFileRoute('/api/v1/me/feeds')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = myFeedsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const out = await listMyFeeds(userId, q.data);
            if (out === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(out);
          },
          { scope: 'read:feeds' },
        ),
    },
  },
});
