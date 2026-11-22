import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { hasScope } from '@/lib/api/scopes';
import { scheduledPath } from '@/lib/api/v1/scheduled-schema';
import { failureResponse, loadOwnForKey, publishScheduledForKey } from '@/lib/api/v1/scheduled.server';

/** POST /api/v1/me/scheduled/{id}/publish — publish a draft or scheduled post now, through the same checks as the sweep. */
export const Route = createFileRoute('/api/v1/me/scheduled/$id/publish')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async (ctx) => {
            const { userId, json, error, scopes } = ctx;
            const p = scheduledPath.safeParse(params);
            if (!p.success) return error('invalid_request', 'Invalid id.', 400);
            const own = await loadOwnForKey(userId, p.data.id);
            if (!own.ok) return failureResponse(ctx, own);
            if (own.row.communityId && !hasScope(scopes, 'write:communities')) {
              return error(
                'insufficient_scope',
                'Publishing a community post requires the "write:communities" scope, which this key does not have.',
                403,
                { 'X-Accepted-Scope': 'write:scheduled write:communities' },
              );
            }
            const out = await publishScheduledForKey(userId, own.row);
            if (!out.ok) return failureResponse(ctx, out);
            return json({ published: true, postId: out.postId });
          },
          { scope: 'write:scheduled', idempotent: true },
        ),
    },
  },
});
