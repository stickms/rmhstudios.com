import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { communityPath } from '@/lib/api/v1/communities-schema';
import { getRulesForKey } from '@/lib/api/v1/communities.server';

/** GET /api/v1/communities/{slug}/rules — the rules as the site shows them, in order. */
export const Route = createFileRoute('/api/v1/communities/$slug/rules')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = communityPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid community.', 400);
            const rules = await getRulesForKey(p.data.slug, userId);
            if (!rules) return error('not_found', 'Community not found.', 404);
            return json({
              data: rules,
            });
          },
          {
            scope: 'read:communities',
          },
        ),
    },
  },
});
