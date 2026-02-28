import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const rmheet = await prisma.rMHeet.findUnique({
      where: { id },
      include: {
        user: { select: { id: true, name: true, image: true, username: true } },
        _count: { select: { likes: true, comments: true, reposts: true, views: true } },
        ...(userId
          ? {
              likes: { where: { userId }, select: { id: true } },
              reposts: { where: { userId }, select: { id: true } },
            }
          : {}),
        original: {
          include: {
            user: { select: { id: true, name: true, image: true, username: true } },
            _count: { select: { likes: true, comments: true, reposts: true, views: true } },
          },
        },
      },
    });

    if (!rmheet) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({
      id: rmheet.id,
      type: "rmheet",
      createdAt: rmheet.createdAt.toISOString(),
      content: rmheet.content,
      user: rmheet.user,
      likeCount: rmheet._count.likes,
      commentCount: rmheet._count.comments,
      repostCount: rmheet._count.reposts,
      viewCount: rmheet._count.views,
      liked: userId ? rmheet.likes.length > 0 : false,
      reposted: userId ? rmheet.reposts.length > 0 : false,
      original: rmheet.original
        ? {
            id: rmheet.original.id,
            type: "rmheet",
            createdAt: rmheet.original.createdAt.toISOString(),
            content: rmheet.original.content,
            user: rmheet.original.user,
            likeCount: rmheet.original._count.likes,
            commentCount: rmheet.original._count.comments,
            repostCount: rmheet.original._count.reposts,
            viewCount: rmheet.original._count.views,
          }
        : undefined,
    });
  } catch (error) {
    console.error("Get RMHeet error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const rmheet = await prisma.rMHeet.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!rmheet) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (rmheet.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.rMHeet.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete RMHeet error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
