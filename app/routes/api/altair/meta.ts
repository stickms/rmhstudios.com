import { createAPIFileRoute } from "@tanstack/react-start/api";
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/** GET — Load meta progress from database. */

/** POST — Save meta progress to database. */

export const APIRoute = createAPIFileRoute("/api/altair/meta")({
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progress = await prisma.altairMetaProgress.findUnique({
      where: { userId: session.user.id },
    });

    if (!progress) {
      return Response.json({ data: null });
    }

    return Response.json({
      data: {
        coins: progress.coins,
        upgrades: progress.upgrades as Record<string, number>,
        unlockedClasses: progress.unlockedClasses as string[],
        doubleTimeUnlocked: progress.doubleTimeUnlocked,
        classFirstClears: progress.classFirstClears as string[],
        totalRunsPlayed: progress.totalRunsPlayed,
        bestTimeSurvived: progress.bestTimeSurvived,
        bestKills: progress.bestKills,
        bossesDefeated: progress.bossesDefeated as string[],
        bestiary: (progress as Record<string, unknown>).bestiary ?? {},
      },
    });
  } catch (e) {
    console.error('Altair meta load failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'altair-meta' });
  if (!allowed) {
    return Response.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      coins,
      upgrades,
      unlockedClasses,
      doubleTimeUnlocked,
      classFirstClears,
      totalRunsPlayed,
      bestTimeSurvived,
      bestKills,
      bossesDefeated,
      bestiary,
    } = body;

    // Basic validation
    if (typeof coins !== 'number' || coins < 0 || coins > 100_000_000) {
      return Response.json({ error: 'Invalid coins' }, { status: 400 });
    }
    if (typeof upgrades !== 'object' || upgrades === null) {
      return Response.json({ error: 'Invalid upgrades' }, { status: 400 });
    }
    if (!Array.isArray(unlockedClasses)) {
      return Response.json({ error: 'Invalid unlockedClasses' }, { status: 400 });
    }

    await prisma.altairMetaProgress.upsert({
      where: { userId: session.user.id },
      create: {
        userId: session.user.id,
        coins,
        upgrades,
        unlockedClasses,
        doubleTimeUnlocked: !!doubleTimeUnlocked,
        classFirstClears: classFirstClears ?? [],
        totalRunsPlayed: totalRunsPlayed ?? 0,
        bestTimeSurvived: bestTimeSurvived ?? 0,
        bestKills: bestKills ?? 0,
        bossesDefeated: bossesDefeated ?? [],
        bestiary: bestiary ?? {},
      },
      update: {
        coins,
        upgrades,
        unlockedClasses,
        doubleTimeUnlocked: !!doubleTimeUnlocked,
        classFirstClears: classFirstClears ?? [],
        totalRunsPlayed: totalRunsPlayed ?? 0,
        bestTimeSurvived: bestTimeSurvived ?? 0,
        bestKills: bestKills ?? 0,
        bossesDefeated: bossesDefeated ?? [],
        bestiary: bestiary ?? {},
      },
    });

    return Response.json({ success: true });
  } catch (e) {
    console.error('Altair meta save failed:', e);
    return Response.json({ error: 'Internal Server Error' }, { status: 500 });
  }
},
});
