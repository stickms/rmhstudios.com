import { prisma } from '@/lib/prisma.server';
import { resolveUserDisplay } from '@/lib/user-display';

export interface ConversationListItem {
  id: string;
  otherUser: { id: string; name: string | null; image: string | null; username: string | null };
  lastMessage: {
    id: string;
    content: string;
    senderId: string;
    read: boolean;
    createdAt: string;
    gifUrl: string | null;
    imageUrls: string[];
  } | null;
  unreadCount: number;
  lastMessageAt: string;
}

/**
 * List a user's DM conversations, most-recent first (cursor-paginated). Shared
 * by the `/api/messages` GET handler and the `/messages` route loader so the
 * inbox is server-rendered / prefetched instead of fetched on mount.
 */
export async function listConversations(
  userId: string,
  opts: { cursor?: string | null; limit?: number } = {}
): Promise<{ conversations: ConversationListItem[]; nextCursor: string | null; hasMore: boolean }> {
  const limit = opts.limit ?? 20;
  const conversations = await prisma.conversation.findMany({
    where: { OR: [{ participantOneId: userId }, { participantTwoId: userId }] },
    orderBy: { lastMessageAt: 'desc' },
    take: limit + 1,
    ...(opts.cursor ? { cursor: { id: opts.cursor }, skip: 1 } : {}),
    include: {
      participantOne: {
        select: {
          id: true, name: true, image: true, username: true,
          profile: { select: { displayName: true, customImage: true } },
        },
      },
      participantTwo: {
        select: {
          id: true, name: true, image: true, username: true,
          profile: { select: { displayName: true, customImage: true } },
        },
      },
      messages: {
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, senderId: true, read: true, createdAt: true, gifUrl: true, imageUrls: true },
      },
    },
  });

  const hasMore = conversations.length > limit;
  const items = hasMore ? conversations.slice(0, limit) : conversations;

  const unreadCounts = await prisma.directMessage.groupBy({
    by: ['conversationId'],
    where: { conversationId: { in: items.map((c) => c.id) }, senderId: { not: userId }, read: false },
    _count: { id: true },
  });
  const unreadMap = new Map(unreadCounts.map((u) => [u.conversationId, u._count.id]));

  const result: ConversationListItem[] = items.map((conv) => {
    const otherUser = conv.participantOneId === userId ? conv.participantTwo : conv.participantOne;
    const resolved = resolveUserDisplay(otherUser);
    const lastMessage = conv.messages[0] ?? null;
    return {
      id: conv.id,
      otherUser: { id: otherUser.id, name: resolved.name, image: resolved.image, username: otherUser.username },
      lastMessage: lastMessage
        ? {
            id: lastMessage.id,
            content: lastMessage.content,
            senderId: lastMessage.senderId,
            read: lastMessage.read,
            createdAt: lastMessage.createdAt.toISOString(),
            gifUrl: lastMessage.gifUrl,
            imageUrls: lastMessage.imageUrls,
          }
        : null,
      unreadCount: unreadMap.get(conv.id) ?? 0,
      lastMessageAt: conv.lastMessageAt.toISOString(),
    };
  });

  return {
    conversations: result,
    nextCursor: hasMore ? items[items.length - 1].id : null,
    hasMore,
  };
}
