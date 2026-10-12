-- P10 economy-plus (C1/C5/C6/C7/C8): savings goals, loadout presets, community goal pots,
-- scheduled gifts, wishlist alert state. Additive only: new tables + nullable columns.

-- AlterTable
ALTER TABLE "wishlist_entry" ADD COLUMN     "lastAlertAt" TIMESTAMP(3),
ADD COLUMN     "lastAlertKey" VARCHAR(40),
ADD COLUMN     "lastSeenPrice" INTEGER;

-- CreateTable
CREATE TABLE "savings_goal" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(16) NOT NULL,
    "itemId" VARCHAR(64),
    "title" VARCHAR(80) NOT NULL,
    "targetCoins" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reachedAt" TIMESTAMP(3),

    CONSTRAINT "savings_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loadout_preset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "itemIds" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "loadout_preset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_goal" (
    "id" TEXT NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(600) NOT NULL DEFAULT '',
    "unlock" VARCHAR(160) NOT NULL,
    "targetCoins" INTEGER NOT NULL,
    "raisedCoins" INTEGER NOT NULL DEFAULT 0,
    "deadline" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fundedAt" TIMESTAMP(3),
    "fulfilledAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "community_goal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_goal_pledge" (
    "id" BIGSERIAL NOT NULL,
    "goalId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "coins" INTEGER NOT NULL,
    "refundedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_goal_pledge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "scheduled_gift" (
    "id" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "recipientId" TEXT,
    "itemId" VARCHAR(64) NOT NULL,
    "price" INTEGER NOT NULL,
    "message" VARCHAR(200),
    "deliverAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(12) NOT NULL DEFAULT 'SCHEDULED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deliveredAt" TIMESTAMP(3),
    "unwrappedAt" TIMESTAMP(3),

    CONSTRAINT "scheduled_gift_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "savings_goal_userId_createdAt_idx" ON "savings_goal"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "loadout_preset_userId_name_key" ON "loadout_preset"("userId", "name");

-- CreateIndex
CREATE INDEX "community_goal_status_deadline_idx" ON "community_goal"("status", "deadline");

-- CreateIndex
CREATE INDEX "community_goal_createdAt_idx" ON "community_goal"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "community_goal_pledge_goalId_refundedAt_idx" ON "community_goal_pledge"("goalId", "refundedAt");

-- CreateIndex
CREATE INDEX "community_goal_pledge_userId_createdAt_idx" ON "community_goal_pledge"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "scheduled_gift_status_deliverAt_idx" ON "scheduled_gift"("status", "deliverAt");

-- CreateIndex
CREATE INDEX "scheduled_gift_recipientId_status_deliverAt_idx" ON "scheduled_gift"("recipientId", "status", "deliverAt");

-- CreateIndex
CREATE INDEX "scheduled_gift_senderId_createdAt_idx" ON "scheduled_gift"("senderId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "savings_goal" ADD CONSTRAINT "savings_goal_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loadout_preset" ADD CONSTRAINT "loadout_preset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_goal_pledge" ADD CONSTRAINT "community_goal_pledge_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "community_goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_goal_pledge" ADD CONSTRAINT "community_goal_pledge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_gift" ADD CONSTRAINT "scheduled_gift_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scheduled_gift" ADD CONSTRAINT "scheduled_gift_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

