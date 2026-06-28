import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { getActiveBan } from '@/lib/admin-audit.server';
import { publishGroupMessage } from '@/lib/group-events';
import { gifUrlSchema, feedImageUrlSchema } from '@/lib/rmhark-schema';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';

const schema = z.object({
  content: z.string().max(2000).optional(),
  gifUrl: gifUrlSchema.optional(),
  imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
  poll: z
    .object({
      question: z.string().trim().min(1).max(300),
      options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
    })
    .optional(),
});

/**
 * GET  /api/group-chats/$id/messages?after= — poll for new messages.
 * POST /api/group-chats/$id/messages — send a message (members only). Accepts
 *      text and/or a GIF, up to 4 images, or an inline poll.
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
            select: groupMessageSelect,
          });

          await prisma.groupChatMember.update({
            where: { groupId_userId: { groupId: params.id, userId } },
            data: { lastReadAt: new Date() },
          });

          return Response.json({ messages: await serializeGroupMessages(messages, userId) });
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

          const parsed = schema.safeParse(await request.json().catch(() => ({})));
          if (!parsed.success) return Response.json({ error: 'Invalid message' }, { status: 400 });
          const { content, gifUrl, imageUrls, poll } = parsed.data;

          const text = content?.trim() ?? '';
          const hasMedia = !!gifUrl || (imageUrls?.length ?? 0) > 0;
          if (!text && !hasMedia && !poll) {
            return Response.json({ error: 'Empty message' }, { status: 400 });
          }
          // Images must belong to the sender (filename is prefixed with their id).
          if (imageUrls?.some((u) => !ownsFeedImageUrl(u, userId))) {
            return Response.json({ error: 'Invalid image reference' }, { status: 400 });
          }

          const [message] = await prisma.$transaction([
            prisma.groupMessage.create({
              data: {
                groupId: params.id,
                senderId: userId,
                content: text,
                gifUrl: gifUrl ?? null,
                imageUrls: imageUrls ?? [],
                pollQuestion: poll?.question ?? null,
                pollOptions: poll?.options ?? [],
              },
              select: groupMessageSelect,
            }),
            prisma.groupChat.update({ where: { id: params.id }, data: { lastMessageAt: new Date() } }),
            prisma.groupChatMember.update({
              where: { groupId_userId: { groupId: params.id, userId } },
              data: { lastReadAt: new Date() },
            }),
          ]);

          const [payload] = await serializeGroupMessages([message], userId);
          // Push to connected members over SSE (best-effort). myVote is per-viewer,
          // so it stays null in the fan-out; recipients haven't voted yet anyway.
          publishGroupMessage(params.id, { ...payload, poll: payload.poll ? { ...payload.poll, myVote: null } : null });

          return Response.json({ message: payload }, { status: 201 });
        } catch (error) {
          console.error('Group message send error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
