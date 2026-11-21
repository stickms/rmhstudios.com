import { apiRoute } from '@/lib/api/route.server';
import { defineHandler } from '@/lib/api/handler.server';
import { implement } from '@/lib/api/implement.server';
import { sendToConversationApi } from '@/lib/messages/message-actions.contract';
import { sendToConversationBody } from '@/lib/messages/message-actions-schema';
import { prisma } from '@/lib/prisma.server';
import { findDm } from '@/lib/chat/chat.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { redisEnabled, redisGetJSON, redisIncrBy } from '@/lib/redis.server';
import { readJsonLimited, RequestTooLargeError } from '@/lib/request-limits';
import { guardDirect, sendDirectMessage } from '@/lib/messages/send.server';
import { normalizeImageAlts } from '@/lib/messages/image-alts';
import { liveMessages } from '@/lib/chat-plus/expiry.server';
import { getPairPrivacy, maskReceipts } from '@/lib/chat-plus/receipts.server';
import { hiddenFromRecipient, requestOut } from '@/lib/messages/requests';

/**
 * Denormalized DM unread counter (per recipient) in Redis. Keeps the polled
 * unread-count endpoint and the SSE stream off an O(conversations) COUNT on
 * every read/delivered event. The counter is a *cache over a warm key*: reads
 * (in the unread-count / stream routes) lazily backfill it from a real COUNT on
 * a miss with a short TTL, so writes here only nudge an already-warm counter and
 * never initialize a cold one to a partial value (a cold key just backfills
 * correctly on the next read, since the message row is already persisted).
 */
const DM_UNREAD_TTL_MS = 60_000;
const dmUnreadKey = (userId: string) => `dm:unread:${userId}`;

/** Nudge a *warm* DM-unread counter by `delta`, clamped at 0. No-op without
 * Redis or when the counter isn't currently cached. */
async function adjustDmUnread(userId: string, delta: number): Promise<void> {
  if (delta === 0 || !redisEnabled()) return;
  try {
    const key = dmUnreadKey(userId);
    const current = await redisGetJSON<number>(key);
    if (typeof current !== 'number') return; // cold — let the next read backfill
    const next = await redisIncrBy(key, delta, DM_UNREAD_TTL_MS);
    if (next !== null && next < 0) await redisIncrBy(key, -next, DM_UNREAD_TTL_MS);
  } catch {
    /* best-effort — the counter self-heals from COUNT on TTL expiry */
  }
}

/** GET /api/messages/[conversationId] — get messages in a conversation */

/** POST /api/messages/[conversationId] — send a message in an existing conversation */

export const route = apiRoute('/api/messages/$conversationId', {
  GET: defineHandler({}, async ({ request, params, session }) => {
    const { conversationId } = params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await findDm(conversationId);

    if (!conversation) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    if (conversation.participantOneId !== userId && conversation.participantTwoId !== userId) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // A message request waiting for this viewer is read from the Requests folder only (s04-16).
    if (hiddenFromRecipient(conversation.request, userId)) {
      return Response.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get('cursor');
    const limit = 50;

    const messages = await prisma.chatMessage.findMany({
      where: { chatId: conversationId, AND: [liveMessages()] },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: {
        id: true,
        content: true,
        senderId: true,
        read: true,
        createdAt: true,
        gifUrl: true,
        imageUrls: true,
        imageAlts: true,
        reactions: { select: { emoji: true, userId: true } },
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // Mark unread messages from the other person as read — fire-and-forget.
    // The response returns each message's pre-update `read` value from `items`
    // (fetched above), so the write's result is never used; awaiting it only
    // added a write round-trip to every conversation open / scroll-back. We do
    // read `count` off the batch payload (still non-blocking) to decrement the
    // viewer's denormalized DM-unread counter by exactly the number marked read.
    // perf: skip the write entirely when nothing on this page is an unread
    // message from the other participant (the common case when scrolling back
    // or re-opening a read thread). Same predicate as the updateMany below.
    const hasUnreadFromOther = items.some((m) => !m.read && m.senderId !== userId);
    if (hasUnreadFromOther)
      void prisma.chatMessage
        .updateMany({
          where: {
            chatId: conversationId,
            senderId: { not: userId },
            read: false,
            id: { in: items.map((m) => m.id) },
          },
          data: { read: true },
        })
        .then((res) => {
          if (res.count > 0) void adjustDmUnread(userId, -res.count);
        })
        .catch((e) => console.error('mark-as-read failed:', e));

    const privacy = await getPairPrivacy(conversationId, [
      conversation.participantOneId,
      conversation.participantTwoId,
    ]);
    const masked = maskReceipts(
      items.reverse(),
      userId,
      (privacy.receiptsHidden && conversation.participantOneId !== conversation.participantTwoId) ||
        requestOut(conversation.request, userId),
    );

    return Response.json({
      messages: masked.map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
        gifUrl: m.gifUrl,
        imageUrls: m.imageUrls,
        imageAlts: normalizeImageAlts(m.imageUrls, m.imageAlts),
        reactions: m.reactions,
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    });
  }),
  POST: implement(sendToConversationApi, {}, async ({ request, params, session }) => {
    const { conversationId } = params;
    const userId = session.user.id;

    // Restriction, then existence and participation, before any rate limit or
    // body parse: a restricted user or a stranger never spends tokens or sees a
    // validation error first.
    const gate = await guardDirect(userId, conversationId);
    if (!gate.ok) return gate.response;

    // Anti-spam, tuned to never hinder a real fast-typed conversation — only
    // botnet-scale flooding. Every limit carries the global ×4 multiplier, so
    // effective ceilings sit far above any human typer:
    //   • per-IP     ~120/min  (coarse; pre-existing, now Redis-coordinated)
    //   • per-sender ~240/min  (bounds one account regardless of IP rotation)
    // The per-(sender→recipient) limit is applied by `sendDirectMessage`, once
    // it knows the target.
    const ipRl = await checkRateLimit(getClientIp(request), {
      limit: 30,
      windowMs: 60_000,
      prefix: 'send-message',
    });
    if (!ipRl.allowed) {
      return Response.json(
        { error: 'Too many requests' },
        { status: 429, headers: { 'Retry-After': String(ipRl.retryAfter) } },
      );
    }
    const senderRl = await checkRateLimit(userId, {
      limit: 60,
      windowMs: 60_000,
      prefix: 'dm:send',
    });
    if (!senderRl.allowed) {
      return Response.json(
        { error: "You're sending messages too quickly. Please slow down." },
        { status: 429, headers: { 'Retry-After': String(senderRl.retryAfter) } },
      );
    }

    let body: unknown;
    try {
      // A DM is tiny (2000-char text + a few media URLs); cap well below the
      // generic 1 MB so an oversized body is rejected before it's buffered.
      body = await readJsonLimited(request, 256 * 1024);
    } catch (e) {
      if (e instanceof RequestTooLargeError) {
        return Response.json({ error: 'Message payload too large' }, { status: 413 });
      }
      return Response.json({ error: 'Invalid input' }, { status: 400 });
    }
    const parsed = sendToConversationBody.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }

    const sent = await sendDirectMessage({
      userId,
      conversationId,
      input: parsed.data,
      pairRateLimit: true,
      conversation: gate.value,
      // A refused sender's first text message may become a message request (s04-16).
      allowRequest: true,
    });
    return sent.ok ? sent.value : sent.response;
  }),
});
