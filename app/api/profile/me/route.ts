import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";
import { resolveUserDisplay } from "@/lib/user-display";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        name: true,
        image: true,
        handle: true,
        profile: {
          select: {
            displayName: true,
            customImage: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    const resolved = resolveUserDisplay(user);
    return NextResponse.json({
      name: resolved.name,
      image: resolved.image || "/images/social/default_avatar.png",
      handle: user.handle,
    });
  } catch (error) {
    console.error("Profile me error:", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
