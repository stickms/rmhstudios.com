-- s11 13: price changes on home listings. Additive only; no index on an existing table.
ALTER TABLE "home_listing" ADD COLUMN "priceDroppedAt" TIMESTAMP(3);

ALTER TABLE "home_favorite" ADD COLUMN "priceAlerts" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "home_favorite" ADD COLUMN "priceNoticeAt" TIMESTAMP(3);

CREATE TABLE "home_listing_price_change" (
    "id" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "oldCents" INTEGER NOT NULL,
    "newCents" INTEGER NOT NULL,
    "source" VARCHAR(8) NOT NULL,
    "changedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_listing_price_change_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "home_listing_price_change_listingId_changedAt_idx" ON "home_listing_price_change"("listingId", "changedAt");

ALTER TABLE "home_listing_price_change" ADD CONSTRAINT "home_listing_price_change_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "home_listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
