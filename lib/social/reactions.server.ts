// lib/social/reactions.server.ts
import { prisma } from '@/lib/prisma.server';
import type { ReactionRow, ReactionSummary } from '@/lib/social/reactions';

interface ToggleResult {
  found: boolean;
  reacted: boolean;
  rows: ReactionRow[];
  /**
   * Bounded grouped aggregate (emoji → count + whether the viewer reacted).
   * Populated for post reactions so a viral post's toggle no longer re-reads
   * (and re-serializes) every reaction row. Optional: the comment / DM / group
   * togglers still return the full `rows` roster, which is small per target.
   */
  summary?: ReactionSummary[];
}

const ROW_SELECT = { emoji: true, userId: true } as const;

export async function togglePostReaction(
  userId: string,
  postId: string,
  emoji: string,
): Promise<ToggleResult> {
  const [post, existing] = await Promise.all([
    prisma.rMHark.findUnique({
      where: { id: postId },
      select: { id: true, deletedAt: true },
    }),
    prisma.rMHarkReaction.findUnique({
      where: { rmheetId_userId_emoji: { rmheetId: postId, userId, emoji } },
    }),
  ]);
  if (!post || post.deletedAt) return { found: false, reacted: false, rows: [], summary: [] };
  if (existing) {
    await prisma.rMHarkReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.rMHarkReaction.create({ data: { rmheetId: postId, userId, emoji } });
  }

  // Bounded read — mirror lib/feed/timeline.ts loadReactionSummaries: a
  // `groupBy` over emoji (bounded by distinct emojis, tiny) plus the viewer's
  // own reactions (bounded — a viewer reacts to few), instead of re-reading
  // EVERY reaction row for the post (unbounded on a viral post). Both queries
  // reflect the post-toggle state.
  const [grouped, mine] = await Promise.all([
    prisma.rMHarkReaction.groupBy({
      by: ['emoji'],
      where: { rmheetId: postId },
      _count: { _all: true },
    }),
    prisma.rMHarkReaction.findMany({
      where: { rmheetId: postId, userId },
      select: { emoji: true },
    }),
  ]);
  const mineSet = new Set(mine.map((m) => m.emoji));
  const summary: ReactionSummary[] = grouped
    .map((g) => ({ emoji: g.emoji, count: g._count._all, reactedByMe: mineSet.has(g.emoji) }))
    .sort((a, b) => b.count - a.count);
  // Keep `rows` a valid — now bounded — ReactionRow[] for the existing response
  // contract: the viewer's own reactions. The full reactor roster is no longer
  // shipped on every toggle; grouped counts are in `summary`.
  const rows: ReactionRow[] = mine.map((m) => ({ emoji: m.emoji, userId }));
  return { found: true, reacted: !existing, rows, summary };
}

export async function toggleCommentReaction(
  userId: string,
  commentId: string,
  emoji: string,
): Promise<ToggleResult> {
  const [comment, existing] = await Promise.all([
    prisma.rMHarkComment.findUnique({
      where: { id: commentId },
      select: { id: true, deletedAt: true },
    }),
    prisma.rMHarkCommentReaction.findUnique({
      where: { commentId_userId_emoji: { commentId, userId, emoji } },
    }),
  ]);
  if (!comment || comment.deletedAt) return { found: false, reacted: false, rows: [] };
  if (existing) {
    await prisma.rMHarkCommentReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.rMHarkCommentReaction.create({ data: { commentId, userId, emoji } });
  }
  const rows = await prisma.rMHarkCommentReaction.findMany({
    where: { commentId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows };
}

export async function toggleDmReaction(
  userId: string,
  conversationId: string,
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { conversationId?: string; senderId?: string }> {
  const [message, existing] = await Promise.all([
    prisma.directMessage.findFirst({
      where: { id: messageId, conversationId },
      select: { id: true, conversationId: true, senderId: true },
    }),
    prisma.directMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    }),
  ]);
  if (!message) return { found: false, reacted: false, rows: [] };
  if (existing) {
    await prisma.directMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.directMessageReaction.create({ data: { messageId, userId, emoji } });
  }
  const rows = await prisma.directMessageReaction.findMany({
    where: { messageId },
    select: ROW_SELECT,
  });
  return {
    found: true,
    reacted: !existing,
    rows,
    conversationId: message.conversationId,
    senderId: message.senderId,
  };
}

export async function toggleGroupMessageReaction(
  userId: string,
  groupId: string,
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { groupId?: string }> {
  const [message, existing] = await Promise.all([
    prisma.groupMessage.findFirst({
      where: { id: messageId, groupId },
      select: { id: true, groupId: true },
    }),
    prisma.groupMessageReaction.findUnique({
      where: { messageId_userId_emoji: { messageId, userId, emoji } },
    }),
  ]);
  if (!message) return { found: false, reacted: false, rows: [] };
  if (existing) {
    await prisma.groupMessageReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.groupMessageReaction.create({ data: { messageId, userId, emoji } });
  }
  const rows = await prisma.groupMessageReaction.findMany({
    where: { messageId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows, groupId: message.groupId };
}
