import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

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
      limit: 20,
      windowMs: 60_000,
      prefix: "comment-repost",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { commentId } = await params;
    const userId = session.user.id;

    const existing = await prisma.rMHarkCommentRepost.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });

    if (existing) {
      await prisma.rMHarkCommentRepost.delete({ where: { id: existing.id } });
      return NextResponse.json({ success: true, reposted: false });
    } else {
      await prisma.rMHarkCommentRepost.create({ data: { commentId, userId } });
      return NextResponse.json({ success: true, reposted: true });
    }
  } catch (error) {
    console.error("Toggle comment repost error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
