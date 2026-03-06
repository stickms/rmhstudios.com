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

    // Optional amount param (default 10, used by +50 test button)
    let amount = 10;
    try {
      const body = await req.json();
      if (typeof body.amount === "number" && body.amount > 0) {
        amount = Math.floor(body.amount);
      }
    } catch {
      // No body or invalid JSON — use default 10
    }

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10 },
        update: {},
        select: { coins: true },
      });

      // Only enforce balance check for the default free-claim (10 coins)
      if (amount === 10 && profile.coins >= 10) {
        throw new Error("COINS_TOO_HIGH");
      }

      return tx.userProfile.update({
        where: { userId },
        data: { coins: { increment: amount } },
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
