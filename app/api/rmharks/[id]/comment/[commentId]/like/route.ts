import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;
    const likes = await prisma.rMHarkCommentLike.findMany({
      where: { commentId },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return NextResponse.json(
      likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt }))
    );
  } catch (error) {
    console.error("Fetch comment likes error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const ip = getClientIp(req);
    const { allowed, retryAfter } = rateLimit(ip, {
      limit: 30,
      windowMs: 60_000,
      prefix: "comment-like",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { commentId } = await params;
    const userId = session.user.id;

    const existing = await prisma.rMHarkCommentLike.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await prisma.rMHarkCommentLike.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, liked: false });
    } else {
      await prisma.rMHarkCommentLike.create({ data: { commentId, userId } });
      return NextResponse.json({ success: true, liked: true });
    }
  } catch (error) {
    console.error("Toggle comment like error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
