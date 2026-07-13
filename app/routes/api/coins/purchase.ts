import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
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
      await tx.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10 },
        update: {},
      });

      const owned = await tx.userProfile.findUnique({ where: { userId }, select: { hasProfilePet: true } });
      if (item === "profile-pet" && owned?.hasProfilePet) {
        throw new Error("ALREADY_OWNED");
      }

      // Atomic conditional debit + grant: the `coins >= price` (and, for the pet,
      // `hasProfilePet: false`) guards live in the WHERE clause so concurrent
      // purchases can't overdraft a stale balance or grant the item twice.
      const purchase = await tx.userProfile.updateMany({
        where: {
          userId,
          coins: { gte: price },
          ...(item === "profile-pet" ? { hasProfilePet: false } : {}),
        },
        data: {
          coins: { decrement: price },
          ...(item === "profile-pet" ? { hasProfilePet: true } : {}),
        },
      });
      if (purchase.count === 0) {
        throw new Error("INSUFFICIENT_COINS");
      }

      return tx.userProfile.findUnique({ where: { userId }, select: { coins: true } });
    });

    return Response.json({
      success: true,
      newBalance: result?.coins ?? 0,
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
