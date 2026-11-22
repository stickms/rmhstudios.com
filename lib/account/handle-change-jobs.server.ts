/**
 * Daily tidy-up of handle history for deleted accounts (s10-19). `anonymizeAccount` erases rows older than the
 * reclaim window; rows inside it stay so the released handle keeps its 30 days of protection, and this job removes
 * them once they pass it. Only deleted accounts' rows go: a live member's history backs "previously known as" and
 * the reclaim block. The window and the account check are repeated in the delete, so a row is never removed early.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { DELETED_ACCOUNT_BAN_REASON } from '@/lib/account-lifecycle';
import { HANDLE_RECLAIM_BLOCK_MS } from '@/lib/handles/history';

export const HANDLE_CHANGE_BATCH = 1000;
export const HANDLE_CHANGE_QUEUE = 'account.handle-changes.erase';
/** Daily at 04:07 UTC. */
export const HANDLE_CHANGE_CRON = '7 4 * * *';

/** Delete deleted accounts' handle changes past the reclaim window, `batch` rows at a time. Returns the count. */
export async function eraseDeletedHandleChanges(
  now: Date = new Date(),
  batch: number = HANDLE_CHANGE_BATCH,
): Promise<number> {
  const cutoff = new Date(now.getTime() - HANDLE_RECLAIM_BLOCK_MS);
  const where = { createdAt: { lt: cutoff }, user: { banReason: DELETED_ACCOUNT_BAN_REASON } };
  let total = 0;
  for (;;) {
    const rows = await prisma.handleChange.findMany({
      where,
      select: { id: true },
      orderBy: { id: 'asc' },
      take: batch,
    });
    if (rows.length === 0) break;
    const { count } = await prisma.handleChange.deleteMany({ where: { id: { in: rows.map((r) => r.id) }, ...where } });
    total += count;
    if (rows.length < batch) break;
  }
  return total;
}

/** Register the daily clean-up. Called once from the jobs worker (only it can schedule). */
export async function registerHandleChangeCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(HANDLE_CHANGE_QUEUE);
  await boss.schedule(HANDLE_CHANGE_QUEUE, HANDLE_CHANGE_CRON, {}, { tz: 'UTC' });
  await boss.work(HANDLE_CHANGE_QUEUE, async () => {
    await eraseDeletedHandleChanges();
  });
}
