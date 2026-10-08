-- RMH Datacenter compute grants (W2): the coin sink W7's inventory called for.

-- CreateTable
CREATE TABLE "compute_grant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "aiMicros" INTEGER NOT NULL DEFAULT 0,
    "imageGens" INTEGER NOT NULL DEFAULT 0,
    "librarySlots" INTEGER NOT NULL DEFAULT 0,
    "coinsPaid" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compute_grant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compute_grant_userId_month_idx" ON "compute_grant"("userId", "month");

-- AddForeignKey
ALTER TABLE "compute_grant" ADD CONSTRAINT "compute_grant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
