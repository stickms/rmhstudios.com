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

-- No new index. The daily-cap check filters
--   senderId = $1 AND type = 'WAGER' AND createdAt >= midnight
-- and `coin_transaction` already carries (senderId, createdAt DESC), which
-- narrows that to one member's movements since midnight — tens of rows at the
-- outside. Filtering those few by `type` needs no help. An earlier draft added
-- (senderId, type, createdAt) and the migration-safety check was right to
-- object: a plain CREATE INDEX holds a SHARE lock on this table for the whole
-- build, blocking every coin movement on the site, and CONCURRENTLY cannot run
-- inside the transaction Prisma wraps migrations in. Paying that on the one
-- table where every purchase, tip and payout is written, to speed up a query
-- that is already indexed, is the wrong trade.
