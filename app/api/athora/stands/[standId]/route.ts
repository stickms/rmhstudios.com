/**
 * Athora — Single Stand API
 *
 * GET    /api/athora/stands/:standId  — Stand details with media
 * PATCH  /api/athora/stands/:standId  — Update stand (owner only)
 * DELETE /api/athora/stands/:standId  — Remove stand (owner only)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

interface Params {
  params: Promise<{ standId: string }>;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { standId } = await params;

  try {
    const stand = await prisma.athoraStand.findUnique({
      where: { id: standId },
      include: {
        owner: { select: { id: true, name: true, image: true } },
        media: { orderBy: { sortOrder: "asc" } },
      },
    });

    if (!stand) {
      return NextResponse.json({ error: "Stand not found" }, { status: 404 });
    }

    return NextResponse.json(stand);
  } catch (error) {
    console.error("Stand fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stand" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { standId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stand = await prisma.athoraStand.findUnique({
      where: { id: standId },
      select: { ownerId: true },
    });

    if (!stand || stand.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await req.json();
    const allowedFields = [
      "title",
      "tagline",
      "description",
      "category",
      "logoUrl",
      "websiteUrl",
      "posX",
      "posY",
      "width",
      "height",
      "style",
      "isActive",
      "queueEnabled",
      "leadCaptureEnabled",
      "leadCaptureFields",
    ];

    const data: Record<string, unknown> = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) data[field] = body[field];
    }

    const updated = await prisma.athoraStand.update({
      where: { id: standId },
      data,
      include: { media: { orderBy: { sortOrder: "asc" } } },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Stand update error:", error);
    return NextResponse.json(
      { error: "Failed to update stand" },
      { status: 500 }
    );
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { standId } = await params;

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const stand = await prisma.athoraStand.findUnique({
      where: { id: standId },
      select: { ownerId: true },
    });

    if (!stand || stand.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.athoraStand.update({
      where: { id: standId },
      data: { isActive: false },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Stand delete error:", error);
    return NextResponse.json(
      { error: "Failed to remove stand" },
      { status: 500 }
    );
  }
}
