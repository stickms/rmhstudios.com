import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

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

    const rmhark: any = await prisma.rMHark.findUnique({
      where: { id },
      include: {
        user: { select: userDisplaySelect },
        _count: { select: { likes: true, comments: true, reposts: true, views: true } },
        ...(userId
          ? {
              likes: { where: { userId }, select: { id: true } },
              reposts: { where: { userId }, select: { id: true } },
            }
          : {}),
        poll: {
          include: {
            options: {
              orderBy: { position: "asc" as const },
              include: {
                _count: { select: { votes: true } },
                ...(userId
                  ? { votes: { where: { userId }, select: { id: true, optionId: true } } }
                  : {}),
              },
            },
          },
        },
        original: {
          include: {
            user: { select: userDisplaySelect },
            _count: { select: { likes: true, comments: true, reposts: true, views: true } },
          },
        },
      },
    });

    if (!rmhark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    let pollData;
    if (rmhark.poll) {
      const totalVotes = rmhark.poll.options.reduce(
        (sum: number, o: any) => sum + (o._count?.votes ?? 0),
        0
      );
      pollData = {
        id: rmhark.poll.id,
        question: rmhark.poll.question,
        multiSelect: rmhark.poll.multiSelect,
        totalVotes,
        options: rmhark.poll.options.map((o: any) => ({
          id: o.id,
          text: o.text,
          voteCount: o._count?.votes ?? 0,
        })),
        myVotes: rmhark.poll.options
          .filter((o: any) => o.votes?.length > 0)
          .map((o: any) => o.id),
      };
    }

    return NextResponse.json({
      id: rmhark.id,
      type: "rmhark",
      createdAt: rmhark.createdAt.toISOString(),
      content: rmhark.content,
      user: resolveUser(rmhark.user),
      likeCount: rmhark._count.likes,
      commentCount: rmhark._count.comments,
      repostCount: rmhark._count.reposts,
      viewCount: rmhark._count.views,
      liked: userId ? rmhark.likes.length > 0 : false,
      reposted: userId ? rmhark.reposts.length > 0 : false,
      poll: pollData,
      gifUrl: rmhark.gifUrl ?? undefined,
      original: rmhark.original
        ? {
            id: rmhark.original.id,
            type: "rmhark",
            createdAt: rmhark.original.createdAt.toISOString(),
            content: rmhark.original.content,
            user: resolveUser(rmhark.original.user),
            likeCount: rmhark.original._count.likes,
            commentCount: rmhark.original._count.comments,
            repostCount: rmhark.original._count.reposts,
            viewCount: rmhark.original._count.views,
          }
        : undefined,
    });
  } catch (error) {
    console.error("Get RMHark error:", error);
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

    const rmhark = await prisma.rMHark.findUnique({
      where: { id },
      select: { userId: true },
    });

    if (!rmhark) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    if (rmhark.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await prisma.rMHark.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Delete RMHark error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
