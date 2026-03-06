import { createAPIFileRoute } from "@tanstack/react-start/api";
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const APIRoute = createAPIFileRoute("/api/versecraft/save")({
  GET: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const [save, progress] = await Promise.all([
    prisma.versecraftSave.findUnique({ where: { userId: session.user.id } }),
    prisma.versecraftProgress.findUnique({ where: { userId: session.user.id } }),
  ]);

  return Response.json({
    saveData: save?.saveData ?? null,
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
  POST: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 20,
    windowMs: 60_000,
    prefix: 'versecraft-save',
  });
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  let body: { saveData?: object; progress?: {
    completedChapters?: string[];
    unlockedEndings?: string[];
    completedRoutes?: string[];
    totalPoemsWritten?: number;
    totalPlaytime?: number;
  } };
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { saveData, progress } = body;
  if (!saveData || typeof saveData !== 'object') {
    return Response.json({ error: 'Missing or invalid saveData' }, { status: 400 });
  }

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
        ...(progress.completedChapters !== undefined && { completedChapters: progress.completedChapters }),
        ...(progress.unlockedEndings !== undefined && { unlockedEndings: progress.unlockedEndings }),
        ...(progress.completedRoutes !== undefined && { completedRoutes: progress.completedRoutes }),
        ...(progress.totalPoemsWritten !== undefined && { totalPoemsWritten: progress.totalPoemsWritten }),
        ...(progress.totalPlaytime !== undefined && { totalPlaytime: progress.totalPlaytime }),
      },
    });
  }

  return Response.json({ success: true, updatedAt: save.updatedAt });
},
});
