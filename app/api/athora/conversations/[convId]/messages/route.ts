/**
 * Athora — Conversation Messages API
 *
 * GET /api/athora/conversations/:convId/messages — Paginated message history
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ convId: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { convId } = await params;
  const limit = parseInt(req.nextUrl.searchParams.get("limit") || "50");
  const cursor = req.nextUrl.searchParams.get("cursor");

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Verify membership
    const membership = await prisma.athoraConversationMember.findUnique({
      where: {
        conversationId_userId: {
          conversationId: convId,
          userId: session.user.id,
        },
      },
    });

    if (!membership) {
      return NextResponse.json({ error: "Not a member" }, { status: 403 });
    }

    const messages = await prisma.athoraMessage.findMany({
      where: { conversationId: convId },
      include: {
        sender: { select: { id: true, name: true, image: true } },
      },
      orderBy: { createdAt: "desc" },
      take: limit + 1,
      ...(cursor && { cursor: { id: cursor }, skip: 1 }),
    });

    const hasMore = messages.length > limit;
    if (hasMore) messages.pop();

    return NextResponse.json({
      messages: messages.reverse(),
      nextCursor: hasMore ? messages[0]?.id : null,
    });
  } catch (error) {
    console.error("Messages fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 }
    );
  }
}
