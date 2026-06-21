-- CreateTable
CREATE TABLE "coin_stake" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "principal" INTEGER NOT NULL DEFAULT 0,
    "accrued" INTEGER NOT NULL DEFAULT 0,
    "lastAccrued" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coin_stake_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "coin_stake_userId_key" ON "coin_stake"("userId");
ALTER TABLE "coin_stake" ADD CONSTRAINT "coin_stake_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
