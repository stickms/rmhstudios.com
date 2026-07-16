import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { z } from 'zod';
import { getShopItem } from '@/lib/shop/catalog';
import { invalidateUserDisplay } from '@/lib/user-display.server';

/**
 * POST /api/shop/equip — equip or unequip an owned cosmetic.
 * Body: { itemId, equipped }. Equipping one item unequips others of the same kind.
 */
const schema = z.object({ itemId: z.string().min(1).max(64), equipped: z.boolean() });

export const Route = createFileRoute('/api/shop/equip')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const item = getShopItem(parsed.data.itemId);
          if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });
          const userId = session.user.id;

          const owned = await prisma.userInventory.findUnique({
            where: { userId_itemId: { userId, itemId: item.id } },
            select: { id: true },
          });
          if (!owned) return Response.json({ error: 'You do not own this item' }, { status: 403 });

          if (parsed.data.equipped) {
            // Only one item per kind may be equipped.
            await prisma.$transaction([
              prisma.userInventory.updateMany({
                where: { userId, kind: item.kind, equipped: true },
                data: { equipped: false },
              }),
              prisma.userInventory.update({
                where: { userId_itemId: { userId, itemId: item.id } },
                data: { equipped: true },
              }),
            ]);
          } else {
            await prisma.userInventory.update({
              where: { userId_itemId: { userId, itemId: item.id } },
              data: { equipped: false },
            });
          }

          // The equipped-cosmetics set feeds the cached feed author display —
          // drop it so the user's own next feed read reflects the change now.
          invalidateUserDisplay(userId);

          return Response.json({ success: true, equipped: parsed.data.equipped });
        } catch (error) {
          console.error('Shop equip error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
