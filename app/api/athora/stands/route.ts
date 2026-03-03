/**
 * Athora — Stands CRUD API
 *
 * GET  /api/athora/stands?roomId  — List stands in a room
 * POST /api/athora/stands         — Create a stand (auth required)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function GET(req: NextRequest) {
  const roomId = req.nextUrl.searchParams.get("roomId");
  if (!roomId) {
    return NextResponse.json({ error: "roomId required" }, { status: 400 });
  }

  try {
    const stands = await prisma.athoraStand.findMany({
      where: { roomId, isActive: true },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        media: { orderBy: { sortOrder: "asc" } },
        _count: { select: { leads: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(stands);
  } catch (error) {
    console.error("Stands list error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stands" },
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
      tagline,
      description,
      posX,
      posY,
      websiteUrl,
      logoUrl,
      media,
      mediaUrls,
      queueEnabled,
      leadCaptureEnabled,
      leadCaptureFields,
    } = body;

    // Normalize media from either format (media[] or mediaUrls[])
    const resolvedMedia = media ?? mediaUrls?.filter((m: { url: string }) => m.url?.trim())?.map(
      (m: { url: string; type?: string; caption?: string }) => ({
        type: m.type || "IMAGE",
        url: m.url,
        caption: m.caption,
      })
    );

    if (!roomId || !title) {
      return NextResponse.json(
        { error: "roomId and title are required" },
        { status: 400 }
      );
    }

    // Check stand limit
    const existingStands = await prisma.athoraStand.count({
      where: { ownerId: session.user.id, isActive: true },
    });
    const MAX_FREE_STANDS = 3;
    if (existingStands >= MAX_FREE_STANDS) {
      return NextResponse.json(
        { error: "Stand limit reached. Upgrade to create more." },
        { status: 403 }
      );
    }

    const stand = await prisma.athoraStand.create({
      data: {
        ownerId: session.user.id,
        roomId,
        title,
        tagline,
        description,
        posX: posX ?? 400,
        posY: posY ?? 400,
        websiteUrl,
        logoUrl,
        queueEnabled: queueEnabled ?? false,
        leadCaptureEnabled: leadCaptureEnabled ?? false,
        leadCaptureFields: leadCaptureFields ?? undefined,
        media: resolvedMedia?.length
          ? {
              create: resolvedMedia.map(
                (m: { type: string; url: string; caption?: string }, i: number) => ({
                  type: m.type,
                  url: m.url,
                  caption: m.caption,
                  sortOrder: i,
                })
              ),
            }
          : undefined,
      },
      include: { media: true },
    });

    return NextResponse.json(stand, { status: 201 });
  } catch (error) {
    console.error("Stand create error:", error);
    return NextResponse.json(
      { error: "Failed to create stand" },
      { status: 500 }
    );
  }
}
