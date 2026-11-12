import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { abandonSignalForgeRunApi } from '@features/signal-forge/engine/signal-forge.contract';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

export const route = apiRoute('/api/signal-forge/abandon', {
  POST: implement(
    abandonSignalForgeRunApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-abandon' } },
    async ({ session }) => {
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
    },
  ),
});
