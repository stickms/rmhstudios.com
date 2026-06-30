import { createFileRoute } from '@tanstack/react-router';
import { deliverDuePending } from '@/lib/webhooks/emit.server';

/**
 * POST /api/cron/webhooks — drain due (pending/retry) webhook deliveries.
 *
 * Internal endpoint, guarded by INTERNAL_API_SECRET. Intended to be hit on a
 * short interval by the platform scheduler. First-attempt delivery happens
 * inline at emit time; this drains retries with exponential backoff.
 */
export const Route = createFileRoute('/api/cron/webhooks')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.INTERNAL_API_SECRET;
        const auth = request.headers.get('authorization');
        if (!secret || auth !== `Bearer ${secret}`) {
          return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const url = new URL(request.url);
        const max = Math.min(parseInt(url.searchParams.get('max') || '50', 10) || 50, 200);
        const attempted = await deliverDuePending(max);
        return Response.json({ attempted });
      },
    },
  },
});
