-- CreateTable
CREATE TABLE "gift_membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "gifterId" TEXT,
    "tier" VARCHAR(16) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "gift_membership_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "gift_membership_userId_expiresAt_idx" ON "gift_membership"("userId", "expiresAt");
ALTER TABLE "gift_membership" ADD CONSTRAINT "gift_membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "gift_membership" ADD CONSTRAINT "gift_membership_gifterId_fkey" FOREIGN KEY ("gifterId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
