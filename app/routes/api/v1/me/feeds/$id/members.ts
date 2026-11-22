import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { feedPath, replaceMembersBody } from '@/lib/api/v1/feeds-schema';
import { replaceMembersForKey } from '@/lib/api/v1/feeds.server';
import { MAX_MEMBERS } from '@/lib/lists/constants';

/** PUT /api/v1/me/feeds/{id}/members — replace your list's members by handle (at most 500). */
export const Route = createFileRoute('/api/v1/me/feeds/$id/members')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      PUT: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = feedPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid list.', 400);
            const raw = await request.json().catch(() => null);
            const body = replaceMembersBody.safeParse(raw);
            if (!body.success) {
              return error('invalid_request', body.error.issues[0]?.message ?? 'Invalid request body.', 400);
            }
            const out = await replaceMembersForKey(userId, p.data.id, body.data.handles);
            if (!out.ok) {
              return out.reason === 'too_many'
                ? error('invalid_request', `A list holds at most ${MAX_MEMBERS} members.`, 400)
                : error('not_found', 'List not found.', 404);
            }
            return json({ id: p.data.id, memberCount: out.members.length, members: out.members, skipped: out.skipped });
          },
          { scope: 'write:feeds', idempotent: true },
        ),
    },
  },
});
