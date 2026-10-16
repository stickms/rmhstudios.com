/**
 * S7 pile-on guard — server-only. A cheap counter in the reply-create path
 * (Redis INCR with a TTL; a bounded in-process map when Redis is off) trips
 * once per post when non-followers reply in a burst. The author is notified and
 * can accept in one tap, which flips the post's existing `replyControl` to
 * FOLLOWING for 24h; an hourly maintenance sweep restores the previous value.
 */
import { prisma } from '@/lib/prisma.server';
import { redisIncrBy } from '@/lib/redis.server';
import { createNotification } from '@/lib/notifications.server';
import type { RMHarkReplyControl } from '@prisma/client';

export const PILE_ON_REPLIES = 8;
export const PILE_ON_WINDOW_MS = 10 * 60_000;
export const PILE_ON_LIMIT_MS = 24 * 3_600_000;

const local = new Map<string, { count: number; resetAt: number }>();

async function bump(postId: string): Promise<number> {
  const viaRedis = await redisIncrBy(`pileon:${postId}`, 1, PILE_ON_WINDOW_MS);
  if (viaRedis !== null) return viaRedis;
  const now = Date.now();
  const hit = local.get(postId);
  if (!hit || hit.resetAt < now) {
    if (local.size >= 5_000) local.delete(local.keys().next().value as string);
    local.set(postId, { count: 1, resetAt: now + PILE_ON_WINDOW_MS });
    return 1;
  }
  return ++hit.count;
}

/** Call after a reply is created. Never throws. */
export async function noteReply(args: {
  postId: string;
  authorId: string;
  replierId: string;
  replyControl: RMHarkReplyControl;
}): Promise<void> {
  try {
    const { postId, authorId, replierId, replyControl } = args;
    if (replierId === authorId || replyControl !== 'EVERYONE') return;
    const follows = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: replierId, followingId: authorId } },
      select: { followerId: true },
    });
    if (follows) return;
    if ((await bump(postId)) < PILE_ON_REPLIES) return;
    // One offer per post, ever: the primary key makes the second create fail.
    await prisma.pileOnGuard.create({
      data: { postId, authorId, previousControl: replyControl, status: 'OFFERED' },
    });
    await createNotification({
      userId: authorId,
      type: 'SYSTEM',
      entityType: 'pile_on',
      entityId: postId,
      preview: 'A post of yours is getting a burst of replies from people you do not know.',
      link: `/safety/pile-on?post=${encodeURIComponent(postId)}`,
    });
  } catch (err) {
    if ((err as { code?: string })?.code !== 'P2002') {
      console.error('[pile-on] note failed:', (err as Error)?.message);
    }
  }
}

export async function getGuard(postId: string, userId: string) {
  const g = await prisma.pileOnGuard.findUnique({ where: { postId } });
  return g && g.authorId === userId ? g : null;
}

/** One-tap accept: limit replies on the post to the existing FOLLOWING control. */
export async function acceptGuard(postId: string, userId: string): Promise<Date | null> {
  const g = await getGuard(postId, userId);
  if (!g || g.status !== 'OFFERED') return null;
  const expiresAt = new Date(Date.now() + PILE_ON_LIMIT_MS);
  await prisma.$transaction([
    prisma.rMHark.update({ where: { id: postId }, data: { replyControl: 'FOLLOWING' } }),
    prisma.pileOnGuard.update({ where: { postId }, data: { status: 'ACTIVE', expiresAt } }),
  ]);
  return expiresAt;
}

export async function dismissGuard(postId: string, userId: string): Promise<boolean> {
  const g = await getGuard(postId, userId);
  if (!g || g.status !== 'OFFERED') return false;
  await prisma.pileOnGuard.update({ where: { postId }, data: { status: 'DISMISSED' } });
  return true;
}

/** Restore one ACTIVE guard's previous control (only if nobody changed it meanwhile). */
async function revert(postId: string, previous: RMHarkReplyControl): Promise<void> {
  await prisma.$transaction([
    prisma.rMHark.updateMany({
      where: { id: postId, replyControl: 'FOLLOWING' },
      data: { replyControl: previous },
    }),
    prisma.pileOnGuard.update({ where: { postId }, data: { status: 'REVERTED' } }),
  ]);
}

export async function undoGuard(postId: string, userId: string): Promise<boolean> {
  const g = await getGuard(postId, userId);
  if (!g || g.status !== 'ACTIVE') return false;
  await revert(postId, g.previousControl);
  return true;
}

/** Hourly sweep: lift every limit whose 24h has passed. */
export async function revertExpiredPileOnGuards(limit = 200): Promise<number> {
  const due = await prisma.pileOnGuard.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: new Date() } },
    select: { postId: true, previousControl: true },
    take: limit,
  });
  for (const g of due) await revert(g.postId, g.previousControl).catch(() => {});
  return due.length;
}
