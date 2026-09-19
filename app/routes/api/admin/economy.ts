/**
 * GET /api/admin/economy — coin supply health. Admin only.
 * Query: ?days=<1..365> (default 30).
 *
 * Two halves, and they answer different questions:
 *
 *   - `snapshot` is what HAS happened, aggregated from the ledger.
 *   - `flows` is what CAN happen, enumerated from the source (W7). It needs no
 *     database, so it is the half that still answers on a fresh environment,
 *     and it is the half to read before adding another faucet.
 */

import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getEconomySnapshot } from '@/lib/economy/supply.server';
import { COIN_FLOWS, supplyShape } from '@/lib/economy/flows';

export const Route = createFileRoute('/api/admin/economy')({
  server: {
    handlers: {
      // `auth: 'admin'` rather than the hand-rolled isAdmin check this route
      // used to carry — CLAUDE.md §3: admin routes take the mode, so the
      // 401-vs-403 distinction is made in one place instead of per route.
      GET: defineHandler({ auth: 'admin' }, async ({ request }) => {
        const raw = Number(new URL(request.url).searchParams.get('days'));
        const days = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 365) : 30;

        return Response.json(
          {
            snapshot: await getEconomySnapshot(days),
            flows: COIN_FLOWS,
            shape: supplyShape(),
          },
          {
            // A few aggregates over an append-only table; a short cache keeps a
            // refreshing dashboard from re-running them on every keystroke.
            headers: { 'Cache-Control': 'private, max-age=30' },
          },
        );
      }),
    },
  },
});
