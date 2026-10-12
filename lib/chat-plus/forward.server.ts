/**
 * M10 — forwarding with an anti-virality hop counter. Server-only.
 *
 * `forwardCount` on the new copy is the source's count plus one. Past
 * {@link FORWARD_MANY_THRESHOLD} hops the message is "forwarded many times" and
 * may only be sent to one chat at a time — enforced here, not just in the UI.
 */

import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { getActiveBan } from '@/lib/admin-audit.server';
import { getChatAccess } from '@/lib/chat-plus/access.server';
import { canDirectMessage } from '@/lib/chat-plus/dm-privacy.server';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { postChatMessage } from '@/lib/chat-plus/post.server';
import { FORWARD_MAX_TARGETS, maxForwardTargets } from '@/lib/chat-plus/flags';
import { chatRefSchema, type ChatRef } from '@/lib/chat-plus/types';

export const forwardSchema = z.object({
  source: chatRefSchema,
  messageId: z.string().min(1).max(40),
  targets: z.array(chatRefSchema).min(1).max(FORWARD_MAX_TARGETS),
});
export type ForwardInput = z.infer<typeof forwardSchema>;

export type ForwardResult =
  | {
      ok: true;
      sent: ChatRef[];
      failed: { target: ChatRef; error: string }[];
      forwardCount: number;
    }
  | { ok: false; status: number; error: string };

export async function forwardMessage(userId: string, input: ForwardInput): Promise<ForwardResult> {
  if (await getActiveBan(userId))
    return { ok: false, status: 403, error: 'Your account is suspended' };

  const source = await getChatAccess(input.source.kind, input.source.id, userId);
  if (!source) return { ok: false, status: 404, error: 'Message not found' };

  const select = {
    id: true,
    content: true,
    gifUrl: true,
    imageUrls: true,
    audioUrl: true,
    kind: true,
    forwardCount: true,
    deletedAt: true,
  } as const;
  const live = liveMessages();
  const msg =
    source.kind === 'dm'
      ? await prisma.directMessage.findFirst({
          where: { id: input.messageId, conversationId: source.id, AND: [live] },
          select,
        })
      : await prisma.groupMessage.findFirst({
          where: { id: input.messageId, groupId: source.id, AND: [live] },
          select,
        });
  if (!msg || msg.deletedAt) return { ok: false, status: 404, error: 'Message not found' };
  if (source.kind === 'dm') {
    const hidden = await prisma.directMessageHide.findUnique({
      where: { messageId_userId: { messageId: msg.id, userId } },
      select: { messageId: true },
    });
    if (hidden) return { ok: false, status: 404, error: 'Message not found' };
  }
  if (msg.kind !== 'text' || msg.audioUrl) {
    return { ok: false, status: 400, error: "This kind of message can't be forwarded" };
  }
  if (!msg.content.trim() && !msg.gifUrl && msg.imageUrls.length === 0) {
    return { ok: false, status: 400, error: 'Nothing to forward' };
  }

  const targets = [...new Map(input.targets.map((t) => [`${t.kind}:${t.id}`, t])).values()];
  if (targets.length > maxForwardTargets(msg.forwardCount)) {
    return {
      ok: false,
      status: 400,
      error: 'Messages forwarded many times can only go to one chat at a time',
    };
  }

  const forwardCount = msg.forwardCount + 1;
  const sent: ChatRef[] = [];
  const failed: { target: ChatRef; error: string }[] = [];
  for (const target of targets) {
    const access = await getChatAccess(target.kind, target.id, userId);
    if (!access) {
      failed.push({ target, error: 'Chat not found' });
      continue;
    }
    if (
      access.kind === 'dm' &&
      access.otherId &&
      !(await canDirectMessage(userId, access.otherId))
    ) {
      failed.push({ target, error: 'This person is not accepting messages' });
      continue;
    }
    await postChatMessage(access, {
      senderId: userId,
      content: msg.content,
      gifUrl: msg.gifUrl,
      imageUrls: msg.imageUrls,
      forwardCount,
    });
    sent.push(target);
  }
  return { ok: true, sent, failed, forwardCount };
}
