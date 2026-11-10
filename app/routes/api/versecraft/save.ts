import { createFileRoute } from '@tanstack/react-router';
import { implement } from '@/lib/api/implement.server';
import { versecraftSaveBody } from '@/lib/versecraft/save-schema';
import { loadVersecraftSaveApi, saveVersecraftApi } from '@/lib/versecraft/versecraft.contract';
import type { GameState } from '@/lib/versecraft/types';
import { prisma } from '@/lib/prisma.server';

export const Route = createFileRoute('/api/versecraft/save')({
  server: {
    handlers: {
      GET: implement(loadVersecraftSaveApi, {}, async ({ session }) => {
        const [save, progress] = await Promise.all([
          prisma.versecraftSave.findUnique({ where: { userId: session.user.id } }),
          prisma.versecraftProgress.findUnique({ where: { userId: session.user.id } }),
        ]);

        return {
          saveData: (save?.saveData ?? null) as GameState | null,
          progress: progress
            ? {
                completedChapters: progress.completedChapters,
                unlockedEndings: progress.unlockedEndings,
                completedRoutes: progress.completedRoutes,
                totalPoemsWritten: progress.totalPoemsWritten,
                totalPlaytime: progress.totalPlaytime,
              }
            : null,
        };
      }),
      POST: implement(
        saveVersecraftApi,
        {
          rateLimit: { limit: 20, windowMs: 60_000, prefix: 'versecraft-save' },
          body: versecraftSaveBody,
          // A body that is not JSON (or not an object) was 'Invalid JSON body'; a missing/non-object saveData was its own text.
          invalid: (error) =>
            Response.json(
              {
                error: error.issues.some((i) => i.path[0] === 'saveData')
                  ? 'Missing or invalid saveData'
                  : 'Invalid JSON body',
              },
              { status: 400 },
            ),
        },
        async ({ session, body }) => {
          const { saveData, progress } = body;

          // Validate body size (max 500KB)
          const bodyStr = JSON.stringify(saveData);
          if (bodyStr.length > 500_000) {
            return Response.json({ error: 'Payload too large' }, { status: 413 });
          }

          const userId = session.user.id;

          // Upsert save data
          const save = await prisma.versecraftSave.upsert({
            where: { userId },
            create: { userId, saveData },
            update: { saveData },
          });

          // Upsert progress if provided
          if (progress && typeof progress === 'object') {
            await prisma.versecraftProgress.upsert({
              where: { userId },
              create: {
                userId,
                completedChapters: progress.completedChapters ?? [],
                unlockedEndings: progress.unlockedEndings ?? [],
                completedRoutes: progress.completedRoutes ?? [],
                totalPoemsWritten: progress.totalPoemsWritten ?? 0,
                totalPlaytime: progress.totalPlaytime ?? 0,
              },
              update: {
                ...(progress.completedChapters !== undefined && {
                  completedChapters: progress.completedChapters,
                }),
                ...(progress.unlockedEndings !== undefined && {
                  unlockedEndings: progress.unlockedEndings,
                }),
                ...(progress.completedRoutes !== undefined && {
                  completedRoutes: progress.completedRoutes,
                }),
                ...(progress.totalPoemsWritten !== undefined && {
                  totalPoemsWritten: progress.totalPoemsWritten,
                }),
                ...(progress.totalPlaytime !== undefined && {
                  totalPlaytime: progress.totalPlaytime,
                }),
              },
            });
          }

          return { success: true as const, updatedAt: save.updatedAt.toISOString() };
        },
      ),
    },
  },
});
