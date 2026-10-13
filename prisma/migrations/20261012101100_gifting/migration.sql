-- CreateTable
CREATE TABLE "user_birthday" (
    "userId" TEXT NOT NULL,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "lastNotifiedYear" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_birthday_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "advent_claim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "door" INTEGER NOT NULL,
    "coins" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "advent_claim_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_exchange" (
    "id" TEXT NOT NULL,
    "organizerId" TEXT NOT NULL,
    "kind" VARCHAR(8) NOT NULL DEFAULT 'GIFT',
    "title" VARCHAR(80) NOT NULL,
    "theme" VARCHAR(80),
    "budget" INTEGER,
    "drawAt" TIMESTAMP(3) NOT NULL,
    "revealAt" TIMESTAMP(3) NOT NULL,
    "status" VARCHAR(10) NOT NULL DEFAULT 'OPEN',
    "seed" INTEGER,
    "singleCycle" BOOLEAN,
    "drawnAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_exchange_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "gift_exchange_member" (
    "id" TEXT NOT NULL,
    "exchangeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "recipientId" TEXT,
    "excludeIds" TEXT[],
    "tracks" JSONB,
    "giftedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "gift_exchange_member_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kudos" (
    "id" TEXT NOT NULL,
    "fromId" TEXT NOT NULL,
    "toId" TEXT NOT NULL,
    "reason" VARCHAR(200) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kudos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "user_birthday_month_day_idx" ON "user_birthday"("month", "day");

-- CreateIndex
CREATE UNIQUE INDEX "advent_claim_userId_year_door_key" ON "advent_claim"("userId", "year", "door");

-- CreateIndex
CREATE INDEX "gift_exchange_organizerId_idx" ON "gift_exchange"("organizerId");

-- CreateIndex
CREATE INDEX "gift_exchange_status_drawAt_idx" ON "gift_exchange"("status", "drawAt");

-- CreateIndex
CREATE INDEX "gift_exchange_member_userId_idx" ON "gift_exchange_member"("userId");

-- CreateIndex
CREATE INDEX "gift_exchange_member_recipientId_idx" ON "gift_exchange_member"("recipientId");

-- CreateIndex
CREATE UNIQUE INDEX "gift_exchange_member_exchangeId_userId_key" ON "gift_exchange_member"("exchangeId", "userId");

-- CreateIndex
CREATE INDEX "kudos_toId_createdAt_idx" ON "kudos"("toId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "kudos_fromId_createdAt_idx" ON "kudos"("fromId", "createdAt");

-- AddForeignKey
ALTER TABLE "user_birthday" ADD CONSTRAINT "user_birthday_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "advent_claim" ADD CONSTRAINT "advent_claim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_exchange" ADD CONSTRAINT "gift_exchange_organizerId_fkey" FOREIGN KEY ("organizerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_exchange_member" ADD CONSTRAINT "gift_exchange_member_exchangeId_fkey" FOREIGN KEY ("exchangeId") REFERENCES "gift_exchange"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_exchange_member" ADD CONSTRAINT "gift_exchange_member_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "gift_exchange_member" ADD CONSTRAINT "gift_exchange_member_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_fromId_fkey" FOREIGN KEY ("fromId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kudos" ADD CONSTRAINT "kudos_toId_fkey" FOREIGN KEY ("toId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

