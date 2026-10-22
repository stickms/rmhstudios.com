/**
 * Take meter (X6) — server side. Reads are gated so the split only leaves the
 * server for the author and for members who have already voted.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { canViewPost } from '@/lib/feed/audience.server';
import { buildTakeState, type TakeState, type TakeVote } from '@/lib/feed/take';

const postSelect = {
  id: true,
  userId: true,
  isTake: true,
  audience: true,
  communityId: true,
  deletedAt: true,
  expiresAt: true,
  takeAgreeCount: true,
  takeDisagreeCount: true,
} as const;

async function myVoteOn(postId: string, viewerId: string | null): Promise<TakeVote | null> {
  if (!viewerId) return null;
  const row = await prisma.rMHarkTakeVote.findUnique({
    where: { rmheetId_userId: { rmheetId: postId, userId: viewerId } },
    select: { agree: true },
  });
  if (!row) return null;
  return row.agree ? 'agree' : 'disagree';
}

/** The viewer's view of a take, or null when the post is missing/invisible/not a take. */
export async function getTakeState(
  postId: string,
  viewerId: string | null,
): Promise<TakeState | null> {
  const post = await prisma.rMHark.findUnique({ where: { id: postId }, select: postSelect });
  if (!post || post.deletedAt || !post.isTake) return null;
  if (!(await canViewPost(post, viewerId))) return null;
  return buildTakeState(post, viewerId, await myVoteOn(postId, viewerId));
}

export type CastTakeResult =
  { ok: true; state: TakeState } | { ok: false; status: number; error: string };

/**
 * Record a vote. A member votes once and cannot change it — the point of the
 * meter is a first reaction, and an editable vote would let anyone read the
 * split and then swing it. The author cannot vote on their own take.
 */
export async function castTakeVote(
  postId: string,
  userId: string,
  vote: TakeVote,
): Promise<CastTakeResult> {
  const post = await prisma.rMHark.findUnique({ where: { id: postId }, select: postSelect });
  if (!post || post.deletedAt || !post.isTake || !(await canViewPost(post, userId))) {
    return { ok: false, status: 404, error: 'Take not found' };
  }
  if (post.userId === userId) {
    return { ok: false, status: 403, error: 'You cannot vote on your own take' };
  }

  const agree = vote === 'agree';
  try {
    await prisma.$transaction([
      prisma.rMHarkTakeVote.create({ data: { rmheetId: postId, userId, agree } }),
      prisma.rMHark.update({
        where: { id: postId },
        data: agree
          ? { takeAgreeCount: { increment: 1 } }
          : { takeDisagreeCount: { increment: 1 } },
      }),
    ]);
  } catch (e) {
    // P2002: already voted — fall through and report the standing vote.
    if (!(e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002')) throw e;
  }

  // Re-read after the write so the counts include this vote (and any concurrent ones).
  const fresh = await prisma.rMHark.findUnique({ where: { id: postId }, select: postSelect });
  if (!fresh) return { ok: false, status: 404, error: 'Take not found' };
  return { ok: true, state: buildTakeState(fresh, userId, await myVoteOn(postId, userId)) };
}
