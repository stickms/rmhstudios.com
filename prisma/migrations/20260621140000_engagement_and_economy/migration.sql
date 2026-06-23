-- CreateEnum
CREATE TYPE "ShopItemKind" AS ENUM ('THEME', 'PET', 'NAME_COLOR', 'BADGE', 'BANNER', 'POST_FLAIR', 'AVATAR_FRAME');

-- CreateEnum
CREATE TYPE "CoinTxnType" AS ENUM ('TIP', 'GIFT', 'PURCHASE', 'REWARD', 'ADMIN');

-- CreateTable
CREATE TABLE "rmheet_bookmark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "rmheetId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rmheet_bookmark_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rmheet_bookmark_userId_rmheetId_key" ON "rmheet_bookmark"("userId", "rmheetId");
CREATE INDEX "rmheet_bookmark_userId_createdAt_idx" ON "rmheet_bookmark"("userId", "createdAt" DESC);

-- CreateTable
CREATE TABLE "user_achievement" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "achievementId" VARCHAR(64) NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "unlockedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_achievement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_achievement_userId_achievementId_key" ON "user_achievement"("userId", "achievementId");
CREATE INDEX "user_achievement_userId_unlockedAt_idx" ON "user_achievement"("userId", "unlockedAt");

-- CreateTable
CREATE TABLE "daily_streak" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "longest" INTEGER NOT NULL DEFAULT 0,
    "lastCheckIn" TIMESTAMP(3),
    "lastDateKey" VARCHAR(10),
    "totalCheckIns" INTEGER NOT NULL DEFAULT 0,
    "freezeTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "daily_streak_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "daily_streak_userId_key" ON "daily_streak"("userId");

-- CreateTable
CREATE TABLE "user_inventory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "itemId" VARCHAR(64) NOT NULL,
    "kind" "ShopItemKind" NOT NULL,
    "equipped" BOOLEAN NOT NULL DEFAULT false,
    "acquiredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_inventory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "user_inventory_userId_itemId_key" ON "user_inventory"("userId", "itemId");
CREATE INDEX "user_inventory_userId_kind_idx" ON "user_inventory"("userId", "kind");

-- CreateTable
CREATE TABLE "coin_transaction" (
    "id" TEXT NOT NULL,
    "senderId" TEXT,
    "recipientId" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "type" "CoinTxnType" NOT NULL,
    "note" VARCHAR(280),
    "entityType" VARCHAR(32),
    "entityId" VARCHAR(64),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coin_transaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "coin_transaction_recipientId_createdAt_idx" ON "coin_transaction"("recipientId", "createdAt" DESC);
CREATE INDEX "coin_transaction_senderId_createdAt_idx" ON "coin_transaction"("senderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "rmheet_bookmark" ADD CONSTRAINT "rmheet_bookmark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rmheet_bookmark" ADD CONSTRAINT "rmheet_bookmark_rmheetId_fkey" FOREIGN KEY ("rmheetId") REFERENCES "rmheet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_achievement" ADD CONSTRAINT "user_achievement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "daily_streak" ADD CONSTRAINT "daily_streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "user_inventory" ADD CONSTRAINT "user_inventory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coin_transaction" ADD CONSTRAINT "coin_transaction_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "coin_transaction" ADD CONSTRAINT "coin_transaction_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
