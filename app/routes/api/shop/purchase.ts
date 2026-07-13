import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { getShopItem } from '@/lib/shop/catalog';
import { getUserTier, TIER_RANK } from '@/lib/entitlements';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/shop/purchase — buy a cosmetic with coins. Body: { itemId }. */
const schema = z.object({ itemId: z.string().min(1).max(64) });

export const Route = createFileRoute('/api/shop/purchase')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'shop-purchase' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid input' }, { status: 400 });

          const item = getShopItem(parsed.data.itemId);
          if (!item) return Response.json({ error: 'Item not found' }, { status: 404 });

          const userId = session.user.id;

          // Tier gate for premium items.
          if (item.requiresTier) {
            const tier = await getUserTier(userId);
            if (TIER_RANK[tier] < TIER_RANK[item.requiresTier]) {
              return Response.json({ error: `Requires the ${item.requiresTier} plan` }, { status: 403 });
            }
          }

          await prisma.$transaction(async (tx) => {
            const existing = await tx.userInventory.findUnique({
              where: { userId_itemId: { userId, itemId: item.id } },
              select: { id: true },
            });
            if (existing) throw new Error('ALREADY_OWNED');

            await tx.userProfile.upsert({
              where: { userId },
              create: { userId, coins: 10 },
              update: {},
            });
            // Atomic conditional debit — the `coins >= price` guard in the WHERE
            // clause stops concurrent purchases overdrafting on a stale balance.
            const debit = await tx.userProfile.updateMany({
              where: { userId, coins: { gte: item.price } },
              data: { coins: { decrement: item.price } },
            });
            if (debit.count === 0) throw new Error('INSUFFICIENT_COINS');
            await tx.userInventory.create({ data: { userId, itemId: item.id, kind: item.kind } });
            await tx.coinTransaction.create({
              data: { recipientId: userId, amount: -item.price, type: 'PURCHASE', entityType: 'shop', entityId: item.id, note: item.name },
            });
          });

          await grantAchievement(userId, 'economy.first_purchase');

          const profile = await prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } });
          return Response.json({ success: true, newBalance: profile?.coins ?? 0 });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === 'ALREADY_OWNED') return Response.json({ error: 'You already own this item' }, { status: 409 });
            if (error.message === 'INSUFFICIENT_COINS') return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Shop purchase error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
