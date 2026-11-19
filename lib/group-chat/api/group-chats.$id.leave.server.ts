import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { prisma } from '@/lib/prisma.server';
import { GROUP_KIND, findGroupMembership } from '@/lib/chat/chat.server';

/**
 * POST /api/group-chats/$id/leave — leave a group. If the owner leaves,
 * ownership passes to the oldest remaining member; last one out disbands it.
 */
export const route = apiRoute('/api/group-chats/$id/leave', {
  POST: defineHandler(
    { rateLimit: { policy: 'write', scope: 'user', prefix: 'mutation:group-chats/:id/leave' } },
    async ({ params, session }) => {
      const userId = session.user.id;

      const group = await prisma.chat.findFirst({
        where: { id: params.id, kind: GROUP_KIND },
        select: { id: true, ownerId: true, _count: { select: { members: true } } },
      });
      if (!group) return Response.json({ error: 'Not found' }, { status: 404 });

      const membership = await findGroupMembership(params.id, userId, { id: true });
      if (!membership) return Response.json({ error: 'Not a member' }, { status: 400 });

      await prisma.$transaction(async (tx) => {
        await tx.chatMember.delete({ where: { id: membership.id } });
        if (group._count.members - 1 <= 0) {
          await tx.chat.delete({ where: { id: group.id } });
          return;
        }
        if (group.ownerId === userId) {
          const heir = await tx.chatMember.findFirst({
            where: { chatId: group.id },
            orderBy: { joinedAt: 'asc' },
            select: { userId: true },
          });
          if (heir)
            await tx.chat.update({
              where: { id: group.id },
              data: { ownerId: heir.userId },
            });
        }
      });

      return Response.json({ success: true });
    },
  ),
});
