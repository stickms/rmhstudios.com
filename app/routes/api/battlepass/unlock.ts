import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { CURRENT_SEASON } from '@/lib/battlepass/season';

/** POST /api/battlepass/unlock — unlock the premium track by spending RMH coins. */
export const Route = createFileRoute('/api/battlepass/unlock')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'bp-unlock' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const userId = session.user.id;
          const price = CURRENT_SEASON.premiumPrice;

          await prisma.$transaction(async (tx) => {
            await tx.userSeasonProgress.upsert({
              where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
              create: { userId, seasonId: CURRENT_SEASON.id },
              update: {},
            });
            // Atomically claim the premium flag (false→true). Concurrent unlocks
            // race here; only the one that actually flips it proceeds to charge,
            // so premium can never be bought twice.
            const flip = await tx.userSeasonProgress.updateMany({
              where: { userId, seasonId: CURRENT_SEASON.id, premium: false },
              data: { premium: true },
            });
            if (flip.count === 0) throw new Error('ALREADY_PREMIUM');

            await tx.userProfile.upsert({
              where: { userId },
              create: { userId, coins: 10 },
              update: {},
            });
            // Atomic conditional debit; if it fails the premium flip above rolls back.
            const debit = await tx.userProfile.updateMany({
              where: { userId, coins: { gte: price } },
              data: { coins: { decrement: price } },
            });
            if (debit.count === 0) throw new Error('INSUFFICIENT_COINS');
            await tx.coinTransaction.create({
              data: { recipientId: userId, amount: -price, type: 'PURCHASE', entityType: 'battlepass', entityId: CURRENT_SEASON.id, note: 'Premium pass' },
            });
          });

          return Response.json({ success: true });
        } catch (error) {
          if (error instanceof Error) {
            if (error.message === 'ALREADY_PREMIUM') return Response.json({ error: 'Already unlocked' }, { status: 409 });
            if (error.message === 'INSUFFICIENT_COINS') return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Battlepass unlock error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
