import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";

export const Route = createFileRoute('/api/coins/claim')({
  server: {
    handlers: {
  POST: async ({ request }) => {
  const ip = getClientIp(request);
  const { allowed, retryAfter } = rateLimit(ip, {
    limit: 3,
    windowMs: 60_000,
    prefix: "coins-claim",
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

    const userId = session.user.id;

    // Ensure the profile row exists (new users start at 10, i.e. not claimable),
    // then top up atomically. The `coins < 10` guard lives in the WHERE clause so
    // two concurrent claims can't both read a stale sub-10 balance and each add 10.
    await prisma.userProfile.upsert({
      where: { userId },
      create: { userId, coins: 10 },
      update: {},
    });
    const claim = await prisma.userProfile.updateMany({
      where: { userId, coins: { lt: 10 } },
      data: { coins: { increment: 10 } },
    });
    if (claim.count === 0) {
      throw new Error("COINS_TOO_HIGH");
    }
    const result = await prisma.userProfile.findUnique({ where: { userId }, select: { coins: true } });

    return Response.json({ newBalance: result?.coins ?? 0 });
  } catch (error) {
    if (error instanceof Error && error.message === "COINS_TOO_HIGH") {
      return Response.json(
        { error: "You can only claim coins when your balance is below 10" },
        { status: 400 }
      );
    }
    console.error("Coins claim error:", error);
    return Response.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
},
    },
  },
});
