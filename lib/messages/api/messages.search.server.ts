import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { searchConversationsApi } from '@/lib/messages/messages.contract';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma.server';
import { dmChatSelect, dmKeyOf, dmsOf, toDmRow } from '@/lib/chat/chat.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { resolveUserDisplay } from '@/lib/user-display';

/**
 * GET /api/messages/search?q= — search the viewer's conversations by the other
 * participant (name / username / handle) or by message content. Scoped to the
 * viewer's own conversations, so the content search only ever touches messages
 * they can already read. Returns the same shape as the conversation list, plus
 * an optional `matchSnippet` for content hits.
 */
export const route = apiRoute('/api/messages/search', {
  GET: implement(
    searchConversationsApi,
    { rateLimit: { limit: 30, windowMs: 60_000, prefix: 'messages-search' } },
    async ({ request, session }) => {
      const userId = session.user.id;
      const q = new URL(request.url).searchParams.get('q')?.trim();
      if (!q) return { conversations: [] };

      const nameMatch = {
        OR: [
          { name: { contains: q, mode: 'insensitive' as const } },
          { username: { contains: q, mode: 'insensitive' as const } },
          { handle: { contains: q, mode: 'insensitive' as const } },
        ],
      };
      const userSelect = {
        id: true,
        name: true,
        image: true,
        username: true,
        isBot: true,
        profile: { select: { displayName: true, customImage: true } },
      } as const;

      const rows = await prisma.chat.findMany({
        where: {
          AND: [
            dmsOf(userId),
            {
              OR: [
                // The other participant's name, or your own in Saved Messages
                // (a chat with yourself), as the participant-pair query matched.
                { members: { some: { userId: { not: userId }, user: nameMatch } } },
                { dmKey: dmKeyOf(userId, userId), members: { some: { user: nameMatch } } },
                {
                  messages: {
                    some: {
                      content: { contains: q, mode: 'insensitive' },
                      AND: [liveMessages()],
                    },
                  },
                },
              ],
            },
          ],
        },
        orderBy: { lastMessageAt: 'desc' },
        take: 30,
        select: {
          ...dmChatSelect,
          members: {
            select: { userId: true, slot: true, user: { select: userSelect } },
            orderBy: { slot: 'asc' },
          },
          messages: {
            where: { AND: [liveMessages()] },
            orderBy: { createdAt: 'desc' },
            take: 1,
            select: {
              id: true,
              content: true,
              senderId: true,
              read: true,
              createdAt: true,
              gifUrl: true,
              imageUrls: true,
            },
          },
        },
      });
      const conversations = rows.flatMap((chat) => {
        const dm = toDmRow(chat);
        if (!dm) return [];
        const userOf = (id: string) => chat.members.find((m) => m.userId === id)?.user;
        const participantOne = userOf(dm.participantOneId);
        const participantTwo = userOf(dm.participantTwoId);
        if (!participantOne || !participantTwo) return [];
        return [{ ...dm, participantOne, participantTwo, messages: chat.messages }];
      });

      // Latest content-matching message per conversation, for a snippet.
      const ids = conversations.map((c) => c.id);
      // DISTINCT ON in the database: at most one row per conversation (<= 30),
      // instead of fetching every matching message in those conversations and
      // de-duplicating in Node. Same ordering (newest match wins) and the same
      // case-insensitive substring semantics as Prisma's `contains`, which does
      // not escape LIKE metacharacters either (verified on the seeded dataset).
      const like = `%${q}%`;
      const matches = ids.length
        ? await prisma.$queryRaw<{ chatId: string; content: string }[]>`
                SELECT DISTINCT ON ("chatId") "chatId", "content"
                FROM "chat_message"
                WHERE "chatId" IN (${Prisma.join(ids)})
                  AND "content" ILIKE ${like}
                  AND ("expiresAt" IS NULL OR "expiresAt" > ${new Date()})
                ORDER BY "chatId", "createdAt" DESC`
        : [];
      const snippetMap = new Map(matches.map((m) => [m.chatId, m.content]));

      const result = conversations.map((conv) => {
        const otherUser =
          conv.participantOneId === userId ? conv.participantTwo : conv.participantOne;
        const resolved = resolveUserDisplay(otherUser);
        const lastMessage = conv.messages[0] ?? null;
        return {
          id: conv.id,
          otherUser: {
            id: otherUser.id,
            name: resolved.name,
            image: resolved.image,
            username: otherUser.username,
            isBot: otherUser.isBot,
          },
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
          matchSnippet: snippetMap.get(conv.id) ?? null,
          unreadCount: 0,
          lastMessageAt: conv.lastMessageAt.toISOString(),
        };
      });

      return { conversations: result };
    },
  ),
});
