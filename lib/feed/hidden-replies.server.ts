/**
 * Hidden replies (X2). The author of a post can fold any reply in its
 * conversation under a "Hidden replies" disclosure — softer than blocking or
 * reporting, and fully reversible. It sits next to `reply-control.server.ts`:
 * reply control decides who may reply, this decides what the author has chosen
 * to de-emphasise afterwards. Hidden replies are still returned by the API and
 * still reachable; only the root post's author can toggle them.
 */

import { prisma } from '@/lib/prisma.server';

export type SetReplyHiddenResult =
  { ok: true; hidden: boolean } | { ok: false; status: number; error: string };

export async function setReplyHidden(
  postId: string,
  commentId: string,
  actorId: string,
  hidden: boolean,
): Promise<SetReplyHiddenResult> {
  const comment = await prisma.rMHarkComment.findUnique({
    where: { id: commentId },
    select: { rmheetId: true, rmhark: { select: { userId: true } } },
  });
  if (!comment || comment.rmheetId !== postId) {
    return { ok: false, status: 404, error: 'Reply not found' };
  }
  if (comment.rmhark.userId !== actorId) {
    return { ok: false, status: 403, error: 'Only the post author can hide replies' };
  }
  await prisma.rMHarkComment.update({
    where: { id: commentId },
    data: { hiddenAt: hidden ? new Date() : null },
  });
  return { ok: true, hidden };
}
