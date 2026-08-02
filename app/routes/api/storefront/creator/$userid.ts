import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { listStorefront } from '@/lib/storefront.server';

/**
 * GET /api/storefront/creator/$userid — a creator's storefront. Resolves by
 * handle or id. Deliverables are only included for the owner or buyers.
 */
export const Route = createFileRoute('/api/storefront/creator/$userid')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ params, session }) => {
        const result = await listStorefront(params.userid, session?.user?.id ?? null);
        if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
        return Response.json(result);
      }),
    },
  },
});
