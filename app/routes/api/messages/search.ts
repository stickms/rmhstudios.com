import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { resolveUserDisplay } from '@/lib/user-display';

/**
 * GET /api/messages/search?q= — search the viewer's conversations by the other
 * participant (name / username / handle) or by message content. Scoped to the
 * viewer's own conversations, so the content search only ever touches messages
 * they can already read. Returns the same shape as the conversation list, plus
 * an optional `matchSnippet` for content hits.
 */
export const Route = createFileRoute('/api/messages/search')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 30, windowMs: 60_000, prefix: 'messages-search' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const userId = session.user.id;
          const q = new URL(request.url).searchParams.get('q')?.trim();
          if (!q) return Response.json({ conversations: [] });

          const nameMatch = {
            OR: [
              { name: { contains: q, mode: 'insensitive' as const } },
              { username: { contains: q, mode: 'insensitive' as const } },
              { handle: { contains: q, mode: 'insensitive' as const } },
            ],
          };
          const mine = [{ participantOneId: userId }, { participantTwoId: userId }];

          const conversations = await prisma.conversation.findMany({
            where: {
              OR: [
                { participantOneId: userId, participantTwo: nameMatch },
                { participantTwoId: userId, participantOne: nameMatch },
                { AND: [{ OR: mine }, { messages: { some: { content: { contains: q, mode: 'insensitive' } } } }] },
              ],
            },
            orderBy: { lastMessageAt: 'desc' },
            take: 30,
            include: {
              participantOne: {
                select: { id: true, name: true, image: true, username: true, profile: { select: { displayName: true, customImage: true } } },
              },
              participantTwo: {
                select: { id: true, name: true, image: true, username: true, profile: { select: { displayName: true, customImage: true } } },
              },
              messages: {
                orderBy: { createdAt: 'desc' },
                take: 1,
                select: { id: true, content: true, senderId: true, read: true, createdAt: true, gifUrl: true, imageUrls: true },
              },
            },
          });

          // Latest content-matching message per conversation, for a snippet.
          const ids = conversations.map((c) => c.id);
          const matches = ids.length
            ? await prisma.directMessage.findMany({
                where: { conversationId: { in: ids }, content: { contains: q, mode: 'insensitive' } },
                orderBy: { createdAt: 'desc' },
                distinct: ['conversationId'],
                select: { conversationId: true, content: true },
              })
            : [];
          const snippetMap = new Map(matches.map((m) => [m.conversationId, m.content]));

          const result = conversations.map((conv) => {
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
              matchSnippet: snippetMap.get(conv.id) ?? null,
              unreadCount: 0,
              lastMessageAt: conv.lastMessageAt.toISOString(),
            };
          });

          return Response.json({ conversations: result });
        } catch (error) {
          console.error('Message search error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
