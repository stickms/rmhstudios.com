import { createFileRoute } from '@tanstack/react-router';
import { withDeveloperApi, apiOptions } from '@/lib/api/with-developer-api.server';
import { sanctionPath } from '@/lib/api/v1/moderation-schema';
import {
  hourlyBudgetExceeded,
  liftSanctionForKey,
  moderatedCommunity,
  writeBudgetExceeded,
} from '@/lib/api/v1/moderation.server';

/** DELETE /api/v1/communities/{slug}/sanctions/{id} — lift a timeout or ban early, through the site's `lift`. Counts against the 30 sanctions a key an hour. */
export const Route = createFileRoute('/api/v1/communities/$slug/sanctions/$id')({
  server: {
    handlers: {
      OPTIONS: () => apiOptions(),

      DELETE: ({ request, params }) =>
        withDeveloperApi(
          request,
          async ({ userId, keyId, noContent, error }) => {
            const p = sanctionPath.safeParse(params);
            if (!p.success) return error('invalid_request', p.error.issues[0]?.message ?? 'Invalid path.', 400);
            const guard = await moderatedCommunity(p.data.slug, userId);
            if (!guard.ok) return error(guard.code, guard.message, guard.status);
            if ((await writeBudgetExceeded(userId)) || (await hourlyBudgetExceeded(keyId, 'sanction')))
              return error('rate_limited', 'Too many sanctions. Slow down.', 429);
            const out = await liftSanctionForKey(guard.result, userId, p.data.id);
            if (!out.ok) return error(out.code, out.message, out.status);
            return noContent();
          },
          {
            scope: 'manage:moderation',
            idempotent: true,
          },
        ),
    },
  },
});
