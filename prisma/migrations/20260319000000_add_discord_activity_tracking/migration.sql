-- CreateTable
CREATE TABLE "discord_activity_channel" (
    "id" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "activity" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recapDateKey" TEXT,
    "recapDueAt" TIMESTAMP(3),

    CONSTRAINT "discord_activity_channel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discord_daily_participant" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'playing',
    "moves" INTEGER,
    "ratingEmoji" TEXT,
    "ratingLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_daily_participant_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "idx_discord_activity_recap_due" ON "discord_activity_channel"("recapDueAt");

-- CreateIndex
CREATE UNIQUE INDEX "discord_activity_channel_guildId_activity_key" ON "discord_activity_channel"("guildId", "activity");

-- CreateIndex
CREATE INDEX "idx_discord_daily_participant_guild_date" ON "discord_daily_participant"("guildId", "dateKey");

-- CreateIndex
CREATE INDEX "idx_discord_daily_participant_user_date" ON "discord_daily_participant"("discordId", "dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "discord_daily_participant_discordId_guildId_dateKey_key" ON "discord_daily_participant"("discordId", "guildId", "dateKey");
