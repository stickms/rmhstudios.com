-- Platform expansion (docs/plans/2026-07-19-platform-expansion-design.md)
-- Twelve features: Arcade Pass, Creator Studio tiers, Live Spaces, RMHEvents,
-- Replays, Player Marketplace, Gifting v2 / Onboarding v2 / Stat cards flags.

-- CreateEnum
CREATE TYPE "SpaceStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "EventVenueKind" AS ENUM ('SPACE', 'TOURNAMENT', 'GAME', 'URL', 'IRL');

-- CreateEnum
CREATE TYPE "ListingStatus" AS ENUM ('ACTIVE', 'SOLD', 'CANCELED', 'HELD');

-- AlterEnum
ALTER TYPE "CoinTxnType" ADD VALUE 'MARKET';

-- AlterEnum
ALTER TYPE "RMHarkAudience" ADD VALUE 'SUPPORTERS';

-- AlterTable
ALTER TABLE "creator_membership" ADD COLUMN "tierId" TEXT;

-- AlterTable
ALTER TABLE "notification_preference" ADD COLUMN "emailDigest" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN "firstWeekRewardedAt" TIMESTAMP(3),
ADD COLUMN "receiveGifts" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "arcade_streak" (
    "userId" TEXT NOT NULL,
    "current" INTEGER NOT NULL DEFAULT 0,
    "best" INTEGER NOT NULL DEFAULT 0,
    "lastDay" VARCHAR(10),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "arcade_streak_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "creator_tier" (
    "id" TEXT NOT NULL,
    "creatorId" TEXT NOT NULL,
    "name" VARCHAR(40) NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "perks" JSONB NOT NULL DEFAULT '[]',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "creator_tier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "communityId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "status" "SpaceStatus" NOT NULL DEFAULT 'SCHEDULED',
    "scheduledAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "pinned" JSONB,
    "recordChat" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "space_message" (
    "id" TEXT NOT NULL,
    "spaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "body" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "space_message_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "community_event" (
    "id" TEXT NOT NULL,
    "hostId" TEXT NOT NULL,
    "communityId" TEXT,
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venueKind" "EventVenueKind" NOT NULL,
    "venueRef" VARCHAR(191),
    "capacity" INTEGER,
    "canceledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "community_event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(8) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "game_replay" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "game" VARCHAR(32) NOT NULL,
    "version" VARCHAR(16) NOT NULL,
    "score" INTEGER,
    "durationMs" INTEGER NOT NULL,
    "data" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "visibility" VARCHAR(8) NOT NULL DEFAULT 'public',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_replay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "market_listing" (
    "id" TEXT NOT NULL,
    "sellerId" TEXT NOT NULL,
    "inventoryId" TEXT NOT NULL,
    "itemId" VARCHAR(64) NOT NULL,
    "priceCoins" INTEGER NOT NULL,
    "status" "ListingStatus" NOT NULL DEFAULT 'ACTIVE',
    "buyerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "market_listing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shared_moment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" VARCHAR(24) NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shared_moment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "creator_membership_tierId_idx" ON "creator_membership"("tierId");

-- CreateIndex
CREATE INDEX "creator_tier_creatorId_active_idx" ON "creator_tier"("creatorId", "active");

-- CreateIndex
CREATE INDEX "space_status_startedAt_idx" ON "space"("status", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "space_communityId_status_idx" ON "space"("communityId", "status");

-- CreateIndex
CREATE INDEX "space_message_spaceId_createdAt_idx" ON "space_message"("spaceId", "createdAt");

-- CreateIndex
CREATE INDEX "community_event_communityId_startsAt_idx" ON "community_event"("communityId", "startsAt");

-- CreateIndex
CREATE INDEX "community_event_startsAt_idx" ON "community_event"("startsAt");

-- CreateIndex
CREATE UNIQUE INDEX "event_rsvp_eventId_userId_key" ON "event_rsvp"("eventId", "userId");

-- CreateIndex
CREATE INDEX "event_rsvp_userId_createdAt_idx" ON "event_rsvp"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "game_replay_game_score_idx" ON "game_replay"("game", "score" DESC);

-- CreateIndex
CREATE INDEX "game_replay_userId_createdAt_idx" ON "game_replay"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "market_listing_inventoryId_key" ON "market_listing"("inventoryId");

-- CreateIndex
CREATE INDEX "market_listing_status_itemId_priceCoins_idx" ON "market_listing"("status", "itemId", "priceCoins");

-- CreateIndex
CREATE INDEX "market_listing_sellerId_status_idx" ON "market_listing"("sellerId", "status");

-- CreateIndex
CREATE INDEX "shared_moment_userId_createdAt_idx" ON "shared_moment"("userId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "creator_membership" ADD CONSTRAINT "creator_membership_tierId_fkey" FOREIGN KEY ("tierId") REFERENCES "creator_tier"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "arcade_streak" ADD CONSTRAINT "arcade_streak_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "creator_tier" ADD CONSTRAINT "creator_tier_creatorId_fkey" FOREIGN KEY ("creatorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space" ADD CONSTRAINT "space_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space" ADD CONSTRAINT "space_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_message" ADD CONSTRAINT "space_message_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "space"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "space_message" ADD CONSTRAINT "space_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_event" ADD CONSTRAINT "community_event_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_event" ADD CONSTRAINT "community_event_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "community_event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rsvp" ADD CONSTRAINT "event_rsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_replay" ADD CONSTRAINT "game_replay_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listing" ADD CONSTRAINT "market_listing_sellerId_fkey" FOREIGN KEY ("sellerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "market_listing" ADD CONSTRAINT "market_listing_buyerId_fkey" FOREIGN KEY ("buyerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_moment" ADD CONSTRAINT "shared_moment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
