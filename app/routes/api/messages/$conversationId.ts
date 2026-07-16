import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/message-events";
import { ownsFeedImageUrl } from "@/lib/storage/keys";
import { gifUrlSchema, feedImageUrlSchema } from "@/lib/rmhark-schema";
import { z } from "zod";

const sendSchema = z
  .object({
    content: z.string().max(2000).optional().default(""),
    gifUrl: gifUrlSchema.optional(),
    imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
  })
  .refine(
    (d) => d.content.trim().length > 0 || !!d.gifUrl || (d.imageUrls?.length ?? 0) > 0,
    { message: "Message must have text, an image, or a GIF" },
  );

/** GET /api/messages/[conversationId] — get messages in a conversation */

/** POST /api/messages/[conversationId] — send a message in an existing conversation */

export const Route = createFileRoute('/api/messages/$conversationId')({
  server: {
    handlers: {
  GET: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantOneId: true, participantTwoId: true },
    });

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = 50;

    const messages = await prisma.directMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "desc" },
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
    // added a write round-trip to every conversation open / scroll-back.
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
      .catch((e) => console.error("mark-as-read failed:", e));

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
    console.error("Get messages error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
  POST: async ({ request, params }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(request);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60_000,
      prefix: "send-message",
    });
    if (!allowed) {
      return Response.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { conversationId } = params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantOneId: true, participantTwoId: true },
    });

    if (!conversation) {
      return Response.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    // Images must belong to the sender (filename is prefixed with their id).
    if (parsed.data.imageUrls?.some((u) => !ownsFeedImageUrl(u, userId))) {
      return Response.json({ error: "Invalid image reference" }, { status: 400 });
    }

    // Re-check DM privacy of recipient
    const recipientId =
      conversation.participantOneId === userId
        ? conversation.participantTwoId
        : conversation.participantOneId;

    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: { profile: { select: { dmPrivacy: true } } },
    });

    const dmPrivacy = recipient?.profile?.dmPrivacy ?? "EVERYONE";

    if (dmPrivacy === "NONE") {
      return Response.json(
        { error: "This user is no longer accepting messages." },
        { status: 403 }
      );
    }

    if (dmPrivacy === "FOLLOWERS") {
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
            error:
              "This user only accepts messages from people they follow.",
          },
          { status: 403 }
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

    // Notify recipient via SSE with message payload
    notifyUser(recipientId, {
      type: "new-message",
      message: messagePayload,
    });

    return Response.json({
      message: messagePayload,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
