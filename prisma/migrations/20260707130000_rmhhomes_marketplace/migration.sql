-- RMHHomes rewrite: replace the external-aggregation saved-listing tables with a
-- community marketplace (user-posted HomeListing + HomeFavorite).

-- CreateEnum
CREATE TYPE "HomeListingType" AS ENUM ('RENT', 'SALE');

-- CreateEnum
CREATE TYPE "HomePropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'CONDO', 'TOWNHOUSE', 'ROOM', 'OTHER');

-- CreateEnum
CREATE TYPE "HomeListingStatus" AS ENUM ('ACTIVE', 'RENTED', 'SOLD', 'REMOVED');

-- DropForeignKey
ALTER TABLE "home_saved_listing" DROP CONSTRAINT "home_saved_listing_userId_fkey";

-- DropForeignKey
ALTER TABLE "home_saved_search" DROP CONSTRAINT "home_saved_search_userId_fkey";

-- DropTable
DROP TABLE "home_saved_listing";

-- DropTable
DROP TABLE "home_saved_search";

-- CreateTable
CREATE TABLE "home_listing" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "status" "HomeListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "listingType" "HomeListingType" NOT NULL,
    "propertyType" "HomePropertyType" NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(4000) NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "beds" INTEGER NOT NULL,
    "baths" DOUBLE PRECISION NOT NULL,
    "sqft" INTEGER,
    "address" VARCHAR(300),
    "city" VARCHAR(120) NOT NULL,
    "state" VARCHAR(64) NOT NULL,
    "postalCode" VARCHAR(16),
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
    "availableFrom" TIMESTAMP(3),
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "viewsCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_favorite" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_favorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_listing_status_listingType_createdAt_idx" ON "home_listing"("status", "listingType", "createdAt");

-- CreateIndex
CREATE INDEX "home_listing_city_state_idx" ON "home_listing"("city", "state");

-- CreateIndex
CREATE INDEX "home_listing_authorId_status_idx" ON "home_listing"("authorId", "status");

-- CreateIndex
CREATE INDEX "home_favorite_userId_createdAt_idx" ON "home_favorite"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "home_favorite_userId_listingId_key" ON "home_favorite"("userId", "listingId");

-- AddForeignKey
ALTER TABLE "home_listing" ADD CONSTRAINT "home_listing_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_favorite" ADD CONSTRAINT "home_favorite_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_favorite" ADD CONSTRAINT "home_favorite_listingId_fkey" FOREIGN KEY ("listingId") REFERENCES "home_listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
