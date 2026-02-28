import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { createHash } from "crypto";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(req);
    const { allowed } = rateLimit(ip, {
      limit: 60,
      windowMs: 60_000,
      prefix: "rmheet-view",
    });
    if (!allowed) {
      return NextResponse.json({ success: true }); // Silently accept
    }

    const { id } = await params;

    let userId: string | null = null;
    try {
      const session = await auth.api.getSession({ headers: await headers() });
      userId = session?.user?.id ?? null;
    } catch {
      // Not logged in
    }

    const ipHash = createHash("sha256").update(ip).digest("hex").slice(0, 16);

    if (userId) {
      // Dedupe by userId
      await prisma.rMHeetView.upsert({
        where: { rmheetId_userId: { rmheetId: id, userId } },
        create: { rmheetId: id, userId },
        update: {},
      });
    } else {
      // Dedupe by IP hash
      await prisma.rMHeetView.upsert({
        where: { rmheetId_ipHash: { rmheetId: id, ipHash } },
        create: { rmheetId: id, ipHash },
        update: {},
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Track view error:", error);
    return NextResponse.json({ success: true }); // Don't fail visibly for views
  }
}
