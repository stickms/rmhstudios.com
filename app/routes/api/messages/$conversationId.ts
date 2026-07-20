import { createFileRoute } from '@tanstack/react-router';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/prisma.server';
import { checkRateLimit, getClientIp } from '@/lib/rate-limit.server';
import { redisEnabled, redisGetJSON, redisIncrBy } from '@/lib/redis.server';
import { readJsonLimited, RequestTooLargeError } from '@/lib/request-limits';
import { notifyUser } from '@/lib/message-events';
import { ownsFeedImageUrl } from '@/lib/storage/keys';
import { gifUrlSchema, feedImageUrlSchema } from '@/lib/rmhark-schema';
import { z } from 'zod';

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

const sendSchema = z
  .object({
    content: z.string().max(2000).optional().default(''),
    gifUrl: gifUrlSchema.optional(),
    imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
  })
  .refine((d) => d.content.trim().length > 0 || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0, {
    message: 'Message must have text, an image, or a GIF',
  });

/** GET /api/messages/[conversationId] — get messages in a conversation */

/** POST /api/messages/[conversationId] — send a message in an existing conversation */

export const Route = createFileRoute('/api/messages/$conversationId')({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { conversationId } = params;
          const userId = session.user.id;

          // Verify user is a participant
          const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { participantOneId: true, participantTwoId: true },
          });

          if (!conversation) {
            return Response.json({ error: 'Conversation not found' }, { status: 404 });
          }

          if (
            conversation.participantOneId !== userId &&
            conversation.participantTwoId !== userId
          ) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
          }

          const url = new URL(request.url);
          const cursor = url.searchParams.get('cursor');
          const limit = 50;

          const messages = await prisma.directMessage.findMany({
            where: { conversationId },
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
          void prisma.directMessage
            .updateMany({
              where: {
                conversationId,
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

          return Response.json({
            messages: items.reverse().map((m) => ({
              id: m.id,
              content: m.content,
              senderId: m.senderId,
              read: m.read,
              createdAt: m.createdAt.toISOString(),
              gifUrl: m.gifUrl,
              imageUrls: m.imageUrls,
              reactions: m.reactions,
            })),
            nextCursor: hasMore ? items[items.length - 1].id : null,
            hasMore,
          });
        } catch (error) {
          console.error('Get messages error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
      POST: async ({ request, params }) => {
        try {
          const session = await auth.api.getSession({ headers: request.headers });
          if (!session) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
          }

          const { conversationId } = params;
          const userId = session.user.id;

          // Anti-spam, tuned to never hinder a real fast-typed conversation — only
          // botnet-scale flooding. Every limit carries the global ×4 multiplier, so
          // effective ceilings sit far above any human typer:
          //   • per-IP     ~120/min  (coarse; pre-existing, now Redis-coordinated)
          //   • per-sender ~240/min  (bounds one account regardless of IP rotation)
          // The per-(sender→recipient) limit is applied below, once we know the target.
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

          // Verify user is a participant
          const conversation = await prisma.conversation.findUnique({
            where: { id: conversationId },
            select: { participantOneId: true, participantTwoId: true },
          });

          if (!conversation) {
            return Response.json({ error: 'Conversation not found' }, { status: 404 });
          }

          if (
            conversation.participantOneId !== userId &&
            conversation.participantTwoId !== userId
          ) {
            return Response.json({ error: 'Forbidden' }, { status: 403 });
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
          const parsed = sendSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.issues[0]?.message ?? 'Invalid input' },
              { status: 400 },
            );
          }

          // Images must belong to the sender (filename is prefixed with their id).
          if (parsed.data.imageUrls?.some((u) => !ownsFeedImageUrl(u, userId))) {
            return Response.json({ error: 'Invalid image reference' }, { status: 400 });
          }

          // Re-check DM privacy of recipient
          const recipientId =
            conversation.participantOneId === userId
              ? conversation.participantTwoId
              : conversation.participantOneId;

          // Per-(sender→recipient) limit: bounds targeted flooding of one person while
          // staying generous for a normal rapid exchange (~160/min effective).
          const pairRl = await checkRateLimit(`${userId}:${recipientId}`, {
            limit: 40,
            windowMs: 60_000,
            prefix: 'dm:to',
          });
          if (!pairRl.allowed) {
            return Response.json(
              { error: "You're messaging this person too quickly. Please slow down." },
              { status: 429, headers: { 'Retry-After': String(pairRl.retryAfter) } },
            );
          }

          const recipient = await prisma.user.findUnique({
            where: { id: recipientId },
            select: { profile: { select: { dmPrivacy: true } } },
          });

          const dmPrivacy = recipient?.profile?.dmPrivacy ?? 'EVERYONE';

          if (dmPrivacy === 'NONE') {
            return Response.json(
              { error: 'This user is no longer accepting messages.' },
              { status: 403 },
            );
          }

          if (dmPrivacy === 'FOLLOWERS') {
            const follows = await prisma.follow.findUnique({
              where: {
                followerId_followingId: {
                  followerId: recipientId,
                  followingId: userId,
                },
              },
            });
            if (!follows) {
              return Response.json(
                {
                  error: 'This user only accepts messages from people they follow.',
                },
                { status: 403 },
              );
            }
          }

          const [message] = await prisma.$transaction([
            prisma.directMessage.create({
              data: {
                conversationId,
                senderId: userId,
                content: parsed.data.content,
                gifUrl: parsed.data.gifUrl ?? null,
                imageUrls: parsed.data.imageUrls ?? [],
              },
            }),
            prisma.conversation.update({
              where: { id: conversationId },
              data: { lastMessageAt: new Date() },
            }),
          ]);

          const messagePayload = {
            id: message.id,
            conversationId,
            content: message.content,
            senderId: message.senderId,
            read: message.read,
            createdAt: message.createdAt.toISOString(),
            gifUrl: message.gifUrl,
            imageUrls: message.imageUrls,
            reactions: [],
          };

          // Bump the recipient's denormalized unread counter (only if warm) before we
          // notify them, so their SSE stream reads the fresh count without a COUNT.
          void adjustDmUnread(recipientId, 1);

          // Notify recipient via SSE with message payload
          notifyUser(recipientId, {
            type: 'new-message',
            message: messagePayload,
          });

          return Response.json({
            message: messagePayload,
          });
        } catch (error) {
          console.error('Send message error:', error);
          return Response.json({ error: 'Internal Server Error' }, { status: 500 });
        }
      },
    },
  },
});
