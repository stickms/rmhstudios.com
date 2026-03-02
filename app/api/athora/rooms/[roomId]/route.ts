/**
 * Athora — Single Room API
 *
 * GET    /api/athora/rooms/:roomId  — Room details
 * PATCH  /api/athora/rooms/:roomId  — Update room (owner only)
 * DELETE /api/athora/rooms/:roomId  — Deactivate room (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ roomId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        stands: {
          where: { isActive: true },
          include: {
            media: { orderBy: { sortOrder: "asc" } },
            owner: { select: { id: true, name: true, image: true } },
          },
        },
        events: {
          where: { startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
          take: 10,
        },
      },
    });

    if (!room) {
      return NextResponse.json({ error: "Room not found" }, { status: 404 });
    }

    return NextResponse.json(room);
  } catch (error) {
    console.error("Room fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch room" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      select: { ownerId: true },
    });

    if (!room || room.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = [
      "name",
      "description",
      "category",
      "template",
      "capacity",
      "accessType",
      "entryPassword",
      "mapWidth",
      "mapHeight",
      "tileMapData",
      "backgroundUrl",
      "isActive",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const updated = await prisma.athoraRoom.update({
      where: { id: roomId },
      data,
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Room update error:", error);
    return NextResponse.json(
      { error: "Failed to update room" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { roomId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const room = await prisma.athoraRoom.findUnique({
      where: { id: roomId },
      select: { ownerId: true },
    });

    if (!room || room.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.athoraRoom.update({
      where: { id: roomId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Room delete error:", error);
    return NextResponse.json(
      { error: "Failed to deactivate room" },
      { status: 500 }
    );
  }
}
