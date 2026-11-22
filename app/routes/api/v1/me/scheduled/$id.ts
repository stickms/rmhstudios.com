import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { hasScope } from '@/lib/api/scopes';
import { patchScheduledBody, scheduledPath } from '@/lib/api/v1/scheduled-schema';
import {
  discardScheduledForKey,
  failureResponse,
  getScheduledForKey,
  loadOwnForKey,
  patchScheduledForKey,
} from '@/lib/api/v1/scheduled.server';

/**
 * GET    /api/v1/me/scheduled/{id} — one of your drafts, scheduled posts or capsules.
 * PATCH  /api/v1/me/scheduled/{id} — change a draft or scheduled post (never a capsule).
 * DELETE /api/v1/me/scheduled/{id} — discard a draft or scheduled post.
 */
export const Route = createFileRoute('/api/v1/me/scheduled/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = scheduledPath.safeParse(params);
            if (!p.success) return error('invalid_request', 'Invalid id.', 400);
            const row = await getScheduledForKey(userId, p.data.id);
            if (!row) return error('not_found', 'Scheduled post not found.', 404);
            return json(row);
          },
          { scope: 'read:scheduled' },
        ),

      PATCH: ({ request, params }) =>
        withDeveloperApi(
          request,
          async (ctx) => {
            const { userId, json, error, scopes } = ctx;
            const p = scheduledPath.safeParse(params);
            if (!p.success) return error('invalid_request', 'Invalid id.', 400);
            const parsed = patchScheduledBody.safeParse(await request.json().catch(() => null));
            if (!parsed.success) {
              return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);
            }
            // A community post, or a change that moves a post into one, needs `write:communities` as well.
            const own = await loadOwnForKey(userId, p.data.id);
            if (!own.ok) return failureResponse(ctx, own);
            if ((own.row.communityId || parsed.data.communityId) && !hasScope(scopes, 'write:communities')) {
              return error(
                'insufficient_scope',
                'Changing a community post requires the "write:communities" scope, which this key does not have.',
                403,
                { 'X-Accepted-Scope': 'write:scheduled write:communities' },
              );
            }
            const out = await patchScheduledForKey(userId, p.data.id, parsed.data);
            if (!out.ok) return failureResponse(ctx, out);
            return json(out.scheduled);
          },
          { scope: 'write:scheduled', idempotent: true },
        ),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async (ctx) => {
            const p = scheduledPath.safeParse(params);
            if (!p.success) return ctx.error('invalid_request', 'Invalid id.', 400);
            const out = await discardScheduledForKey(ctx.userId, p.data.id);
            if (!out.ok) return failureResponse(ctx, out);
            return ctx.noContent();
          },
          { scope: 'write:scheduled', idempotent: true },
        ),
    },
  },
});
