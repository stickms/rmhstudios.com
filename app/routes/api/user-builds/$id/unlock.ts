import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { createNotification } from '@/lib/notifications.server';
import { grantAchievement } from '@/lib/achievements/engine.server';

/**
 * POST /api/user-builds/$id/unlock — pay a build's price (coins → creator,
 * minus a 10% platform fee burned as a sink) to permanently reveal its
 * readme/repo/demo. Idempotent for owners, free builds, and prior buyers.
 */
const FEE_RATE = 0.1;

export const Route = createFileRoute('/api/user-builds/$id/unlock')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 20, windowMs: 60_000, prefix: 'build-unlock' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const userId = session.user.id;
          const build = await prisma.userBuild.findUnique({
            where: { id: params.id },
            select: { id: true, userId: true, price: true, readme: true, repoUrl: true, demoUrl: true },
          });
          if (!build) {
            // Allow slug lookups too.
            const bySlug = await prisma.userBuild.findUnique({
              where: { slug: params.id },
              select: { id: true, userId: true, price: true, readme: true, repoUrl: true, demoUrl: true },
            });
            if (!bySlug) return Response.json({ error: 'Build not found' }, { status: 404 });
            return await doUnlock(bySlug, userId, session.user.name ?? 'Someone');
          }
          return await doUnlock(build, userId, session.user.name ?? 'Someone');
        } catch (error) {
          if (error instanceof Error && error.message === 'INSUFFICIENT_COINS') {
            return Response.json({ error: 'Not enough coins' }, { status: 400 });
          }
          console.error('Build unlock error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});

async function doUnlock(
  build: { id: string; userId: string; price: number | null; readme: string | null; repoUrl: string | null; demoUrl: string | null },
  userId: string,
  buyerName: string
) {
  const reveal = { readme: build.readme, repoUrl: build.repoUrl, demoUrl: build.demoUrl };
  const price = build.price ?? 0;

  if (build.userId === userId || price <= 0) {
    return Response.json({ success: true, ...reveal, alreadyUnlocked: true });
  }

  const already = await prisma.buildUnlock.findUnique({
    where: { userId_buildId: { userId, buildId: build.id } },
    select: { id: true },
  });
  if (already) return Response.json({ success: true, ...reveal, alreadyUnlocked: true });

  const fee = Math.floor(price * FEE_RATE);
  const payout = price - fee;

  await prisma.$transaction(async (tx) => {
    const buyer = await tx.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
      select: { coins: true },
    });
    if (buyer.coins < price) throw new Error('INSUFFICIENT_COINS');

    await tx.userProfile.update({ where: { userId }, data: { coins: { decrement: price } } });
    await tx.userProfile.upsert({
      where: { userId: build.userId },
      create: { userId: build.userId, coins: 10 + payout },
      update: { coins: { increment: payout } },
    });
    await tx.buildUnlock.create({ data: { userId, buildId: build.id, pricePaid: price } });
    await tx.coinTransaction.create({
      data: { senderId: userId, recipientId: build.userId, amount: payout, type: 'PURCHASE', entityType: 'build', entityId: build.id, note: 'Build unlock' },
    });
  });

  await createNotification({
    userId: build.userId,
    actorId: userId,
    type: 'SYSTEM',
    entityType: 'build',
    entityId: build.id,
    preview: `${buyerName} unlocked your build for ${price} coins`,
  }).catch(() => {});
  await grantAchievement(build.userId, 'creator.first_sale').catch(() => {});

  return Response.json({ success: true, ...reveal });
}
