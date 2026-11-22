/**
 * pg-boss registration for recurring community threads (s08-09, server-only): a minute cron posts each due
 * occurrence once. Registered from `server/jobs/index.ts`.
 *
 * Posting is idempotent per occurrence because the occurrence is CLAIMED first: a conditional `updateMany` moves
 * `nextAt` from the value the sweep read to the next occurrence after now, and only the sweep whose update changed
 * a row goes on to post. Two runners, or a retry, post once; a worker that was down for a week posts once on
 * recovery (the next occurrence is computed from now, not from the missed one).
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { nextThreadAt } from '@/lib/communities/recurring';
import { pauseRecurring, postOccurrence, specOf } from '@/lib/communities/recurring.server';

export const RECURRING_QUEUE = 'communities.recurring';
export const RECURRING_CRON = '* * * * *';
/** A template whose posting throws unexpectedly (not a refusal) is paused on its third failure in a row. */
export const MAX_ERRORS = 3;
const BATCH = 50;

/** Post every due template once; returns how many were posted. */
export async function runDueRecurringThreads(now: Date = new Date()): Promise<number> {
  const due = await prisma.communityRecurringThread.findMany({
    where: {
      active: true,
      nextAt: {
        lte: now,
      },
    },
    orderBy: {
      nextAt: 'asc',
    },
    take: BATCH,
  });
  let posted = 0;
  for (const row of due) {
    // Claim: move nextAt before acting. Losing this race means another runner has the occurrence.
    const { count } = await prisma.communityRecurringThread.updateMany({
      where: {
        id: row.id,
        active: true,
        nextAt: row.nextAt,
      },
      data: {
        nextAt: new Date(nextThreadAt(specOf(row), now.getTime())),
      },
    });
    if (count !== 1) continue;
    try {
      const result = await postOccurrence(row, now);
      if (result.ok) posted += 1;
      else await pauseRecurring(row, result.reason);
    } catch (e) {
      console.error('[recurring] post error:', e);
      if (row.failures + 1 >= MAX_ERRORS) {
        await pauseRecurring(row, 'publish_failed').catch(() => undefined);
      } else {
        await prisma.communityRecurringThread
          .updateMany({
            where: {
              id: row.id,
            },
            data: {
              failures: {
                increment: 1,
              },
            },
          })
          .catch(() => undefined);
      }
    }
  }
  return posted;
}

export async function registerRecurringThreadCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(RECURRING_QUEUE);
  await boss.schedule(
    RECURRING_QUEUE,
    RECURRING_CRON,
    {},
    {
      tz: 'UTC',
    },
  );
  await boss.work(RECURRING_QUEUE, async () => {
    await runDueRecurringThreads();
  });
}
