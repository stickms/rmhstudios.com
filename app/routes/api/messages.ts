import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { resolveUserDisplay } from "@/lib/user-display";
import { notifyUser } from "@/lib/message-events";
import { z } from "zod";

const sendMessageSchema = z.object({
  recipientId: z.string().min(1),
  content: z.string().min(1).max(2000).optional(),
});

/** GET /api/messages — list conversations for current user */

/** POST /api/messages — start or continue a conversation */

export const Route = createFileRoute('/api/messages')({
  server: {
    handlers: {
  GET: async ({ request }) => {
  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;
    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const limit = 20;

    const conversations = await prisma.conversation.findMany({
      where: {
        OR: [
          { participantOneId: userId },
          { participantTwoId: userId },
        ],
      },
      orderBy: { lastMessageAt: "desc" },
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      include: {
        participantOne: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
            profile: { select: { displayName: true, customImage: true } },
          },
        },
        participantTwo: {
          select: {
            id: true,
            name: true,
            image: true,
            username: true,
            profile: { select: { displayName: true, customImage: true } },
          },
        },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            content: true,
            senderId: true,
            read: true,
            createdAt: true,
          },
        },
      },
    });

    const hasMore = conversations.length > limit;
    const items = hasMore ? conversations.slice(0, limit) : conversations;

    // Count unread per conversation
    const unreadCounts = await prisma.directMessage.groupBy({
      by: ["conversationId"],
      where: {
        conversationId: { in: items.map((c) => c.id) },
        senderId: { not: userId },
        read: false,
      },
      _count: { id: true },
    });

    const unreadMap = new Map(
      unreadCounts.map((u) => [u.conversationId, u._count.id])
    );

    const result = items.map((conv) => {
      const otherUser =
        conv.participantOneId === userId
          ? conv.participantTwo
          : conv.participantOne;
      const resolved = resolveUserDisplay(otherUser);
      const lastMessage = conv.messages[0] ?? null;

      return {
        id: conv.id,
        otherUser: {
          id: otherUser.id,
          name: resolved.name,
          image: resolved.image,
          username: otherUser.username,
        },
        lastMessage: lastMessage
          ? {
              id: lastMessage.id,
              content: lastMessage.content,
              senderId: lastMessage.senderId,
              read: lastMessage.read,
              createdAt: lastMessage.createdAt.toISOString(),
            }
          : null,
        unreadCount: unreadMap.get(conv.id) ?? 0,
        lastMessageAt: conv.lastMessageAt.toISOString(),
      };
    });

    return Response.json({
      conversations: result,
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    console.error("List conversations error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
  POST: async ({ request }) => {
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

    const body = await request.json();
    const parsed = sendMessageSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { recipientId, content } = parsed.data;
    const senderId = session.user.id;

    if (recipientId === senderId) {
      return Response.json(
        { error: "Cannot message yourself" },
        { status: 400 }
      );
    }

    // Check recipient exists and DM privacy
    const recipient = await prisma.user.findUnique({
      where: { id: recipientId },
      select: {
        id: true,
        profile: { select: { dmPrivacy: true } },
      },
    });

    if (!recipient) {
      return Response.json({ error: "User not found" }, { status: 404 });
    }

    const dmPrivacy = recipient.profile?.dmPrivacy ?? "EVERYONE";

    if (dmPrivacy === "NONE") {
      return Response.json(
        { error: "This user is not accepting messages." },
        { status: 403 }
      );
    }

    if (dmPrivacy === "FOLLOWERS") {
      // Check if recipient follows the sender
      const follows = await prisma.follow.findUnique({
        where: {
          followerId_followingId: {
            followerId: recipientId,
            followingId: senderId,
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

    // Normalize participant order (alphabetical) for unique constraint
    const [pOne, pTwo] =
      senderId < recipientId
        ? [senderId, recipientId]
        : [recipientId, senderId];

    // Find or create conversation
    const conversation = await prisma.conversation.upsert({
      where: {
        participantOneId_participantTwoId: {
          participantOneId: pOne,
          participantTwoId: pTwo,
        },
      },
      create: {
        participantOneId: pOne,
        participantTwoId: pTwo,
      },
      update: {},
    });

    // If content provided, create message and update lastMessageAt
    if (content) {
      const [message] = await prisma.$transaction([
        prisma.directMessage.create({
          data: {
            conversationId: conversation.id,
            senderId,
            content,
          },
        }),
        prisma.conversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: new Date() },
        }),
      ]);

      const messagePayload = {
        id: message.id,
        conversationId: conversation.id,
        content: message.content,
        senderId: message.senderId,
        read: message.read,
        createdAt: message.createdAt.toISOString(),
      };

      // Notify recipient via SSE with message payload
      notifyUser(recipientId, {
        type: "new-message",
        message: messagePayload,
      });

      return Response.json({
        conversationId: conversation.id,
        message: messagePayload,
      });
    }

    // No content — just return the conversation ID
    return Response.json({ conversationId: conversation.id });
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
