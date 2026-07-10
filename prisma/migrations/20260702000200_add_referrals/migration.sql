-- Referral program
ALTER TABLE "user" ADD COLUMN "referralCode" TEXT;
CREATE UNIQUE INDEX "user_referralCode_key" ON "user"("referralCode");

CREATE TABLE "referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "refereeId" TEXT NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rewardedAt" TIMESTAMP(3),

    CONSTRAINT "referral_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "referral_refereeId_key" ON "referral"("refereeId");
CREATE INDEX "referral_referrerId_idx" ON "referral"("referrerId");

ALTER TABLE "referral" ADD CONSTRAINT "referral_referrerId_fkey"
    FOREIGN KEY ("referrerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "referral" ADD CONSTRAINT "referral_refereeId_fkey"
    FOREIGN KEY ("refereeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
