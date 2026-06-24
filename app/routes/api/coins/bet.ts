import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { betSchema } from "@/lib/coins-schema";
import { simulatePlinko } from "@/lib/plinko";

export const Route = createFileRoute('/api/coins/bet')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 300,
    windowMs: 60_000,
    prefix: "coins-bet",
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
    const parsed = betSchema.safeParse(body);
    if (!parsed.success) {
      return Response.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input" },
        { status: 400 }
      );
    }

    const { bin, amount } = parsed.data;
    const userId = session.user.id;

    const seed = (Date.now() ^ ((Math.random() * 0xffffffff) >>> 0)) >>> 0;
    const plinkoResult = simulatePlinko(seed);
    const won = plinkoResult.landedBin === bin;

    const result = await prisma.$transaction(async (tx) => {
      const profile = await tx.userProfile.upsert({
        where: { userId },
        create: { userId, coins: 10 },
        update: {},
        select: { coins: true },
      });

      if (profile.coins < amount) {
        throw new Error("INSUFFICIENT_COINS");
      }

      const newBalance = won
        ? profile.coins + amount
        : profile.coins - amount;

      const updated = await tx.userProfile.update({
        where: { userId },
        data: { coins: newBalance },
        select: { coins: true },
      });

      return { newBalance: updated.coins };
    });

    return Response.json({
      won,
      payout: won ? amount * 2 : 0,
      newBalance: result.newBalance,
      startX: plinkoResult.startX,
      landedBin: plinkoResult.landedBin,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "INSUFFICIENT_COINS") {
      return Response.json(
        { error: "Insufficient coins" },
        { status: 400 }
      );
    }
    console.error("Coins bet error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
