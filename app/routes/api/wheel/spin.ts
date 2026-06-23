import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { WHEEL_SEGMENTS, pickSegment, wheelDateKey } from '@/lib/wheel/wheel';
import { awardXp } from '@/lib/xp/engine.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/** POST /api/wheel/spin — take today's free spin (idempotent per UTC day). */
export const Route = createFileRoute('/api/wheel/spin')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'wheel-spin' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const userId = session.user.id;
          const dateKey = wheelDateKey();
          const segment = pickSegment();
          const reward = WHEEL_SEGMENTS[segment].reward;

          // The unique [userId, dateKey] guarantees one spin/day even under a
          // double-submit; a duplicate insert throws P2002 and we 409.
          try {
            const result = await prisma.$transaction(async (tx) => {
              await tx.dailyWheelSpin.create({ data: { userId, dateKey, reward, segment } });
              const profile = await tx.userProfile.upsert({
                where: { userId },
                create: { userId, coins: 10 + reward },
                update: { coins: { increment: reward } },
                select: { coins: true },
              });
              await tx.coinTransaction.create({
                data: {
                  recipientId: userId,
                  amount: reward,
                  type: 'REWARD',
                  entityType: 'wheel',
                  entityId: dateKey,
                  note: 'Daily wheel spin',
                },
              });
              return profile.coins;
            });

            await awardXp(userId, 10);
            await grantAchievement(userId, 'economy.first_wheel').catch(() => {});

            return Response.json({ segment, reward, newBalance: result });
          } catch (e) {
            if (e && typeof e === 'object' && 'code' in e && (e as { code: string }).code === 'P2002') {
              return Response.json({ error: 'Already spun today' }, { status: 409 });
            }
            throw e;
          }
        } catch (error) {
          console.error('Wheel spin error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
