import { apiRoute } from '@/lib/api/route.server';
import { implement } from '@/lib/api/implement.server';
import { pollGroupMessagesApi, sendGroupMessageApi } from '@/lib/group-chat/group-chat.contract';
import { prisma } from '@/lib/prisma.server';
import { findGroupMembership } from '@/lib/chat/chat.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { z } from 'zod';
import { gifUrlSchema, feedImageUrlSchema } from '@/lib/rmhark-schema';
import {
  ALTS_MISMATCH_ISSUE,
  altsMatchImages,
  messageImageAltsField,
} from '@/lib/messages/image-alts-schema';
import { groupMessageSelect, serializeGroupMessages } from '@/lib/group-chat/serialize.server';
import { guardGroupAccount, guardGroupMembership, sendGroupMessage } from '@/lib/messages/send.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';

const schema = z
  .object({
    content: z.string().max(2000).optional(),
    gifUrl: gifUrlSchema.optional(),
    imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
    imageAlts: messageImageAltsField,
    poll: z
      .object({
        question: z.string().trim().min(1).max(300),
        options: z.array(z.string().trim().min(1).max(100)).min(2).max(6),
      })
      .optional(),
  })
  .refine(altsMatchImages, ALTS_MISMATCH_ISSUE);

/**
 * GET  /api/group-chats/$id/messages?after= — poll for new messages.
 * POST /api/group-chats/$id/messages — send a message (members only). Accepts
 *      text and/or a GIF, up to 4 images, or an inline poll.
 */
export const route = apiRoute('/api/group-chats/$id/messages', {
  GET: implement(pollGroupMessagesApi, {}, async ({ request, params, session }) => {
    const userId = session.user.id;

    const membership = await findGroupMembership(params.id, userId, { id: true });
    if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

    const after = new URL(request.url).searchParams.get('after');
    const messages = await prisma.chatMessage.findMany({
      where: {
        chatId: params.id,
        threadParentId: null,
        AND: [liveMessages()],
        ...(after ? { createdAt: { gt: new Date(after) } } : {}),
      },
      orderBy: { createdAt: 'asc' },
      take: 100,
      select: groupMessageSelect,
    });

    await prisma.chatMember.update({
      where: { chatId_userId: { chatId: params.id, userId } },
      data: { lastReadAt: new Date() },
    });

    return Response.json({ messages: await serializeGroupMessages(messages, userId) });
  }),

  POST: implement(sendGroupMessageApi, {}, async ({ request, params, session }) => {
    const userId = session.user.id;

    const denied = await guardGroupAccount(userId);
    if (denied) return denied.response;

    const ip = getClientIp(request);
    const { allowed } = rateLimit(ip, { limit: 40, windowMs: 60_000, prefix: 'group-msg' });
    if (!allowed) return Response.json({ error: 'Too many requests' }, { status: 429 });

    const gate = await guardGroupMembership(userId, params.id);
    if (!gate.ok) return gate.response;

    const parsed = schema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) return Response.json({ error: 'Invalid message' }, { status: 400 });

    const sent = await sendGroupMessage({ userId, groupId: params.id, input: parsed.data, membership: gate.value });
    return sent.ok ? Response.json({ message: sent.value.message }, { status: 201 }) : sent.response;
  }),
});
