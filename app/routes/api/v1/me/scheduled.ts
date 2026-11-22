import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { hasScope } from '@/lib/api/scopes';
import { createScheduledBody, scheduledListQuery } from '@/lib/api/v1/scheduled-schema';
import { createScheduledForKey, failureResponse, listScheduledForKey } from '@/lib/api/v1/scheduled.server';

/**
 * GET  /api/v1/me/scheduled — your drafts, scheduled posts and time capsules (capsules read-only).
 * POST /api/v1/me/scheduled — save a draft (no `scheduledAt`) or schedule a post.
 */
export const Route = createFileRoute('/api/v1/me/scheduled')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = scheduledListQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query', 400);
            const page = await listScheduledForKey(userId, q.data);
            if (page === 'invalid_cursor') return error('invalid_request', 'Invalid cursor.', 400);
            return json(page);
          },
          { scope: 'read:scheduled' },
        ),

      POST: ({ request }) =>
        withDeveloperApi(
          request,
          async (ctx) => {
            const { userId, json, error, scopes } = ctx;
            const raw = await request.json().catch(() => null);
            const parsed = createScheduledBody.safeParse(raw);
            if (!parsed.success) {
              return error('invalid_request', parsed.error.issues[0]?.message ?? 'Invalid request body', 400);
            }
            // As `POST /api/v1/posts`: a post into a community also needs `write:communities`.
            if (parsed.data.communityId && !hasScope(scopes, 'write:communities')) {
              return error(
                'insufficient_scope',
                'Scheduling into a community requires the "write:communities" scope, which this key does not have.',
                403,
                { 'X-Accepted-Scope': 'write:scheduled write:communities' },
              );
            }
            const out = await createScheduledForKey(userId, parsed.data);
            if (!out.ok) return failureResponse(ctx, out);
            return json(out.scheduled, 201);
          },
          { scope: 'write:scheduled', idempotent: true },
        ),
    },
  },
});
