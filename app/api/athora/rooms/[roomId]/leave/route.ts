/**
 * Athora — Room Leave API
 *
 * POST /api/athora/rooms/:roomId/leave
 *
 * Explicit leave endpoint. Primary leave happens via socket disconnect,
 * but this provides an HTTP fallback.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ roomId: string }>;
}

export async function POST(_req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    await prisma.athoraRoomMember.updateMany({
      where: { roomId, userId: session.user.id },
      data: { lastSeen: new Date() },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Room leave error:", error);
    return NextResponse.json(
      { error: "Failed to leave room" },
      { status: 500 }
    );
  }
}
