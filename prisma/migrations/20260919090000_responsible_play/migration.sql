-- Responsible play (W8): per-member limits honoured by every coin-risking path.
--
-- Enforcement lives in `debitCoinsOn` for `type = 'WAGER'` (lib/economy/ledger-core.ts),
-- which is the single chokepoint the web tier and the socket tier already share.

-- CreateTable
CREATE TABLE "user_play_limits" (
    "userId" TEXT NOT NULL,
    "dailyCoinCap" INTEGER,
    "selfExcludedUntil" TIMESTAMP(3),
    "coolOffUntil" TIMESTAMP(3),
    "pendingCap" INTEGER,
    "pendingCapAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_play_limits_pkey" PRIMARY KEY ("userId")
);

-- AddForeignKey
ALTER TABLE "user_play_limits" ADD CONSTRAINT "user_play_limits_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The daily-cap check sums today's WAGER debits for one member. `coin_transaction`
-- already carries (senderId, createdAt DESC); this adds `type` so the sum is an
-- index-only scan rather than a heap fetch per row on a member with a long history.
CREATE INDEX "coin_transaction_senderId_type_createdAt_idx" ON "coin_transaction"("senderId", "type", "createdAt" DESC);
