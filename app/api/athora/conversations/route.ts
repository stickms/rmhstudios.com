/**
 * Athora — Conversations API
 *
 * POST /api/athora/conversations — Create a conversation
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { roomId, topic, isOpen, anchorX, anchorY } = body;

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 }
      );
    }

    const conversation = await prisma.athoraConversation.create({
      data: {
        roomId,
        topic,
        isOpen: isOpen ?? false,
        anchorX: anchorX ?? 400,
        anchorY: anchorY ?? 300,
        members: {
          create: { userId: session.user.id },
        },
      },
      include: {
        members: {
          include: {
            user: { select: { id: true, name: true, image: true } },
          },
        },
      },
    });

    return NextResponse.json(conversation, { status: 201 });
  } catch (error) {
    console.error("Conversation create error:", error);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}
