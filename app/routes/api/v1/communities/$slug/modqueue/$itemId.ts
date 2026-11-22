import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { decisionBody, itemPath } from '@/lib/api/v1/moderation-schema';
import {
  decideForKey,
  hourlyBudgetExceeded,
  moderatedCommunity,
  writeBudgetExceeded,
} from '@/lib/api/v1/moderation.server';

/**
 * POST /api/v1/communities/{slug}/modqueue/{itemId} — approve or remove a held or flagged item as the key owner,
 * through the site's `decideModItem` (alerts on approval, the rule citation and the author's notice on removal, the
 * mod log). At most 120 decisions a key an hour.
 */
export const Route = createFileRoute('/api/v1/communities/$slug/modqueue/$itemId')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      POST: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, keyId, json, error }) => {
            const p = itemPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid path.', 400);
            const body = decisionBody.safeParse(await request.json().catch(() => null));
            if (!body.success) return error('invalid_request', body.error.issues[0]?.message ?? 'Invalid body.', 400);
            const guard = await moderatedCommunity(p.data.slug, userId);
            if (!guard.ok) return error(guard.code, guard.message, guard.status);
            if ((await writeBudgetExceeded(userId)) || (await hourlyBudgetExceeded(keyId, 'decision')))
              return error('rate_limited', 'Too many decisions. Slow down.', 429);
            const out = await decideForKey(guard.result, userId, p.data.itemId, body.data);
            if (!out.ok) return error(out.code, out.message, out.status);
            return json(out.result);
          },
          {
            scope: 'manage:moderation',
            idempotent: true,
          },
        ),
    },
  },
});
