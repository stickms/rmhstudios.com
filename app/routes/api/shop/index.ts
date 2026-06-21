import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { SHOP_ITEMS } from '@/lib/shop/catalog';

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

          let coins = 0;
          let owned = new Map<string, boolean>();
          if (session) {
            const [profile, inv] = await Promise.all([
              prisma.userProfile.findUnique({ where: { userId: session.user.id }, select: { coins: true } }),
              prisma.userInventory.findMany({ where: { userId: session.user.id }, select: { itemId: true, equipped: true } }),
            ]);
            coins = profile?.coins ?? 0;
            owned = new Map(inv.map((i) => [i.itemId, i.equipped]));
          }

          const items = SHOP_ITEMS.map((i) => ({
            ...i,
            owned: owned.has(i.id),
            equipped: owned.get(i.id) ?? false,
          }));

          return Response.json({ coins, items, signedIn: !!session });
        } catch (error) {
          console.error('Shop list error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
