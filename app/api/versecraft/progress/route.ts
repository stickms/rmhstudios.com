import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { prisma } from '@/lib/prisma';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

export async function GET(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 20,
    windowMs: 60_000,
    prefix: 'versecraft-progress',
  });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  const progress = await prisma.versecraftProgress.findUnique({
    where: { userId: session.user.id },
  });

  return NextResponse.json({
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
}
