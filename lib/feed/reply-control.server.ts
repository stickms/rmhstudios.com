import { prisma } from '@/lib/prisma.server';
import { parseHandles } from '@/lib/feed/mentions';

export type ReplyControl = 'EVERYONE' | 'FOLLOWING' | 'MENTIONED';

/**
 * Whether `commenterId` may reply to a post, given the post's reply control.
 * The author can always reply to their own post.
 *
 *  - EVERYONE  → anyone
 *  - FOLLOWING → only accounts the author follows
 *  - MENTIONED → only accounts @mentioned in the post text
 */
export async function canReplyToPost(
  post: { userId: string; replyControl: ReplyControl; content: string },
  commenterId: string,
): Promise<boolean> {
  if (post.replyControl === 'EVERYONE') return true;
  if (commenterId === post.userId) return true;

  if (post.replyControl === 'FOLLOWING') {
    const follow = await prisma.follow.findUnique({
      where: { followerId_followingId: { followerId: post.userId, followingId: commenterId } },
      select: { followerId: true },
    });
    return !!follow;
  }

  if (post.replyControl === 'MENTIONED') {
    const handles = parseHandles(post.content).map((h) => h.toLowerCase());
    if (handles.length === 0) return false;
    const commenter = await prisma.user.findUnique({
      where: { id: commenterId },
      select: { handle: true },
    });
    const handle = commenter?.handle?.toLowerCase();
    return !!handle && handles.includes(handle);
  }

  return true;
}
