import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { notifyUser } from "@/lib/message-events";

export const runtime = "nodejs";

/** POST /api/messages/[conversationId]/read — mark messages as read */
export async function POST(
  _req: NextRequest,
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

    await prisma.directMessage.updateMany({
      where: {
        conversationId,
        senderId: { not: userId },
        read: false,
      },
      data: { read: true },
    });

    // Notify the current user so their unread count updates
    notifyUser(userId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Mark read error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
