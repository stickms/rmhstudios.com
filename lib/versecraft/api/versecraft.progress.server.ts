import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getVersecraftProgressApi } from '@/lib/versecraft/versecraft.contract';
import { prisma } from '@/lib/prisma.server';

export const route = apiRoute('/api/versecraft/progress', {
  GET: implement(
    getVersecraftProgressApi,
    { rateLimit: { limit: 20, windowMs: 60_000, prefix: 'versecraft-progress' } },
    async ({ session }) => {
      const progress = await prisma.versecraftProgress.findUnique({
        where: { userId: session.user.id },
      });

      return Response.json({
        progress: progress
          ? {
              completedChapters: progress.completedChapters,
              unlockedEndings: progress.unlockedEndings,
              completedRoutes: progress.completedRoutes,
              totalPoemsWritten: progress.totalPoemsWritten,
              totalPlaytime: progress.totalPlaytime,
            }
          : null,
      });
    },
  ),
});
