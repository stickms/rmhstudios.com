import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';

/** GET /api/group-chats/$id — group detail + messages (members only). */
export const Route = createFileRoute('/api/group-chats/$id/')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const membership = await prisma.groupChatMember.findUnique({
            where: { groupId_userId: { groupId: params.id, userId } },
            select: { id: true },
          });
          if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

          const group = await prisma.groupChat.findUnique({
            where: { id: params.id },
            select: {
              id: true,
              name: true,
              ownerId: true,
              members: { select: { user: { select: userDisplaySelect } } },
              messages: {
                orderBy: { createdAt: 'asc' },
                take: 200,
                select: { id: true, content: true, createdAt: true, sender: { select: userDisplaySelect } },
              },
            },
          });
          if (!group) return Response.json({ error: 'Not found' }, { status: 404 });

          // Mark read.
          await prisma.groupChatMember.update({
            where: { groupId_userId: { groupId: params.id, userId } },
            data: { lastReadAt: new Date() },
          });

          return Response.json({
            group: {
              id: group.id,
              name: group.name,
              isOwner: group.ownerId === userId,
              members: group.members.map((m) => resolveUser(m.user)),
              messages: group.messages.map((msg) => ({
                id: msg.id,
                content: msg.content,
                createdAt: msg.createdAt,
                sender: resolveUser(msg.sender),
              })),
            },
          });
        } catch (error) {
          console.error('Group detail error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
