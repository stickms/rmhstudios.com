-- CreateTable
CREATE TABLE "card_listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "gameId" VARCHAR(64) NOT NULL,
    "cardIndex" SMALLINT NOT NULL,
    "foil" BOOLEAN NOT NULL DEFAULT false,
    "priceCoins" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "card_listing_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "card_listing_price_positive" CHECK ("priceCoins" > 0)
);

-- CreateIndex
CREATE INDEX "card_listing_status_gameId_cardIndex_foil_priceCoins_idx" ON "card_listing"("status", "gameId", "cardIndex", "foil", "priceCoins");

-- CreateIndex
CREATE INDEX "card_listing_sellerId_status_idx" ON "card_listing"("sellerId", "status");

-- AddForeignKey
ALTER TABLE "card_listing" ADD CONSTRAINT "card_listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_listing" ADD CONSTRAINT "card_listing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
