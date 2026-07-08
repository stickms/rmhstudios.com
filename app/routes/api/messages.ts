import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/message-events";
import { ownsFeedImageUrl } from "@/lib/storage/keys";
import { gifUrlSchema, feedImageUrlSchema } from "@/lib/rmhark-schema";
import { listConversations } from "@/lib/messages.server";
import { z } from "zod";

const sendMessageSchema = z.object({
  recipientId: z.string().min(1),
  content: z.string().max(2000).optional(),
  gifUrl: gifUrlSchema.optional(),
  imageUrls: z.array(feedImageUrlSchema).max(4).optional(),
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

    const url = new URL(request.url);
    const cursor = url.searchParams.get("cursor");
    const result = await listConversations(session.user.id, { cursor });
    return Response.json(result);
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

    const { recipientId, content, gifUrl, imageUrls } = parsed.data;
    const senderId = session.user.id;

    if (recipientId === senderId) {
      return Response.json(
        { error: "Cannot message yourself" },
        { status: 400 }
      );
    }

    // Images must belong to the sender (filename is prefixed with their id).
    if (imageUrls?.some((u) => !ownsFeedImageUrl(u, senderId))) {
      return Response.json({ error: "Invalid image reference" }, { status: 400 });
    }
    const hasMedia = !!gifUrl || (imageUrls?.length ?? 0) > 0;

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

    // If content or media provided, create the message and bump lastMessageAt.
    if (content || hasMedia) {
      const [message] = await prisma.$transaction([
        prisma.directMessage.create({
          data: {
            conversationId: conversation.id,
            senderId,
            content: content ?? "",
            gifUrl: gifUrl ?? null,
            imageUrls: imageUrls ?? [],
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
