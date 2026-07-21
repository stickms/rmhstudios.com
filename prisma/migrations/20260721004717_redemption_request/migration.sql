-- Creates the `redemption_request` table (coin redemption requests) and its
-- enums. The RedemptionRequest model was added to schema.prisma (PR #492) and
-- reaches prod via lib/creator/earnings.server.ts, but no migration ever
-- created the table — dev works through `prisma db push`, while prod applies
-- only committed migrations (`prisma migrate deploy`), so the table was missing
-- and `prisma.redemptionRequest.aggregate()` failed on prod. This migration
-- closes that gap; it is additive (new enums + new table + FKs to "user").

-- CreateEnum
CREATE TYPE "RedemptionKind" AS ENUM ('SUB_CREDIT', 'MERCH', 'PAYOUT');

-- CreateEnum
CREATE TYPE "RedemptionStatus" AS ENUM ('PENDING', 'APPROVED', 'FULFILLED', 'REJECTED');

-- CreateTable
CREATE TABLE "redemption_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "RedemptionKind" NOT NULL,
    "amountCoins" INTEGER NOT NULL,
    "tierGranted" VARCHAR(16),
    "monthsGranted" INTEGER,
    "fiatValueCents" INTEGER,
    "note" VARCHAR(500),
    "status" "RedemptionStatus" NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewNote" VARCHAR(500),
    "externalRef" VARCHAR(120),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),

    CONSTRAINT "redemption_request_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "redemption_request_status_createdAt_idx" ON "redemption_request"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "redemption_request_userId_createdAt_idx" ON "redemption_request"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "redemption_request" ADD CONSTRAINT "redemption_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "redemption_request" ADD CONSTRAINT "redemption_request_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
