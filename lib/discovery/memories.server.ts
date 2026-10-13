/**
 * A5 · On this day. Opt-in; one daily batched job. For each past year it runs
 * ONE query over the whole batch of opted-in members (index: userId, createdAt)
 * and sends each member at most one notification a day.
 */
import { prisma } from '@/lib/prisma.server';
import { createNotification } from '@/lib/notifications.server';
import { utcDay } from './schema';

const BATCH = 500;
const YEARS_BACK = 8;

export async function getMemoriesOptIn(userId: string): Promise<boolean> {
  return !!(await prisma.memoriesOptIn.findUnique({ where: { userId }, select: { userId: true } }));
}

export async function setMemoriesOptIn(userId: string, enabled: boolean): Promise<void> {
  if (enabled) {
    await prisma.memoriesOptIn.upsert({ where: { userId }, create: { userId }, update: {} });
  } else {
    await prisma.memoriesOptIn.deleteMany({ where: { userId } });
  }
}

export async function runMemories(now = new Date()): Promise<number> {
  const today = utcDay(now);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth();
  const d = now.getUTCDate();
  let sent = 0;
  let after = '';
  for (;;) {
    const batch = await prisma.memoriesOptIn.findMany({
      where: { userId: { gt: after }, OR: [{ lastDay: null }, { lastDay: { not: today } }] },
      orderBy: { userId: 'asc' },
      take: BATCH,
      select: { userId: true },
    });
    if (!batch.length) break;
    after = batch[batch.length - 1]!.userId;
    const ids = batch.map((b) => b.userId);
    const best = new Map<
      string,
      { id: string; years: number; content: string; handle: string | null }
    >();
    for (let n = 1; n <= YEARS_BACK; n++) {
      const start = new Date(Date.UTC(y - n, m, d));
      if (start.getUTCMonth() !== m) continue; // Feb 29 in a non-leap year
      const end = new Date(start.getTime() + 86_400_000);
      // One row per member (their most-liked post that day); index: (userId, createdAt).
      const rows = await prisma.$queryRaw<
        { id: string; userId: string; content: string; handle: string | null }[]
      >`
        SELECT DISTINCT ON (r."userId") r.id, r."userId", r.content, u.handle
        FROM rmheet r JOIN "user" u ON u.id = r."userId"
        WHERE r."userId" = ANY(${ids}) AND r."deletedAt" IS NULL AND r.content <> ''
          AND r."createdAt" >= ${start} AND r."createdAt" < ${end}
        ORDER BY r."userId", r."likeCount" DESC`;
      for (const r of rows) {
        // Prefer the most recent year.
        if (!best.has(r.userId) || best.get(r.userId)!.years > n) {
          best.set(r.userId, { id: r.id, years: n, content: r.content, handle: r.handle });
        }
      }
    }
    // Claim the day first so a retry after a crash cannot notify twice.
    await prisma.memoriesOptIn.updateMany({
      where: { userId: { in: ids } },
      data: { lastDay: today },
    });
    for (const [userId, b] of best) {
      await createNotification({
        userId,
        type: 'SYSTEM',
        entityType: 'memory',
        entityId: b.id,
        preview: `${b.years === 1 ? '1 year ago today' : `${b.years} years ago today`}: ${b.content.replace(/\s+/g, ' ').trim().slice(0, 120)}`,
        link: `/u/${b.handle ?? userId}/post/${b.id}`,
      });
      sent++;
    }
  }
  return sent;
}
