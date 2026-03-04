import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { notifyUser } from "@/lib/message-events";
import { z } from "zod";

export const runtime = "nodejs";

const sendSchema = z.object({
  content: z.string().min(1).max(2000),
});

/** GET /api/messages/[conversationId] — get messages in a conversation */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { conversationId } = await params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantOneId: true, participantTwoId: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const url = new URL(req.url);
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
      },
    });

    const hasMore = messages.length > limit;
    const items = hasMore ? messages.slice(0, limit) : messages;

    // Mark unread messages from the other person as read
    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        read: false,
        id: { in: items.map((m) => m.id) },
      },
      data: { read: true },
    });

    return NextResponse.json({
      messages: items.reverse().map((m) => ({
        id: m.id,
        content: m.content,
        senderId: m.senderId,
        read: m.read,
        createdAt: m.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? items[items.length - 1].id : null,
      hasMore,
    });
  } catch (error) {
    console.error("Get messages error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}

/** POST /api/messages/[conversationId] — send a message in an existing conversation */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60_000,
      prefix: "send-message",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { conversationId } = await params;
    const userId = session.user.id;

    // Verify user is a participant
    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { participantOneId: true, participantTwoId: true },
    });

    if (!conversation) {
      return NextResponse.json(
        { error: "Conversation not found" },
        { status: 404 }
      );
    }

    if (
      conversation.participantOneId !== userId &&
      conversation.participantTwoId !== userId
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const parsed = sendSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
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
      return NextResponse.json(
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
        return NextResponse.json(
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
    };

    // Notify recipient via SSE with message payload
    notifyUser(recipientId, {
      type: "new-message",
      message: messagePayload,
    });

    return NextResponse.json({
      message: messagePayload,
    });
  } catch (error) {
    console.error("Send message error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
