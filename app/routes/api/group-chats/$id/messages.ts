import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { userDisplaySelect, resolveUser } from '@/lib/user-display';
import { getActiveBan } from '@/lib/admin-audit.server';
import { publishGroupMessage } from '@/lib/group-events';

const schema = z.object({ content: z.string().min(1).max(2000) });

/**
 * GET  /api/group-chats/$id/messages?after= — poll for new messages.
 * POST /api/group-chats/$id/messages — send a message (members only).
 */
export const Route = createFileRoute('/api/group-chats/$id/messages')({
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

          const after = new URL(request.url).searchParams.get('after');
          const messages = await prisma.groupMessage.findMany({
            where: { groupId: params.id, ...(after ? { createdAt: { gt: new Date(after) } } : {}) },
            orderBy: { createdAt: 'asc' },
            take: 100,
            select: { id: true, content: true, createdAt: true, sender: { select: userDisplaySelect } },
          });

          await prisma.groupChatMember.update({
            where: { groupId_userId: { groupId: params.id, userId } },
            data: { lastReadAt: new Date() },
          });

          return Response.json({
            messages: messages.map((m) => ({ id: m.id, content: m.content, createdAt: m.createdAt, sender: resolveUser(m.sender) })),
          });
        } catch (error) {
          console.error('Group messages fetch error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },

      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
          const userId = session.user.id;

          const ban = await getActiveBan(userId);
          if (ban) return Response.json({ error: 'Your account is suspended' }, { status: 403 });

          const ip = getClientIp(request);
          const { allowed } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'group-msg' });
          if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

          const membership = await prisma.groupChatMember.findUnique({
            where: { groupId_userId: { groupId: params.id, userId } },
            select: { id: true },
          });
          if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

          const body = await request.json().catch(() => ({}));
          const parsed = schema.safeParse(body);
          if (!parsed.success) return Response.json({ error: 'Invalid message' }, { status: 400 });

          const [message] = await prisma.$transaction([
            prisma.groupMessage.create({
              data: { groupId: params.id, senderId: userId, content: parsed.data.content.trim() },
              select: { id: true, content: true, createdAt: true, sender: { select: userDisplaySelect } },
            }),
            prisma.groupChat.update({ where: { id: params.id }, data: { lastMessageAt: new Date() } }),
            prisma.groupChatMember.update({
              where: { groupId_userId: { groupId: params.id, userId } },
              data: { lastReadAt: new Date() },
            }),
          ]);

          const payload = { id: message.id, content: message.content, createdAt: message.createdAt.toISOString(), sender: resolveUser(message.sender) };
          // Push to connected members over SSE (best-effort).
          publishGroupMessage(params.id, payload);

          return Response.json({ message: payload }, { status: 201 });
        } catch (error) {
          console.error('Group message send error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
