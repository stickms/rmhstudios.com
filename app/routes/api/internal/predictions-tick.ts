import { createFileRoute } from '@tanstack/react-router';
import { authorizeInternalRequest } from '@/lib/internal-auth';
import { runAutoMarketTick } from '@/lib/predictions/auto-markets.server';

// Server-to-server driver for the self-referential market tick (seed + settle).
// A worker (Go supervisor job, cron, or the Node bot-worker) can POST here on an
// interval instead of relying only on the opportunistic tick in the markets GET.
// Guarded by the shared internal secret.
export const Route = createFileRoute('/api/internal/predictions-tick')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authz = authorizeInternalRequest(
          request.headers.get('x-internal-secret'),
          process.env.INTERNAL_API_SECRET,
        );
        if (!authz.ok) return Response.json({ error: 'Unauthorized' }, { status: authz.status });
        try {
          const result = await runAutoMarketTick();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error('Predictions tick error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
