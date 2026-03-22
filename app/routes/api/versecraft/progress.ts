import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export const Route = createFileRoute('/api/versecraft/progress')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  const session = await auth.api.getSession({ headers: request.headers });
  if (!session?.user?.id) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 20,
    windowMs: 60_000,
    prefix: 'versecraft-progress',
  });
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

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
    },
  },
});
