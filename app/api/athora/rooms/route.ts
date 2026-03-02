/**
 * Athora — Rooms CRUD API
 *
 * GET  /api/athora/rooms         — List rooms (filterable)
 * POST /api/athora/rooms         — Create a room (auth required)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const category = params.get("category");
  const search = params.get("search");
  const limit = parseInt(params.get("limit") || "50");
  const offset = parseInt(params.get("offset") || "0");

  try {
    const where: Record<string, unknown> = { isActive: true };
    if (category) where.category = category;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: "insensitive" } },
        { description: { contains: search, mode: "insensitive" } },
        { city: { contains: search, mode: "insensitive" } },
      ];
    }

    const [rooms, total] = await Promise.all([
      prisma.athoraRoom.findMany({
        where: where as any,
        select: {
          id: true,
          name: true,
          slug: true,
          description: true,
          latitude: true,
          longitude: true,
          category: true,
          template: true,
          currentCount: true,
          capacity: true,
          isPinned: true,
          city: true,
          country: true,
          owner: { select: { id: true, name: true, image: true } },
        },
        orderBy: [{ isPinned: "desc" }, { currentCount: "desc" }],
        take: limit,
        skip: offset,
      }),
      prisma.athoraRoom.count({ where: where as any }),
    ]);

    return NextResponse.json({ rooms, total });
  } catch (error) {
    console.error("Rooms list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch rooms" },
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
      name,
      description,
      slug,
      latitude,
      longitude,
      address,
      city,
      country,
      category,
      template,
      capacity,
      accessType,
      entryPassword,
      mapWidth,
      mapHeight,
    } = body;

    if (!name || !slug || latitude == null || longitude == null) {
      return NextResponse.json(
        { error: "name, slug, latitude, and longitude are required" },
        { status: 400 }
      );
    }

    // Check slug uniqueness
    const existing = await prisma.athoraRoom.findUnique({
      where: { slug },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Slug is already taken" },
        { status: 409 }
      );
    }

    const room = await prisma.athoraRoom.create({
      data: {
        name,
        description,
        slug,
        latitude,
        longitude,
        address,
        city,
        country,
        ownerId: session.user.id,
        category: category || "GENERAL",
        template: template || "OPEN_FLOOR",
        capacity: capacity || 50,
        accessType: accessType || "PUBLIC",
        entryPassword,
        mapWidth: mapWidth || 1600,
        mapHeight: mapHeight || 1200,
      },
    });

    return NextResponse.json(room, { status: 201 });
  } catch (error) {
    console.error("Room create error:", error);
    return NextResponse.json(
      { error: "Failed to create room" },
      { status: 500 }
    );
  }
}
