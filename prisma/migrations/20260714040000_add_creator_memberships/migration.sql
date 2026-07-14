-- Per-creator memberships (coin-funded).
ALTER TYPE "CoinTxnType" ADD VALUE 'MEMBERSHIP';

ALTER TABLE "user_profile" ADD COLUMN "membershipPriceCoins" INTEGER;

CREATE TABLE "creator_membership" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "supporterId" TEXT NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "creator_membership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "creator_membership_creatorId_supporterId_key" ON "creator_membership"("creatorId", "supporterId");
CREATE INDEX "creator_membership_creatorId_idx" ON "creator_membership"("creatorId");
CREATE INDEX "creator_membership_supporterId_idx" ON "creator_membership"("supporterId");
CREATE INDEX "creator_membership_expiresAt_idx" ON "creator_membership"("expiresAt");

ALTER TABLE "creator_membership" ADD CONSTRAINT "creator_membership_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "creator_membership" ADD CONSTRAINT "creator_membership_supporterId_fkey" FOREIGN KEY ("supporterId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
