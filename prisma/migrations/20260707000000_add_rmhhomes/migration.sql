-- CreateTable
CREATE TABLE "home_saved_listing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "listingId" VARCHAR(255) NOT NULL,
    "source" VARCHAR(20) NOT NULL,
    "snapshot" JSONB NOT NULL,
    "notes" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "home_saved_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_saved_search" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "query" VARCHAR(500) NOT NULL,
    "location" VARCHAR(200) NOT NULL,
    "alertsEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_saved_search_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "home_saved_listing_userId_createdAt_idx" ON "home_saved_listing"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "home_saved_listing_userId_listingId_key" ON "home_saved_listing"("userId", "listingId");

-- CreateIndex
CREATE INDEX "home_saved_search_userId_createdAt_idx" ON "home_saved_search"("userId", "createdAt");

-- AddForeignKey
ALTER TABLE "home_saved_listing" ADD CONSTRAINT "home_saved_listing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "home_saved_search" ADD CONSTRAINT "home_saved_search_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
