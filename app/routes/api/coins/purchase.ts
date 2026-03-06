import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { purchaseSchema } from "@/lib/coins-schema";

const PRICES = { "profile-pet": 50 } as const;

export const Route = createFileRoute('/api/coins/purchase')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 5,
    windowMs: 60_000,
    prefix: "coins-purchase",
  });

  if (!allowed) {
    return Response.json(
      { error: "Too many requests" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  try {
    const session = await auth.api.getSession({ headers: request.headers });
    if (!session?.user?.id) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
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

    return Response.json({
      success: true,
      newBalance: result.coins,
    });
  } catch (error) {
    if (error instanceof Error) {
      if (error.message === "INSUFFICIENT_COINS") {
        return Response.json(
          { error: "Insufficient coins" },
          { status: 400 }
        );
      }
      if (error.message === "ALREADY_OWNED") {
        return Response.json(
          { error: "You already own this item" },
          { status: 409 }
        );
      }
    }
    console.error("Coins purchase error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
