import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { getShopData } from '@/lib/shop/list.server';

/**
 * GET /api/shop — the catalog plus, for a signed-in user, their coin balance
 * and which items they own/have equipped.
 */
export const Route = createFileRoute('/api/shop/')({
  server: {
    handlers: {
      GET: defineHandler({ auth: 'optional' }, async ({ session }) => {
        return Response.json(await getShopData(session?.user.id ?? null));
      }),
    },
  },
});
