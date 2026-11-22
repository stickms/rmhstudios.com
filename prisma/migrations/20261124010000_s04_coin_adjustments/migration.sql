-- Ledgered admin coin adjustments: who adjusted a member's coins, why, and the one-time
-- reversal link; the coins themselves move through coin_transaction (type ADMIN).

-- CreateTable
CREATE TABLE "coin_adjustment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "adminId" TEXT,
    "delta" INTEGER NOT NULL,
    "reason" VARCHAR(24) NOT NULL,
    "note" VARCHAR(280),
    "transactionId" TEXT NOT NULL,
    "reversesId" TEXT,
    "reversedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coin_adjustment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "coin_adjustment_transactionId_key" ON "coin_adjustment"("transactionId");

-- CreateIndex
CREATE UNIQUE INDEX "coin_adjustment_reversesId_key" ON "coin_adjustment"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "coin_adjustment_reversedById_key" ON "coin_adjustment"("reversedById");

-- CreateIndex
CREATE INDEX "coin_adjustment_userId_createdAt_idx" ON "coin_adjustment"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "coin_adjustment" ADD CONSTRAINT "coin_adjustment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coin_adjustment" ADD CONSTRAINT "coin_adjustment_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

