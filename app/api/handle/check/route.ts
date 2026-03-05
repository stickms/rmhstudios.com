import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { handleSchema } from "@/lib/handle";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const handle = req.nextUrl.searchParams.get("handle");
    if (!handle) {
      return NextResponse.json({ error: "Missing handle parameter" }, { status: 400 });
    }

    const validation = handleSchema.safeParse(handle);
    if (!validation.success) {
      return NextResponse.json({
        available: false,
        reason: validation.error.issues[0]?.message ?? "Invalid handle",
      });
    }

    const existing = await prisma.user.findUnique({
      where: { handle },
      select: { id: true },
    });

    const available = !existing || existing.id === session.user.id;

    return NextResponse.json({ available });
  } catch (error) {
    console.error("Handle check error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
