import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { purchaseSchema } from "@/lib/coins-schema";

export const runtime = "nodejs";

const PRICES = { "profile-pet": 50 } as const;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 5,
    windowMs: 60_000,
    prefix: "coins-purchase",
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

    const body = await req.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { item } = parsed.data;
    const price = PRICES[item];
    const userId = session.user.id;

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10 },
        update: {},
        select: { coins: true, hasProfilePet: true },
      });

      if (profile.coins < price) {
        throw new Error("INSUFFICIENT_COINS");
      }

      if (item === "profile-pet" && profile.hasProfilePet) {
        throw new Error("ALREADY_OWNED");
      }

      return tx.userProfile.update({
        where: { userId },
        data: {
          coins: { decrement: price },
          ...(item === "profile-pet" ? { hasProfilePet: true } : {}),
        },
        select: { coins: true },
      });
    });

    return NextResponse.json({
      success: true,
      newBalance: result.coins,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INSUFFICIENT_COINS") {
        return NextResponse.json(
          { error: "Insufficient coins" },
          { status: 400 }
        );
      }
      if (error.message === "ALREADY_OWNED") {
        return NextResponse.json(
          { error: "You already own this item" },
          { status: 409 }
        );
      }
    }
    console.error("Coins purchase error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
