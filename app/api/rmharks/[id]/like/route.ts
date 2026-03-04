import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { userDisplaySelect, resolveUser } from "@/lib/user-display";

export const runtime = "nodejs";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const likes = await prisma.rMHarkLike.findMany({
      where: { rmheetId: id },
      orderBy: { createdAt: "desc" },
      take: 50,
      include: { user: { select: userDisplaySelect } },
    });
    return NextResponse.json(
      likes.map((l) => ({ ...resolveUser(l.user), likedAt: l.createdAt }))
    );
  } catch (error) {
    console.error("Fetch likes error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
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
      prefix: "rmhark-like",
    });
    if (!allowed) {
      return NextResponse.json(
        { error: "Too many requests" },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const { id } = await params;
    const userId = session.user.id;

    const existingLike = await prisma.rMHarkLike.findUnique({
      where: { rmheetId_userId: { rmheetId: id, userId } },
    });

    if (existingLike) {
      await prisma.rMHarkLike.delete({ where: { id: existingLike.id } });
      return NextResponse.json({ success: true, liked: false });
    } else {
      await prisma.rMHarkLike.create({ data: { rmheetId: id, userId } });
      return NextResponse.json({ success: true, liked: true });
    }
  } catch (error) {
    console.error("Toggle like error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
