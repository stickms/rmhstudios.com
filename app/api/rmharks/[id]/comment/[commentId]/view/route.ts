import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import crypto from "crypto";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  try {
    const { commentId } = await params;

    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const forwarded = req.headers.get("x-forwarded-for");
    const ip = forwarded?.split(",")[0]?.trim() || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex").slice(0, 16);

    if (userId) {
      await prisma.rMHarkCommentView.upsert({
        where: { commentId_userId: { commentId, userId } },
        create: { commentId, userId, ipHash },
        update: {},
      });
    } else {
      await prisma.rMHarkCommentView.upsert({
        where: { commentId_ipHash: { commentId, ipHash } },
        create: { commentId, ipHash },
        update: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Comment view error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
