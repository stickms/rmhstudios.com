import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const route = apiRoute('/api/coins', {
  GET: defineHandler({}, async ({ session }) => {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { coins: true },
    });

    return Response.json({
      coins: profile?.coins ?? 10,
    });
  }),
});
