import { prisma } from '@/lib/prisma.server';
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
  const memberships = await prisma.groupChatMember.findMany({
    where: { userId, ...(inFolder ? { groupId: { in: inFolder } } : {}) },
    select: {
      lastReadAt: true,
      group: {
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
      const last = m.group.messages[0];
      const unread = last ? last.createdAt > m.lastReadAt && last.senderId !== userId : false;
      return {
        id: m.group.id,
        name: m.group.name,
        memberCount: m.group._count.members,
        lastMessage: last?.content ?? null,
        lastMessageAt: m.group.lastMessageAt.toISOString(),
        unread,
      };
    })
    .filter((g) => !opts.unreadOnly || g.unread)
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return { groups, signedIn: true };
}
