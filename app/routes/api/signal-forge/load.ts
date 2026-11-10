import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { loadSignalForgeRunApi } from '@/lib/signal-forge/signal-forge.contract';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/signal-forge/load')({
  server: {
    handlers: {
      GET: implement(
        loadSignalForgeRunApi,
        { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-load' } },
        async ({ session }) => {
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
        },
      ),
    },
  },
});
