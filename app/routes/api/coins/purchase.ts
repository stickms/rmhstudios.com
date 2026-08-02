import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { debitCoins, getBalance } from '@/lib/economy/ledger.server';
import { purchaseSchema } from '@/lib/coins-schema';

const PRICES = { 'profile-pet': 50 } as const;

export const Route = createFileRoute('/api/coins/purchase')({
  server: {
    handlers: {
      POST: defineHandler(
        { auth: 'none', rateLimit: { limit: 5, windowMs: 60_000, prefix: 'coins-purchase' } },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({ headers: request.headers });
            if (!session?.user?.id) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const body = await request.json();
            const parsed = purchaseSchema.safeParse(body);
            if (!parsed.success) {
              return Response.json(
                { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
                { status: 400 },
              );
            }

            const { item } = parsed.data;
            const price = PRICES[item];
            const userId = session.user.id;

            const result = await prisma.$transaction(async (tx) => {
              await tx.userProfile.upsert({
                where: { userId },
                create: { userId, coins: 10 },
                update: {},
              });

              const owned = await tx.userProfile.findUnique({
                where: { userId },
                select: { hasProfilePet: true },
              });
              if (item === 'profile-pet' && owned?.hasProfilePet) {
                throw new Error('ALREADY_OWNED');
              }

              // Two guards, both conditional updates, both inside one transaction:
              // the grant flip claims the item exactly once, and the debit rejects an
              // overdraft. If the debit fails, the flip rolls back with it — so a user
              // can never end up owning the pet without having paid.
              if (item === 'profile-pet') {
                const claim = await tx.userProfile.updateMany({
                  where: { userId, hasProfilePet: false },
                  data: { hasProfilePet: true },
                });
                if (claim.count === 0) throw new Error('ALREADY_OWNED');
              }
              await debitCoins(userId, price, {
                tx,
                type: 'PURCHASE',
                entityType: 'profile-item',
                entityId: item,
                note: item,
              });

              return { coins: await getBalance(userId, tx) };
            });

            return Response.json({
              success: true,
              newBalance: result?.coins ?? 0,
            });
          } catch (error) {
            if (error instanceof Error) {
              if (error.message === 'INSUFFICIENT_COINS') {
                return Response.json({ error: 'Insufficient coins' }, { status: 400 });
              }
              if (error.message === 'ALREADY_OWNED') {
                return Response.json({ error: 'You already own this item' }, { status: 409 });
              }
            }
            console.error('Coins purchase error:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
