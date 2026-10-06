-- Dunesday (/dunesday) cloud sync: one row per synced marathon plan, read by
-- the calendar/RSS feeds and the Discord sweep. Addressed by an unguessable
-- feedId; edits need a token whose SHA-256 is all that is stored.
--
-- Safe under blue/green: a brand new table that old code never reads.
-- CreateTable
CREATE TABLE "dunesday_plan" (
    "id" TEXT NOT NULL,
    "feedId" VARCHAR(32) NOT NULL,
    "editTokenHash" VARCHAR(64) NOT NULL,
    "state" JSONB NOT NULL,
    "timeZone" VARCHAR(64) NOT NULL DEFAULT 'UTC',
    "discordWebhookUrl" VARCHAR(500),
    "discordDaily" BOOLEAN NOT NULL DEFAULT true,
    "discordProgress" BOOLEAN NOT NULL DEFAULT true,
    "discordName" VARCHAR(40),
    "lastDailyPostDate" VARCHAR(10),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dunesday_plan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "dunesday_plan_feedId_key" ON "dunesday_plan"("feedId");

-- CreateIndex
CREATE INDEX "dunesday_plan_discordWebhookUrl_discordDaily_idx" ON "dunesday_plan"("discordWebhookUrl", "discordDaily");
