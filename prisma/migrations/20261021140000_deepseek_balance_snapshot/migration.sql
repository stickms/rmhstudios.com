-- Hourly DeepSeek account-balance samples for /admin/deepseek. Additive only.

-- CreateTable
CREATE TABLE "deepseek_balance_snapshot" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hourBucket" TIMESTAMP(3) NOT NULL,
    "currency" TEXT NOT NULL,
    "isAvailable" BOOLEAN NOT NULL,
    "totalBalance" DECIMAL(14,4) NOT NULL,
    "grantedBalance" DECIMAL(14,4) NOT NULL,
    "toppedUpBalance" DECIMAL(14,4) NOT NULL,
    "source" TEXT NOT NULL,

    CONSTRAINT "deepseek_balance_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "deepseek_balance_snapshot_currency_createdAt_idx" ON "deepseek_balance_snapshot"("currency", "createdAt");

-- CreateIndex
CREATE INDEX "deepseek_balance_snapshot_createdAt_idx" ON "deepseek_balance_snapshot"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "deepseek_balance_snapshot_currency_hourBucket_source_key" ON "deepseek_balance_snapshot"("currency", "hourBucket", "source");
