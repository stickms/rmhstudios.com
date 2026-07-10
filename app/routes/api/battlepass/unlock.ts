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
            const sp = await tx.userSeasonProgress.upsert({
              where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
              create: { userId, seasonId: CURRENT_SEASON.id },
              update: {},
              select: { premium: true },
            });
            if (sp.premium) throw new Error('ALREADY_PREMIUM');

            const profile = await tx.userProfile.upsert({
              where: { userId },
              create: { userId, coins: 10 },
              update: {},
              select: { coins: true },
            });
            if (profile.coins < price) throw new Error('INSUFFICIENT_COINS');

            await tx.userProfile.update({ where: { userId }, data: { coins: { decrement: price } } });
            await tx.userSeasonProgress.update({
              where: { userId_seasonId: { userId, seasonId: CURRENT_SEASON.id } },
              data: { premium: true },
            });
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
