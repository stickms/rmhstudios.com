import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listHeldListings } from '@/lib/market/market.server';

/**
 * GET /api/admin/market — marketplace listings HELD for anomaly review (a buy
 * at ≥10× the item's 30-day median froze them), oldest first. Admin only.
 */
export const Route = createFileRoute('/api/admin/market/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'admin' }, async () =>
        Response.json({ listings: await listHeldListings() }),
      ),
    },
  },
});
