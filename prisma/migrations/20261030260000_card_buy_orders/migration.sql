-- CreateEnum
CREATE TYPE "BuyOrderStatus" AS ENUM ('OPEN', 'FILLED', 'CANCELED');

-- CreateTable
CREATE TABLE "card_buy_order" (
    "id" TEXT NOT NULL,
    "buyerId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "cardIndex" SMALLINT NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "priceCoins" INTEGER NOT NULL,
    "status" "BuyOrderStatus" NOT NULL DEFAULT 'OPEN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),
    "filledListingId" TEXT,

    CONSTRAINT "card_buy_order_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_buy_order_price_positive" CHECK ("priceCoins" > 0)
);

-- CreateIndex
CREATE INDEX "card_buy_order_gameId_cardIndex_foil_status_priceCoins_idx" ON "card_buy_order"("gameId", "cardIndex", "foil", "status", "priceCoins" DESC);

-- CreateIndex
CREATE INDEX "card_buy_order_buyerId_status_idx" ON "card_buy_order"("buyerId", "status");

-- One open order per member per card (a partial index Prisma does not model).
CREATE UNIQUE INDEX "card_buy_order_one_open_per_card" ON "card_buy_order"("buyerId", "gameId", "cardIndex", "foil") WHERE "status" = 'OPEN';

-- AddForeignKey
ALTER TABLE "card_buy_order" ADD CONSTRAINT "card_buy_order_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
