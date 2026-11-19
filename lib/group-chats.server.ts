import { prisma } from '@/lib/prisma.server';
import { GROUP_KIND } from '@/lib/chat/chat.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { folderChatIds } from '@/lib/chat-plus/folders.server';

export interface GroupChatRow {
  id: string;
  name: string;
  memberCount: number;
  lastMessage: string | null;
  lastMessageAt: string;
  unread: boolean;
}

/**
 * The viewer's group chats, most-recent first. Shared by the `/api/group-chats`
 * GET handler and the `/groups` route loader so the list is server-rendered /
 * prefetched instead of fetched on mount.
 */
export async function listGroupChats(
  userId: string,
  opts: { folderId?: string | null; unreadOnly?: boolean } = {}
): Promise<{ groups: GroupChatRow[]; signedIn: true }> {
  // M1: a folder narrows the (already complete, unpaginated) list server-side.
  const inFolder = opts.folderId ? await folderChatIds(userId, opts.folderId, 'group') : undefined;
  const memberships = await prisma.chatMember.findMany({
    where: {
      userId,
      chat: { kind: GROUP_KIND },
      ...(inFolder ? { chatId: { in: inFolder } } : {}),
    },
    select: {
      lastReadAt: true,
      chat: {
        select: {
          id: true,
          name: true,
          lastMessageAt: true,
          _count: { select: { members: true } },
          messages: {
            // Expired disappearing messages (M3), side-thread replies (M7) and
            // system lines never stand in for "the last message".
            where: { threadParentId: null, kind: { notIn: ['system', 'tip'] }, AND: [liveMessages()] },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: { content: true, createdAt: true, senderId: true },
          },
        },
      },
    },
  });

  const groups: GroupChatRow[] = memberships
    .map((m) => {
      const last = m.chat.messages[0];
      const unread = last ? last.createdAt > m.lastReadAt && last.senderId !== userId : false;
      return {
        id: m.chat.id,
        name: m.chat.name ?? '',
        memberCount: m.chat._count.members,
        lastMessage: last?.content ?? null,
        lastMessageAt: m.chat.lastMessageAt.toISOString(),
        unread,
      };
    })
    .filter((g) => !opts.unreadOnly || g.unread)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return { groups, signedIn: true };
}
