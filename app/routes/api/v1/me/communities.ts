import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { myCommunitiesQuery } from '@/lib/api/v1/communities-schema';
import { listMembershipsForKey } from '@/lib/api/v1/communities.server';

/** GET /api/v1/me/communities — the communities you belong to, with your role and join date, newest first. */
export const Route = createFileRoute('/api/v1/me/communities')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const q = myCommunitiesQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            return json(await listMembershipsForKey(userId, q.data));
          },
          {
            scope: 'read:communities',
          },
        ),
    },
  },
});
