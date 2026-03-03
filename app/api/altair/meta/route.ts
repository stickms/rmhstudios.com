import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { auth } from '@/lib/auth';
import { headers } from 'next/headers';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

/** GET — Load meta progress from database. */
export async function GET(req: Request) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const progress = await prisma.altairMetaProgress.findUnique({
      where: { userId: session.user.id },
    });

    if (!progress) {
      return NextResponse.json({ data: null });
    }

    return NextResponse.json({
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
      },
    });
  } catch (e) {
    console.error('Altair meta load failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}

/** POST — Save meta progress to database. */
export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, { limit: 10, windowMs: 60_000, prefix: 'altair-meta' });
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    );
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
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
    } = body;

    // Basic validation
    if (typeof coins !== 'number' || coins < 0 || coins > 100_000_000) {
      return NextResponse.json({ error: 'Invalid coins' }, { status: 400 });
    }
    if (typeof upgrades !== 'object' || upgrades === null) {
      return NextResponse.json({ error: 'Invalid upgrades' }, { status: 400 });
    }
    if (!Array.isArray(unlockedClasses)) {
      return NextResponse.json({ error: 'Invalid unlockedClasses' }, { status: 400 });
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
      },
    });

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error('Altair meta save failed:', e);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}
