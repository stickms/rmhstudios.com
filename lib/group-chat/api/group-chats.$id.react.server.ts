import { refusalBody } from '@/lib/errors/codes';
import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma.server';
import { findGroupMembership } from '@/lib/chat/chat.server';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { publishGroupEvent } from '@/lib/group-events';
import { isValidReactionEmoji } from '@/lib/social/reactions';
import { toggleGroupMessageReaction } from '@/lib/social/reactions.server';

const reactSchema = z.object({
  messageId: z.string(),
  emoji: z.string().min(1).max(32),
});

/** POST /api/group-chats/$id/react — toggle an emoji reaction on a group message (members only). */
export const route = apiRoute('/api/group-chats/$id/react', {
  POST: defineHandler({}, async ({ request, params, session }) => {
    const userId = session.user.id;

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 60,
      windowMs: 60_000,
      prefix: 'reaction',
    });
    if (!allowed) {
      return Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } },
      );
    }

    const membership = await findGroupMembership(params.id, userId, { id: true });
    if (!membership) return Response.json({ error: 'Not found' }, { status: 404 });

    const parsed = reactSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isValidReactionEmoji(parsed.data.emoji)) {
      return Response.json({ ...refusalBody('MESSAGE_EMOJI_INVALID') }, { status: 400 });
    }

    const result = await toggleGroupMessageReaction(
      userId,
      params.id,
      parsed.data.messageId,
      parsed.data.emoji,
    );
    if (!result.found) return Response.json({ ...refusalBody('MESSAGE_NOT_FOUND') }, { status: 404 });

    publishGroupEvent(params.id, {
      type: 'reaction',
      messageId: parsed.data.messageId,
      reactions: result.rows,
    });

    return Response.json({ success: true, reacted: result.reacted, reactions: result.rows });
  }),
});
