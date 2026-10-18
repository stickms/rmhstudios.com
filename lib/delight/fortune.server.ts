/** Z4 — fortune cookie: approved one-liners, one per UTC day, claimed lazily. */
import { prisma } from '@/lib/prisma.server';
import { apiCache } from '@/lib/cache';
import { utcDay } from '@/lib/delight/schema';

const PENDING_CAP = 3;

export async function submitFortune(userId: string, text: string): Promise<'ok' | 'too-many'> {
  const pending = await prisma.fortuneCookie.count({ where: { userId, status: 'pending' } });
  if (pending >= PENDING_CAP) return 'too-many';
  await prisma.fortuneCookie.create({ data: { userId, text } });
  return 'ok';
}

/** Today's fortune, or null when nothing approved is waiting. Cached per process for 60s. */
export async function todaysFortune(now = new Date()): Promise<{ text: string } | null> {
  const day = utcDay(now);
  const key = `delight:fortune:${day}`;
  const hit = apiCache.get<{ text: string } | null>(key);
  if (hit !== undefined) return hit;

  let row = await prisma.fortuneCookie.findUnique({
    where: { runDate: day },
    select: { text: true },
  });
  if (!row) {
    const next = await prisma.fortuneCookie.findFirst({
      where: { status: 'approved', runDate: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    if (next) {
      // runDate is unique: if another process claimed the day first, ours is a no-op.
      await prisma.fortuneCookie
        .updateMany({ where: { id: next.id, runDate: null }, data: { runDate: day } })
        .catch(() => undefined);
      row = await prisma.fortuneCookie.findUnique({
        where: { runDate: day },
        select: { text: true },
      });
    }
  }
  apiCache.set(key, row, 60_000);
  return row;
}

export async function pendingFortunes() {
  return prisma.fortuneCookie.findMany({
    where: { status: 'pending' },
    orderBy: { createdAt: 'asc' },
    take: 50,
    select: { id: true, text: true, createdAt: true },
  });
}

export async function reviewFortune(id: string, status: 'approved' | 'rejected'): Promise<boolean> {
  const res = await prisma.fortuneCookie.updateMany({
    where: { id, status: 'pending' },
    data: { status, reviewedAt: new Date() },
  });
  return res.count > 0;
}
