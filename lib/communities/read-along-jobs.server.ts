/**
 * pg-boss registration for read-alongs (s11-09, server-only): every five minutes the worker posts each due part's
 * thread once and tells the joined readers who asked to hear about it, once. Registered from `server/jobs/index.ts`.
 *
 * Posting is idempotent per part because the part is CLAIMED first: a conditional `updateMany` stamps `postedAt` on a
 * row whose `postedAt IS NULL`, and only the run whose update changed a row goes on to post (two runners, or a retry,
 * post once). A part that ends without a post gives the stamp back and pauses the read-along with a reason. Only one
 * part of a read-along is posted per sweep, and parts that fell due together (a worker that was down) are moved to the
 * following weekly times, so a reader who is behind never finds several parts opened at once.
 *
 * The notices are claimed once per part by `notifiedAt`, then sent in batches of readers through `mapWithConcurrency`.
 */
import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { mapWithConcurrency } from '@/lib/async-pool';
import { createNotification } from '@/lib/notifications.server';
import { notice } from '@/lib/notifications/notice-keys';
import { lockKey } from '@/lib/db/advisory-lock.server';
import {
  pauseReadAlong,
  postDuePart,
  readAlongPath,
  reflowUnposted,
  communityLock,
} from '@/lib/communities/read-along.server';

export const READ_ALONG_QUEUE = 'communities.read-along-parts';
export const READ_ALONG_CRON = '*/5 * * * *';
/** A claim older than this with no post recorded was left by a run that died: the part goes back to unclaimed. */
export const STALE_CLAIM_MS = 15 * 60_000;
/** Parts claimed per sweep, and readers notified per batch. */
const BATCH = 50;
export const NOTICE_BATCH = 200;
const NOTICE_CONCURRENCY = 8;

/** Post every due part once; returns how many were posted. */
export async function runDueReadAlongParts(now: Date = new Date()): Promise<number> {
  // A run that died between its claim and the post leaves `postedAt` set with no `postId`; hand those back so the
  // part is not lost. The cut-off is far past any post's duration, so a live run's claim is never taken.
  await prisma.readAlongPart
    .updateMany({
      where: { postedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) }, postId: null },
      data: { postedAt: null },
    })
    .catch((e: unknown) => console.error('[read-along] stale claim release error:', e));
  const due = await prisma.readAlongPart.findMany({
    where: { postedAt: null, opensAt: { lte: now }, readAlong: { status: 'active' } },
    orderBy: { opensAt: 'asc' },
    take: BATCH,
    include: {
      readAlong: {
        include: { createdBy: { select: { deletionScheduledAt: true } } },
      },
    },
  });
  let posted = 0;
  const handled = new Set<string>();
  for (const part of due) {
    // One part per read-along per sweep: the next waits for the following one.
    if (handled.has(part.readAlongId)) continue;
    handled.add(part.readAlongId);
    const row = part.readAlong;
    // The claim: whoever stamps `postedAt` on a row that still has none owns this part.
    const { count } = await prisma.readAlongPart.updateMany({
      // The read-along must still be running at the claim: a cancel or pause that landed since the read wins.
      where: { id: part.id, postedAt: null, readAlong: { status: 'active' } },
      data: { postedAt: now },
    });
    if (count !== 1) continue;
    // The stamp is a claim, not a post: anything that ends without a post gives it back.
    const unclaim = () =>
      prisma.readAlongPart
        .updateMany({ where: { id: part.id, postedAt: now, postId: null }, data: { postedAt: null } })
        .catch(() => undefined);
    // While the starter's deletion is scheduled nothing posts under their name: skip, keep the part for later.
    if (row.createdBy?.deletionScheduledAt) {
      await unclaim();
      continue;
    }
    let result: Awaited<ReturnType<typeof postDuePart>>;
    try {
      result = await postDuePart(row, part, now);
    } catch (e) {
      console.error('[read-along] post error:', e);
      await unclaim();
      continue;
    }
    if (!result.ok) {
      await unclaim();
      await pauseReadAlong(row.id, result.reason);
      continue;
    }
    // The thread exists: from here the claim is never given back (that would post it twice). Recording its id is
    // retried; if it still fails the claim stays and the stale-claim release is the last resort.
    posted += 1;
    try {
      await recordPost(part.id, result.postId);
      await afterPosted(part.readAlongId, row.communityId, now);
    } catch (e) {
      console.error('[read-along] bookkeeping error after post:', e);
    }
  }
  await notifyOpenedParts(now);
  return posted;
}

async function recordPost(partId: string, postId: string): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await prisma.readAlongPart.updateMany({ where: { id: partId }, data: { postId } });
      return;
    } catch (e) {
      if (attempt >= 2) throw e;
    }
  }
}

/** After a part posts: the read-along is done when every part has, and late parts move to the weekly times after now. */
async function afterPosted(readAlongId: string, communityId: string, now: Date): Promise<void> {
  const remaining = await prisma.readAlongPart.count({ where: { readAlongId, postedAt: null } });
  if (remaining === 0) {
    await prisma.readAlong.updateMany({ where: { id: readAlongId, status: 'active' }, data: { status: 'done' } });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await lockKey(tx, communityLock(communityId));
    const row = await tx.readAlong.findUnique({
      where: { id: readAlongId },
      select: { id: true, weekday: true, minuteOfDay: true, timeZone: true },
    });
    if (row) await reflowUnposted(tx, row, now.getTime());
  });
}

/**
 * Tell the readers of every part that has opened and not been announced. The claim is a compare-and-set on
 * `notifiedAt`, so a part is announced by one run only; the claim is made after the post exists (`postId` set).
 */
export async function notifyOpenedParts(now: Date = new Date()): Promise<number> {
  const parts = await prisma.readAlongPart.findMany({
    where: { postedAt: { not: null }, postId: { not: null }, notifiedAt: null },
    orderBy: { postedAt: 'asc' },
    take: BATCH,
    include: {
      readAlong: {
        select: {
          id: true,
          communityId: true,
          bookTitle: true,
          community: { select: { name: true, slug: true } },
        },
      },
    },
  });
  let announced = 0;
  for (const part of parts) {
    const { count } = await prisma.readAlongPart.updateMany({
      where: { id: part.id, notifiedAt: null },
      data: { notifiedAt: now },
    });
    if (count !== 1) continue;
    announced += 1;
    const { readAlong } = part;
    let cursor: string | undefined;
    for (;;) {
      // Joined readers who asked to be told and are still members of the community.
      const readers = await prisma.readAlongReader.findMany({
        where: {
          readAlongId: readAlong.id,
          notify: true,
          user: { communityMembers: { some: { communityId: readAlong.communityId } } },
        },
        orderBy: { userId: 'asc' },
        take: NOTICE_BATCH,
        ...(cursor ? { cursor: { readAlongId_userId: { readAlongId: readAlong.id, userId: cursor } }, skip: 1 } : {}),
        select: { userId: true },
      });
      if (readers.length === 0) break;
      await mapWithConcurrency(readers, NOTICE_CONCURRENCY, (r) =>
        createNotification({
          userId: r.userId,
          type: 'SYSTEM',
          entityType: 'read-along',
          entityId: part.id,
          preview: notice('read-along-part-open', {
            part: part.label,
            book: readAlong.bookTitle,
            community: readAlong.community.name,
          }),
          link: readAlongPath(readAlong.community.slug, readAlong.id),
        }).catch((e: unknown) => console.error('[read-along] notice error:', e)),
      );
      if (readers.length < NOTICE_BATCH) break;
      cursor = readers[readers.length - 1]!.userId;
    }
  }
  return announced;
}

export async function registerReadAlongCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(READ_ALONG_QUEUE);
  await boss.schedule(READ_ALONG_QUEUE, READ_ALONG_CRON, {}, { tz: 'UTC' });
  await boss.work(READ_ALONG_QUEUE, async () => {
    await runDueReadAlongParts();
  });
}
