import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: session.user.id },
      select: { coins: true, hasProfilePet: true },
    });

    return NextResponse.json({
      coins: profile?.coins ?? 10,
      hasProfilePet: profile?.hasProfilePet ?? false,
    });
  } catch (error) {
    console.error("Coins fetch error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
