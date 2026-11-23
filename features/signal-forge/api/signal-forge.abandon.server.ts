import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { abandonSignalForgeRunApi } from '@features/signal-forge/engine/signal-forge.contract';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/signal-forge/abandon: drop the run in progress. A v2 blob keeps its progression (`meta`: the
 * ascension unlocked, wins, the tutorial flag); anything older is cleared outright.
 */
export const route = apiRoute('/api/signal-forge/abandon', {
  POST: implement(
    abandonSignalForgeRunApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'signal-forge-abandon' } },
    async ({ session }) => {
      const profile = await prisma.signalForgePlayer.findUnique({
        where: { userId: session.user.id },
        select: { savedRunState: true },
      });

      if (profile) {
        const saved = profile.savedRunState as Record<string, unknown> | null;
        const keep = saved && typeof saved === 'object' && saved.v === 2 && saved.meta ? { v: 2, run: null, meta: saved.meta } : null;
        await prisma.signalForgePlayer.update({
          where: { userId: session.user.id },
          data: { savedRunState: keep ? (keep as Prisma.InputJsonValue) : Prisma.DbNull },
        });
      }

      return Response.json({ success: true });
    },
  ),
});
