import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { getShopData } from '@/lib/shop/list.server';

/**
 * GET /api/shop — the catalog plus, for a signed-in user, their coin balance
 * and which items they own/have equipped.
 */
export const Route = createFileRoute('/api/shop/')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers }).catch(() => null);
          return Response.json(await getShopData(session?.user.id ?? null));
        } catch (error) {
          console.error('Shop list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
