import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
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
      POST: defineHandler({ body: schema, allowEmptyBody: true }, async ({ session, body }) => {
        const item = getShopItem(body.itemId);
        if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });
        const userId = session.user.id;

        const owned = await prisma.userInventory.findUnique({
          where: { userId_itemId: { userId, itemId: item.id } },
          select: { id: true },
        });
        if (!owned) return Response.json({ error: 'You do not own this item' }, { status: 403 });

        if (body.equipped) {
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

        return Response.json({ success: true, equipped: body.equipped });
      }),
    },
  },
});
