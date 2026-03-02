/**
 * Athora — Room Join API
 *
 * POST /api/athora/rooms/:roomId/join
 *
 * Validates access (password for private rooms, etc.) before allowing join.
 * Actual room join happens via socket, but this validates access first.
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ roomId: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      select: {
        id: true,
        isActive: true,
        accessType: true,
        entryPassword: true,
        capacity: true,
        currentCount: true,
      },
    });

    if (!room || !room.isActive) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    if (room.currentCount >= room.capacity) {
      return NextResponse.json({ error: "Room is full" }, { status: 409 });
    }

    // Validate access type
    if (room.accessType === "PRIVATE") {
      const body = await req.json().catch(() => ({}));
      if (!body.password || body.password !== room.entryPassword) {
        return NextResponse.json(
          { error: "Invalid password" },
          { status: 403 }
        );
      }
    }

    if (room.accessType === "INVITE_ONLY") {
      // Check if user is an existing member (was invited)
      const membership = await prisma.athoraRoomMember.findUnique({
        where: { roomId_userId: { roomId, userId: session.user.id } },
      });
      if (!membership) {
        return NextResponse.json(
          { error: "Invite required" },
          { status: 403 }
        );
      }
    }

    return NextResponse.json({ allowed: true, roomId: room.id });
  } catch (error) {
    console.error("Room join validation error:", error);
    return NextResponse.json(
      { error: "Failed to validate room access" },
      { status: 500 }
    );
  }
}
