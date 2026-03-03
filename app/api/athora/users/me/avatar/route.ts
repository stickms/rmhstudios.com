/**
 * Athora — Avatar Config API
 *
 * PATCH /api/athora/users/me/avatar — Save avatar configuration
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { headers } from "next/headers";

export async function PATCH(req: NextRequest) {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { bodyVariant, bodyColor, accessoryIds } = body;

    const validVariants = ["default", "suit", "casual", "hoodie"];
    if (bodyVariant && !validVariants.includes(bodyVariant)) {
      return NextResponse.json(
        { error: "Invalid body variant" },
        { status: 400 }
      );
    }

    const avatarConfig = {
      bodyVariant: bodyVariant || "default",
      bodyColor: bodyColor || null,
      accessoryIds: Array.isArray(accessoryIds) ? accessoryIds : [],
    };

    const user = await prisma.user.update({
      where: { id: session.user.id },
      data: { avatarConfig },
      select: { id: true, avatarConfig: true },
    });

    return NextResponse.json(user);
  } catch (error) {
    console.error("Avatar config update error:", error);
    return NextResponse.json(
      { error: "Failed to update avatar config" },
      { status: 500 }
    );
  }
}
