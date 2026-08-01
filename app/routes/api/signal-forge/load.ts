import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { auth } from '@/lib/auth';

export const Route = createFileRoute('/api/signal-forge/load')({
  server: {
    handlers: {
      GET: defineHandler(
        { auth: 'none', rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-load' } },
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
              select: { savedRunState: true },
            });

            if (!profile || !profile.savedRunState) {
              return Response.json({ hasSavedRun: false });
            }

            return Response.json({
              hasSavedRun: true,
              runState: profile.savedRunState,
            });
          } catch (error) {
            console.error('Error loading Signal Forge run:', error);
            return Response.json({ error: 'Internal Server Error' }, { status: 500 });
          }
        },
      ),
    },
  },
});
