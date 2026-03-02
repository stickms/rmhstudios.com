/**
 * Athora — Room Events API
 *
 * GET  /api/athora/events?roomId&upcoming  — List room events
 * POST /api/athora/events                  — Create event (room owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  const upcoming = req.nextUrl.searchParams.get("upcoming") === "true";

  try {
    const where: Record<string, unknown> = {};
    if (roomId) where.roomId = roomId;
    if (upcoming) where.startsAt = { gte: new Date() };

    const events = await prisma.athoraRoomEvent.findMany({
      where: where as any,
      include: {
        room: { select: { id: true, name: true, slug: true } },
      },
      orderBy: { startsAt: "asc" },
      take: 50,
    });

    return NextResponse.json(events);
  } catch (error) {
    console.error("Events fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch events" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      roomId,
      title,
      description,
      imageUrl,
      startsAt,
      endsAt,
      timezone,
      isTicketed,
      ticketPrice,
      maxAttendees,
    } = body;

    if (!roomId || !title || !startsAt || !endsAt) {
      return NextResponse.json(
        { error: "roomId, title, startsAt, and endsAt are required" },
        { status: 400 }
      );
    }

    // Verify user owns the room
    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      select: { ownerId: true },
    });

    if (!room || room.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const event = await prisma.athoraRoomEvent.create({
      data: {
        roomId,
        title,
        description,
        imageUrl,
        startsAt: new Date(startsAt),
        endsAt: new Date(endsAt),
        timezone: timezone || "UTC",
        isTicketed: isTicketed || false,
        ticketPrice,
        maxAttendees,
      },
    });

    return NextResponse.json(event, { status: 201 });
  } catch (error) {
    console.error("Event create error:", error);
    return NextResponse.json(
      { error: "Failed to create event" },
      { status: 500 }
    );
  }
}
