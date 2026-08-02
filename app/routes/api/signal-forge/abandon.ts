import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';

export const Route = createFileRoute('/api/signal-forge/abandon')({
  server: {
    handlers: {
      POST: defineHandler(
        {
          auth: 'none',
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-abandon' },
        },
        async ({ request }) => {
          try {
            const session = await auth.api.getSession({
              headers: request.headers,
            });

            if (!session) {
              return Response.json({ error: 'Unauthorized' }, { status: 401 });
            }

            const profile = await prisma.signalForgePlayer.findUnique({
              where: { userId: session.user.id },
            });

            if (profile) {
              await prisma.signalForgePlayer.update({
                where: { userId: session.user.id },
                data: { savedRunState: Prisma.DbNull },
              });
            }

            return Response.json({ success: true });
          } catch (error) {
            console.error('Error abandoning Signal Forge run:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
