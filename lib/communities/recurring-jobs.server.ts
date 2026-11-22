/**
 * pg-boss registration for recurring community threads (s08-09, server-only): a minute cron posts each due
 * occurrence once. Registered from `server/jobs/index.ts`.
 *
 * Posting is idempotent per occurrence because the occurrence is CLAIMED first: a conditional `updateMany` moves
 * `nextAt` from the value the sweep read to the next occurrence after now and stamps `lastPostedAt`, requiring that
 * nobody posted the thread inside the "Post now" window (the same claim "Post now" makes, so a tick and a click in
 * the same instant post once), and only the sweep whose update changed a row goes on to post. Two runners, or a retry, post once; a worker that was down for a week posts once on
 * recovery (the next occurrence is computed from now, not from the missed one).
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { nextThreadAt } from '@/lib/communities/recurring';
import { notPostedRecently, pauseRecurring, postOccurrence, specOf } from '@/lib/communities/recurring.server';

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
    include: {
      createdBy: {
        select: {
          deletionScheduledAt: true,
        },
      },
    },
  });
  let posted = 0;
  for (const row of due) {
    // Claim: move nextAt before acting. Losing this race means another runner has the occurrence.
    const { count } = await prisma.communityRecurringThread.updateMany({
      where: {
        id: row.id,
        active: true,
        nextAt: row.nextAt,
        ...notPostedRecently(now),
      },
      data: {
        nextAt: new Date(nextThreadAt(specOf(row), now.getTime())),
        lastPostedAt: now,
      },
    });
    if (count !== 1) continue;
    // The stamp is a claim, not a post: anything that ends without a post gives the old value back.
    const unclaim = () =>
      prisma.communityRecurringThread
        .updateMany({
          where: {
            id: row.id,
            lastPostedAt: now,
          },
          data: {
            lastPostedAt: row.lastPostedAt,
          },
        })
        .catch(() => undefined);
    // s09-14: a template whose author's deletion is scheduled skips this occurrence (the community sees no thread
    // that week). The occurrence was claimed above, so nothing posts later to catch up.
    if (row.createdBy?.deletionScheduledAt) {
      await unclaim();
      continue;
    }
    try {
      const result = await postOccurrence(row, now);
      if (result.ok) posted += 1;
      else {
        await unclaim();
        await pauseRecurring(row, result.reason);
      }
    } catch (e) {
      console.error('[recurring] post error:', e);
      await unclaim();
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
