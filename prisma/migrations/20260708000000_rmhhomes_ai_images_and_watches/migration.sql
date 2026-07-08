-- RMHHomes: AI-generated listing images + saved-search watches with alerts.

-- AlterTable: track which listing images were AI-generated.
ALTER TABLE "home_listing" ADD COLUMN "aiImages" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable: saved-search watches that notify the owner on new matching listings.
CREATE TABLE "home_watch" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "listingType" "HomeListingType",
    "propertyTypes" "HomePropertyType"[] DEFAULT ARRAY[]::"HomePropertyType"[],
    "locationLabel" VARCHAR(200),
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "radiusKm" INTEGER,
    "minPriceCents" INTEGER,
    "maxPriceCents" INTEGER,
    "minBeds" INTEGER,
    "minBaths" DOUBLE PRECISION,
    "petsRequired" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_watch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_watch_userId_createdAt_idx" ON "home_watch"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "home_watch_active_idx" ON "home_watch"("active");

-- AddForeignKey
ALTER TABLE "home_watch" ADD CONSTRAINT "home_watch_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
