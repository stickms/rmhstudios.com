import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { communityPath, modqueueQuery } from '@/lib/api/v1/moderation-schema';
import { listQueueForKey, moderatedCommunity } from '@/lib/api/v1/moderation.server';

/**
 * GET /api/v1/communities/{slug}/modqueue — the community's held and flagged items, newest first (?view=pending|log,
 * ?cursor, ?limit). Held post text goes through the API serialiser. Needs `manage:moderation` AND that the key owner
 * moderates the community now.
 */
export const Route = createFileRoute('/api/v1/communities/$slug/modqueue')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = communityPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid community.', 400);
            const q = modqueueQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const guard = await moderatedCommunity(p.data.slug, userId);
            if (!guard.ok) return error(guard.code, guard.message, guard.status);
            return json(await listQueueForKey(guard.result, userId, q.data));
          },
          {
            scope: 'manage:moderation',
            cost: 2,
          },
        ),
    },
  },
});
