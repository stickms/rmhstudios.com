import { createFileRoute } from '@tanstack/react-router';
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma.server";
import { creditCoins, getBalance } from "@/lib/economy/ledger.server";
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

    // Top-up safety net for a user who has run dry. `onlyIfBalanceBelow` keeps
    // the `coins < 10` guard inside the UPDATE's WHERE clause, so two concurrent
    // claims can't both observe a stale sub-10 balance and each add 10 — and the
    // grant is now recorded in the ledger like every other faucet.
    const claim = await creditCoins(userId, 10, {
      type: 'REWARD',
      entityType: 'daily-claim',
      note: 'Low-balance top-up',
      onlyIfBalanceBelow: 10,
    });
    if (!claim.applied) {
      throw new Error("COINS_TOO_HIGH");
    }

    return Response.json({ newBalance: await getBalance(userId) });
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
