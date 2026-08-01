import { createFileRoute } from '@tanstack/react-router';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/versecraft/progress')({
  server: {
    handlers: {
      GET: defineHandler(
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
    },
  },
});
