import { prisma } from '@/lib/prisma.server';

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
  userId: string
): Promise<{ groups: GroupChatRow[]; signedIn: true }> {
  const memberships = await prisma.groupChatMember.findMany({
    where: { userId },
    select: {
      lastReadAt: true,
      group: {
        select: {
          id: true,
          name: true,
          lastMessageAt: true,
          _count: { select: { members: true } },
          messages: { orderBy: { createdAt: 'desc' }, take: 1, select: { content: true, createdAt: true, senderId: true } },
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
    .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

  return { groups, signedIn: true };
}
