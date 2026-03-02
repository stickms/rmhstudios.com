/**
 * Athora — Conversation Invite API
 *
 * POST /api/athora/conversations/:convId/invite
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ convId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { convId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify current user is a member
    const membership = await prisma.athoraConversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: convId,
          userId: session.user.id,
        },
      },
    });

    if (!membership || membership.leftAt) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { error: "userId is required" },
        { status: 400 }
      );
    }

    // Check conversation capacity
    const conversation = await prisma.athoraConversation.findUnique({
      where: { id: convId },
      include: {
        members: { where: { leftAt: null } },
      },
    });

    if (!conversation || conversation.endedAt) {
      return NextResponse.json(
        { error: "Conversation not found or ended" },
        { status: 404 }
      );
    }

    if (conversation.members.length >= conversation.maxMembers) {
      return NextResponse.json(
        { error: "Conversation is full" },
        { status: 409 }
      );
    }

    // Create join request on behalf of inviter
    const request = await prisma.athoraConversationJoinRequest.upsert({
      where: {
        conversationId_requesterId: {
          conversationId: convId,
          requesterId: userId,
        },
      },
      create: {
        conversationId: convId,
        requesterId: userId,
        status: "ACCEPTED",
        message: `Invited by ${session.user.name}`,
        respondedAt: new Date(),
      },
      update: {
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });

    // Add as member
    await prisma.athoraConversationMember.create({
      data: { conversationId: convId, userId },
    });

    return NextResponse.json({ success: true, requestId: request.id });
  } catch (error) {
    console.error("Conversation invite error:", error);
    return NextResponse.json(
      { error: "Failed to invite user" },
      { status: 500 }
    );
  }
}
