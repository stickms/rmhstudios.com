-- CreateTable
CREATE TABLE "developer_api_key" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "prefix" VARCHAR(16) NOT NULL,
    "hashedKey" TEXT NOT NULL,
    "lastUsedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "developer_api_key_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "developer_api_key_hashedKey_key" ON "developer_api_key"("hashedKey");
CREATE INDEX "developer_api_key_userId_idx" ON "developer_api_key"("userId");
ALTER TABLE "developer_api_key" ADD CONSTRAINT "developer_api_key_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "promo_claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "promo" VARCHAR(64) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "promo_claim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "promo_claim_userId_promo_key" ON "promo_claim"("userId", "promo");
ALTER TABLE "promo_claim" ADD CONSTRAINT "promo_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
