import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { communityPath, createSanctionApiBody, sanctionsQuery } from '@/lib/api/v1/moderation-schema';
import {
  createSanctionForKey,
  hourlyBudgetExceeded,
  listSanctionsForKey,
  moderatedCommunity,
  writeBudgetExceeded,
} from '@/lib/api/v1/moderation.server';

/**
 * GET  /api/v1/communities/{slug}/sanctions — current timeouts and bans (?active=true, the default), or the lifted
 *      and ended ones (?active=false); newest first, paged by ?cursor.
 * POST /api/v1/communities/{slug}/sanctions — time out or ban a member by handle, through the site's `sanction`.
 *      At most 30 sanctions a key an hour.
 */
export const Route = createFileRoute('/api/v1/communities/$slug/sanctions')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      GET: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, json, error }) => {
            const p = communityPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid community.', 400);
            const q = sanctionsQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
            if (!q.success) return error('invalid_request', q.error.issues[0]?.message ?? 'Invalid query.', 400);
            const guard = await moderatedCommunity(p.data.slug, userId);
            if (!guard.ok) return error(guard.code, guard.message, guard.status);
            return json(
              await listSanctionsForKey(guard.result, {
                active: q.data.active === 'true',
                limit: q.data.limit,
                cursor: q.data.cursor,
              }),
            );
          },
          {
            scope: 'manage:moderation',
          },
        ),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, keyId, json, error }) => {
            const p = communityPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid community.', 400);
            const body = createSanctionApiBody.safeParse(await request.json().catch(() => null));
            if (!body.success) return error('invalid_request', body.error.issues[0]?.message ?? 'Invalid body.', 400);
            const guard = await moderatedCommunity(p.data.slug, userId);
            if (!guard.ok) return error(guard.code, guard.message, guard.status);
            if ((await writeBudgetExceeded(userId)) || (await hourlyBudgetExceeded(keyId, 'sanction')))
              return error('rate_limited', 'Too many sanctions. Slow down.', 429);
            const out = await createSanctionForKey(guard.result, userId, body.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result, 201);
          },
          {
            scope: 'manage:moderation',
            idempotent: true,
          },
        ),
    },
  },
});
