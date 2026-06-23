import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';

/**
 * POST /api/group-chats/$id/leave — leave a group. If the owner leaves,
 * ownership passes to the oldest remaining member; last one out disbands it.
 */
export const Route = createFileRoute('/api/group-chats/$id/leave')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const group = await prisma.groupChat.findUnique({
            where: { id: params.id },
            select: { id: true, ownerId: true, _count: { select: { members: true } } },
          });
          if (!group) return Response.json({ error: 'Not found' }, { status: 404 });

          const membership = await prisma.groupChatMember.findUnique({
            where: { groupId_userId: { groupId: params.id, userId } },
            select: { id: true },
          });
          if (!membership) return Response.json({ error: 'Not a member' }, { status: 400 });

          await prisma.$transaction(async (tx) => {
            await tx.groupChatMember.delete({ where: { id: membership.id } });
            if (group._count.members - 1 <= 0) {
              await tx.groupChat.delete({ where: { id: group.id } });
              return;
            }
            if (group.ownerId === userId) {
              const heir = await tx.groupChatMember.findFirst({
                where: { groupId: group.id },
                orderBy: { joinedAt: 'asc' },
                select: { userId: true },
              });
              if (heir) await tx.groupChat.update({ where: { id: group.id }, data: { ownerId: heir.userId } });
            }
          });

          return Response.json({ success: true });
        } catch (error) {
          console.error('Group leave error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
