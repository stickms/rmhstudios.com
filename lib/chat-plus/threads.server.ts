/**
 * M7 — side threads in group chats. Server-only.
 *
 * A reply is an ordinary `GroupMessage` with `threadParentId` set, so it gets
 * reactions, expiry, reports and moderation for free. It is excluded from the
 * main stream (every main-stream read adds `threadParentId: null`) and the
 * parent carries a denormalised `replyCount`, so a busy chat's list pays no
 * extra query for the "3 replies" chip.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import type { ChatAccess } from '@/lib/chat-plus/access.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { postChatMessage } from '@/lib/chat-plus/post.server';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import type { GroupMessagePayload } from '@/lib/group-events';

export const threadReplySchema = z.object({ content: z.string().trim().min(1).max(2000) });

const REPLY_LIMIT = 200;

export interface ThreadPage {
  parent: GroupMessagePayload;
  replies: GroupMessagePayload[];
}

async function loadParent(access: ChatAccess, parentId: string) {
  return prisma.groupMessage.findFirst({
    where: {
      id: parentId,
      groupId: access.id,
      threadParentId: null,
      deletedAt: null,
      kind: { notIn: ['system', 'tip'] },
      AND: [liveMessages()],
    },
    select: groupMessageSelect,
  });
}

export async function loadThread(access: ChatAccess, parentId: string): Promise<ThreadPage | null> {
  if (access.kind !== 'group') return null;
  const parent = await loadParent(access, parentId);
  if (!parent) return null;
  const replies = await prisma.groupMessage.findMany({
    where: { threadParentId: parentId, deletedAt: null, AND: [liveMessages()] },
    orderBy: { createdAt: 'asc' },
    take: REPLY_LIMIT,
    select: groupMessageSelect,
  });
  const all = await serializeGroupMessages([parent, ...replies], access.viewerId);
  return { parent: all[0], replies: all.slice(1) };
}

export async function postThreadReply(
  access: ChatAccess,
  parentId: string,
  content: string,
): Promise<GroupMessagePayload | null> {
  if (access.kind !== 'group') return null;
  const parent = await loadParent(access, parentId);
  if (!parent) return null;
  const posted = await postChatMessage(access, {
    senderId: access.viewerId,
    content,
    threadParentId: parentId,
  });
  return posted.kind === 'group' ? posted.message : null;
}
