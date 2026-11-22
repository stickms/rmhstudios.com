/**
 * Daily tidy-up for timed account mutes (s10-10). Readers already ignore an expired mute (`activeMuteWhere`), so this
 * only stops the table growing; correctness never depends on it having run. Deletes in batches by id, re-checking the
 * expiry in the delete itself so a mute extended between the read and the delete survives.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';

export const MUTE_EXPIRY_BATCH = 1000;
export const MUTE_EXPIRY_QUEUE = 'moderation.mutes.expire';
/** Daily at 03:53 UTC. */
export const MUTE_EXPIRY_CRON = '53 3 * * *';

/** Delete mutes whose end has passed, `batch` rows at a time. Returns how many were removed. */
export async function deleteExpiredMutes(now: Date = new Date(), batch: number = MUTE_EXPIRY_BATCH): Promise<number> {
  let total = 0;
  for (;;) {
    const rows = await prisma.userMute.findMany({
      where: { expiresAt: { lte: now } },
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batch,
    });
    if (rows.length === 0) break;
    const { count } = await prisma.userMute.deleteMany({
      where: { id: { in: rows.map((r) => r.id) }, expiresAt: { lte: now } },
    });
    total += count;
    if (rows.length < batch) break;
  }
  return total;
}

/** Register the daily clean-up. Called once from the jobs worker (only it can schedule). */
export async function registerMuteExpiryCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(MUTE_EXPIRY_QUEUE);
  await boss.schedule(MUTE_EXPIRY_QUEUE, MUTE_EXPIRY_CRON, {}, { tz: 'UTC' });
  await boss.work(MUTE_EXPIRY_QUEUE, async () => {
    await deleteExpiredMutes();
  });
}
