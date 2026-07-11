-- RMHHomes: aggregate third-party (scraped) listings alongside community posts.
-- Adds source attribution + external-listing fields to home_listing (author now
-- nullable for scraped rows), plus the scraper's source registry and run log.


-- CreateEnum
CREATE TYPE "HomeListingSource" AS ENUM ('COMMUNITY', 'EXTERNAL');

-- CreateEnum
CREATE TYPE "HomeSourceProvider" AS ENUM ('CRAIGSLIST', 'RSS');

-- CreateEnum
CREATE TYPE "HomeSourceStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR', 'BLOCKED');

-- CreateEnum
CREATE TYPE "HomeRunTrigger" AS ENUM ('CRON', 'MANUAL');

-- AlterTable
ALTER TABLE "home_listing" ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "externalUrl" VARCHAR(1000),
ADD COLUMN     "lastSeenAt" TIMESTAMP(3),
ADD COLUMN     "source" "HomeListingSource" NOT NULL DEFAULT 'COMMUNITY',
ADD COLUMN     "sourceName" VARCHAR(120),
ADD COLUMN     "sourceRefId" TEXT,
ALTER COLUMN "authorId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "home_source" (
    "id" TEXT NOT NULL,
    "key" VARCHAR(200) NOT NULL,
    "provider" "HomeSourceProvider" NOT NULL,
    "label" VARCHAR(120) NOT NULL,
    "region" VARCHAR(64),
    "category" VARCHAR(32),
    "url" VARCHAR(1000),
    "listingType" "HomeListingType" NOT NULL DEFAULT 'RENT',
    "defaultCity" VARCHAR(120),
    "defaultState" VARCHAR(64),
    "defaultLat" DOUBLE PRECISION,
    "defaultLng" DOUBLE PRECISION,
    "status" "HomeSourceStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastRunAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastError" VARCHAR(500),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "home_source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "home_scrape_run" (
    "id" TEXT NOT NULL,
    "trigger" "HomeRunTrigger" NOT NULL DEFAULT 'CRON',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "discoveredCount" INTEGER NOT NULL DEFAULT 0,
    "createdCount" INTEGER NOT NULL DEFAULT 0,
    "updatedCount" INTEGER NOT NULL DEFAULT 0,
    "expiredCount" INTEGER NOT NULL DEFAULT 0,
    "errorCount" INTEGER NOT NULL DEFAULT 0,
    "stats" JSONB,

    CONSTRAINT "home_scrape_run_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "home_source_key_key" ON "home_source"("key");

-- CreateIndex
CREATE INDEX "home_source_status_idx" ON "home_source"("status");

-- CreateIndex
CREATE INDEX "home_scrape_run_startedAt_idx" ON "home_scrape_run"("startedAt");

-- CreateIndex
CREATE INDEX "home_listing_source_status_createdAt_idx" ON "home_listing"("source", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "home_listing_sourceRefId_externalId_key" ON "home_listing"("sourceRefId", "externalId");

-- AddForeignKey
ALTER TABLE "home_listing" ADD CONSTRAINT "home_listing_sourceRefId_fkey" FOREIGN KEY ("sourceRefId") REFERENCES "home_source"("id") ON DELETE SET NULL ON UPDATE CASCADE;

