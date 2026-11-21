import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { getGroupChatApi } from '@/lib/group-chat/group-chat.contract';
import { prisma } from '@/lib/prisma.server';
import { GROUP_KIND, findGroupMembership } from '@/lib/chat/chat.server';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';

/** GET /api/group-chats/$id — group detail + messages (members only). */
export const route = apiRoute('/api/group-chats/$id', {
  GET: implement(getGroupChatApi, {}, async ({ params, session }) => {
    const userId = session.user.id;

    const membership = await findGroupMembership(params.id, userId, { id: true });
    if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

    const group = await prisma.chat.findFirst({
        where: { id: params.id, kind: GROUP_KIND },
      select: {
        id: true,
        name: true,
        ownerId: true,
        members: { select: { user: { select: userDisplaySelect } } },
        messages: {
          // Side-thread replies (M7) and expired disappearing messages (M3)
          // are not part of the main stream. `take` on an ascending order
          // keeps the pre-existing behaviour of the first 200.
          where: { threadParentId: null, AND: [liveMessages()] },
          orderBy: { createdAt: 'asc' },
          take: 200,
          select: groupMessageSelect,
        },
      },
    });
    if (!group) return Response.json({ error: 'Not found' }, { status: 404 });

    // Mark read.
    await prisma.chatMember.update({
      where: { chatId_userId: { chatId: params.id, userId } },
      data: { lastReadAt: new Date() },
    });

    return Response.json({
      group: {
        id: group.id,
        name: group.name ?? '',
        isOwner: group.ownerId === userId,
        ownerId: group.ownerId,
        members: group.members.map((m) => resolveUser(m.user)),
        messages: await serializeGroupMessages(group.messages, userId),
      },
    });
  }),
});
