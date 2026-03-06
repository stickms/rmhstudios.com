import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 3,
    windowMs: 60_000,
    prefix: "coins-claim",
  });

  if (!allowed) {
    return NextResponse.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userId = session.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10 },
        update: {},
        select: { coins: true },
      });

      if (profile.coins >= 10) {
        throw new Error("COINS_TOO_HIGH");
      }

      return tx.userProfile.update({
        where: { userId },
        data: { coins: { increment: 10 } },
        select: { coins: true },
      });
    });

    return NextResponse.json({ newBalance: result.coins });
  } catch (error) {
    if (error instanceof Error && error.message === "COINS_TOO_HIGH") {
      return NextResponse.json(
        { error: "You can only claim coins when your balance is below 10" },
        { status: 400 }
      );
    }
    console.error("Coins claim error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
