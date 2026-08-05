import { createFileRoute } from '@tanstack/react-router';
import { timingSafeStringEqual } from '@/lib/internal-auth';
import { reverifyStaleProfileLinks } from '@/lib/profile-links/verify.server';

/**
 * POST /api/profile-links/reverify — re-run the `rel="me"` check on links whose
 * verification has gone stale (J1 §5, "re-verify on a schedule").
 *
 * Internal endpoint guarded by `INTERNAL_API_SECRET`, in the shape
 * `/api/cron/webhooks` established — there is no cron in the web tier, so the
 * sweep is driven by the platform scheduler rather than by a timer in the SSR
 * process.
 *
 * Only *currently verified* links are swept, and a link that has stopped
 * matching loses its mark **silently**. The batch is small and capped so one
 * tick cannot turn the site into a crawler.
 */
export const Route = createFileRoute('/api/profile-links/reverify')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_API_SECRET;
        const authorization = request.headers.get('authorization');
        if (
          !secret ||
          !authorization ||
          !timingSafeStringEqual(authorization, `Bearer ${secret}`)
        ) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const url = new URL(request.url);
        const requested = Number.parseInt(url.searchParams.get('max') ?? '25', 10);
        const batchSize = Math.min(Number.isFinite(requested) ? Math.max(1, requested) : 25, 100);
        const result = await reverifyStaleProfileLinks({ batchSize });
        return Response.json(result);
      },
    },
  },
});
