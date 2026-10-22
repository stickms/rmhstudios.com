/**
 * Z7 · Time capsule posts - server side.
 *
 * A capsule is an ordinary `scheduled_post` row with `isCapsule = true`: sealed
 * until a date at least a day away, never editable and never publishable early.
 * Publishing reuses `publishScheduledPost`. That mechanism was lazy (it ran only
 * when the author touched their drafts or timeline), which is not good enough for
 * a post that is supposed to open on a date whether or not its author comes back,
 * so `publishDueScheduled` below is the sweep job that publishes any due row.
 */

import type { PgBoss } from 'pg-boss';
import { prisma } from '@/lib/prisma.server';
import { publishDueForUser, publishScheduledPost } from '@/lib/scheduled/publish.server';
import { DAY_MS } from './constants';

export interface CapsuleRow {
  id: string;
  content: string;
  imageCount: number;
  hasGif: boolean;
  hasPoll: boolean;
  audience: string;
  /** When it opens (sealed) or opened. */
  openAt: string;
  sealedAt: string;
  /** Set once it has opened: the id of the published post. */
  postId: string | null;
  postHandle: string;
}

const OPENED_WINDOW_MS = 60 * DAY_MS;

/** The author's sealed capsules (soonest first) and recently opened ones. */
export async function listCapsules(
  userId: string,
): Promise<{ sealed: CapsuleRow[]; opened: CapsuleRow[] }> {
  // Open anything that is due first, so the list never shows a stale countdown.
  await publishDueForUser(userId);

  const [sealed, opened, me] = await Promise.all([
    prisma.scheduledPost.findMany({
      where: { userId, isCapsule: true, publishedId: null },
      orderBy: { scheduledAt: 'asc' },
      take: 50,
    }),
    prisma.scheduledPost.findMany({
      where: {
        userId,
        isCapsule: true,
        publishedId: { not: null },
        scheduledAt: { gt: new Date(Date.now() - OPENED_WINDOW_MS) },
      },
      orderBy: { scheduledAt: 'desc' },
      take: 20,
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { handle: true } }),
  ]);

  const map = (r: (typeof sealed)[number]): CapsuleRow => ({
    id: r.id,
    content: r.content,
    imageCount: r.imageUrls.length,
    hasGif: !!r.gifUrl,
    hasPoll: !!r.poll,
    audience: String(r.audience),
    openAt: (r.scheduledAt ?? r.createdAt).toISOString(),
    sealedAt: r.createdAt.toISOString(),
    postId: r.publishedId,
    postHandle: me?.handle ?? userId,
  });
  return { sealed: sealed.map(map), opened: opened.map(map) };
}

const BATCH = 50;
const MAX_BATCHES = 6;

/**
 * Publish every scheduled post whose time has come, for all authors, in bounded
 * batches. Suspended accounts are skipped (their posts stay queued until the
 * suspension ends), matching the ban check the manual publish route makes.
 */
export async function publishDueScheduled(now: Date = new Date()): Promise<number> {
  let published = 0;
  for (let i = 0; i < MAX_BATCHES; i++) {
    const due = await prisma.scheduledPost.findMany({
      where: {
        publishedId: null,
        scheduledAt: { not: null, lte: now },
        user: { OR: [{ bannedUntil: null }, { bannedUntil: { lt: now } }] },
      },
      orderBy: { scheduledAt: 'asc' },
      take: BATCH,
    });
    if (due.length === 0) break;
    let progressed = 0;
    for (const sp of due) {
      try {
        const id = await publishScheduledPost(sp);
        if (id) progressed++;
      } catch (e) {
        console.error('[scheduled-job] publish failed:', sp.id, (e as Error)?.message);
      }
    }
    published += progressed;
    // A batch that published nothing is all poison rows; looping again would only
    // read the same rows.
    if (due.length < BATCH || progressed === 0) break;
  }
  return published;
}

export const SCHEDULED_PUBLISH_QUEUE = 'posts.publish-scheduled';
/** Every two minutes: a capsule opening a minute or two late is not noticeable. */
export const SCHEDULED_PUBLISH_CRON = '*/2 * * * *';

export async function registerScheduledPublishCron(boss: PgBoss): Promise<void> {
  await boss.createQueue(SCHEDULED_PUBLISH_QUEUE);
  await boss.schedule(SCHEDULED_PUBLISH_QUEUE, SCHEDULED_PUBLISH_CRON, {}, { tz: 'UTC' });
  await boss.work(SCHEDULED_PUBLISH_QUEUE, async () => {
    await publishDueScheduled();
  });
}
