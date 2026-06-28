import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';

const schema = z.object({ optionIdx: z.number().int().min(0).max(5) });

/** POST /api/group-chats/$id/messages/$messageId/vote — cast/replace a poll vote. */
export const Route = createFileRoute('/api/group-chats/$id/messages/$messageId/vote')({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 60, windowMs: 60_000, prefix: 'group-poll-vote' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const membership = await prisma.groupChatMember.findUnique({
            where: { groupId_userId: { groupId: params.id, userId } },
            select: { id: true },
          });
          if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid vote' }, { status: 400 });

          const message = await prisma.groupMessage.findFirst({
            where: { id: params.messageId, groupId: params.id },
            select: { id: true, pollOptions: true, pollQuestion: true },
          });
          if (!message || !message.pollQuestion) return Response.json({ error: 'No such poll' }, { status: 404 });
          if (parsed.data.optionIdx >= message.pollOptions.length) {
            return Response.json({ error: 'Invalid option' }, { status: 400 });
          }

          await prisma.groupPollVote.upsert({
            where: { messageId_userId: { messageId: message.id, userId } },
            create: { messageId: message.id, userId, optionIdx: parsed.data.optionIdx },
            update: { optionIdx: parsed.data.optionIdx },
          });

          const fresh = await prisma.groupMessage.findUnique({ where: { id: message.id }, select: groupMessageSelect });
          const [payload] = await serializeGroupMessages(fresh ? [fresh] : [], userId);
          return Response.json({ poll: payload?.poll ?? null });
        } catch (error) {
          console.error('Group poll vote error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
