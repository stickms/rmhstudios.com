// lib/social/reactions.server.ts
import { prisma } from '@/lib/prisma.server';
import type { ReactionRow } from '@/lib/social/reactions';

interface ToggleResult {
  found: boolean;
  reacted: boolean;
  rows: ReactionRow[];
}

const ROW_SELECT = { emoji: true, userId: true } as const;

export async function togglePostReaction(
  userId: string,
  postId: string,
  emoji: string,
): Promise<ToggleResult> {
  const post = await prisma.rMHark.findUnique({
    where: { id: postId },
    select: { id: true, deletedAt: true },
  });
  if (!post || post.deletedAt) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.rMHarkReaction.findUnique({
    where: { rmheetId_userId_emoji: { rmheetId: postId, userId, emoji } },
  });
  if (existing) {
    await prisma.rMHarkReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.rMHarkReaction.create({ data: { rmheetId: postId, userId, emoji } });
  }
  const rows = await prisma.rMHarkReaction.findMany({
    where: { rmheetId: postId },
    select: ROW_SELECT,
  });
  return { found: true, reacted: !existing, rows };
}

export async function toggleCommentReaction(
  userId: string,
  commentId: string,
  emoji: string,
): Promise<ToggleResult> {
  const comment = await prisma.rMHarkComment.findUnique({
    where: { id: commentId },
    select: { id: true, deletedAt: true },
  });
  if (!comment || comment.deletedAt) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.rMHarkCommentReaction.findUnique({
    where: { commentId_userId_emoji: { commentId, userId, emoji } },
  });
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
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { conversationId?: string; senderId?: string }> {
  const message = await prisma.directMessage.findUnique({
    where: { id: messageId },
    select: { id: true, conversationId: true, senderId: true },
  });
  if (!message) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.directMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
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
  messageId: string,
  emoji: string,
): Promise<ToggleResult & { groupId?: string }> {
  const message = await prisma.groupMessage.findUnique({
    where: { id: messageId },
    select: { id: true, groupId: true },
  });
  if (!message) return { found: false, reacted: false, rows: [] };

  const existing = await prisma.groupMessageReaction.findUnique({
    where: { messageId_userId_emoji: { messageId, userId, emoji } },
  });
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
