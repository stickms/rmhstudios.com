import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { listStorefront } from '@/lib/storefront.server';

/**
 * GET /api/storefront/creator/$userid — a creator's storefront. Resolves by
 * handle or id. Deliverables are only included for the owner or buyers.
 */
export const Route = createFileRoute('/api/storefront/creator/$userid')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          const result = await listStorefront(params.userid, session?.user?.id ?? null);
          if (!result) return Response.json({ error: 'Not found' }, { status: 404 });
          return Response.json(result);
        } catch (error) {
          console.error('Storefront list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
