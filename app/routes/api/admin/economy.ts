/**
 * GET /api/admin/economy — coin supply health. Admin only.
 * Query: ?days=<1..365> (default 30).
 */

import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getEconomySnapshot } from '@/lib/economy/supply.server';

export const Route = createFileRoute('/api/admin/economy')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session || !(session.user as { isAdmin?: boolean }).isAdmin) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const raw = Number(new URL(request.url).searchParams.get('days'));
          const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;

          return Response.json(await getEconomySnapshot(days), {
            // A few aggregates over an append-only table; a short cache keeps a
            // refreshing dashboard from re-running them on every keystroke.
            headers: { 'Cache-Control': 'private, max-age=30' },
          });
        } catch (error) {
          console.error('admin economy error:', error);
          return Response.json({ error: 'Internal server error' }, { status: 500 });
        }
      },
    },
  },
});
