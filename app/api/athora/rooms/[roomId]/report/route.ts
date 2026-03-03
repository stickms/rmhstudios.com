/**
 * Athora — Room Report API
 *
 * POST /api/athora/rooms/:roomId/report — Report a user or room
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ roomId: string }>;
}

const VALID_REASONS = [
  "HARASSMENT",
  "SPAM",
  "INAPPROPRIATE_CONTENT",
  "IMPERSONATION",
  "SCAM",
  "OTHER",
];

export async function POST(req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { targetId, reason, details } = body;

    if (!reason || !VALID_REASONS.includes(reason)) {
      return NextResponse.json(
        { error: "Invalid report reason" },
        { status: 400 }
      );
    }

    // Verify room exists
    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      select: { id: true },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    const report = await prisma.athoraRoomReport.create({
      data: {
        roomId,
        reporterId: session.user.id,
        targetId: targetId || null,
        reason,
        details: details?.slice(0, 1000) || null,
      },
    });

    return NextResponse.json(report, { status: 201 });
  } catch (error) {
    console.error("Report creation error:", error);
    return NextResponse.json(
      { error: "Failed to submit report" },
      { status: 500 }
    );
  }
}
