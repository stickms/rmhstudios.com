import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/coins/')({
  server: {
    handlers: {
      GET: defineHandler({}, async ({ session }) => {
        const profile = await prisma.userProfile.findUnique({
          where: { userId: session.user.id },
          select: { coins: true },
        });

        return Response.json({
          coins: profile?.coins ?? 10,
        });
      }),
    },
  },
});
