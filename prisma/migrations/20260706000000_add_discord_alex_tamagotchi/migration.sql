-- Alex tamagotchi: one communal virtual pet per Discord guild, plus a per-user
-- caretaking leaderboard.

CREATE TABLE "discord_alex_pet" (
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Alex',
    "generation" INTEGER NOT NULL DEFAULT 1,
    "bornAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hunger" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "happiness" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "energy" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "hygiene" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "lifeStage" TEXT NOT NULL DEFAULT 'infant',
    "statsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChannelId" TEXT,
    "lastFedAt" TIMESTAMP(3),
    "lastPlayedAt" TIMESTAMP(3),
    "lastCleanedAt" TIMESTAMP(3),
    "lastSleptAt" TIMESTAMP(3),
    "lastChatAt" TIMESTAMP(3),
    "lastCareAlertAt" TIMESTAMP(3),
    "lastAmbientAt" TIMESTAMP(3),
    "diedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_pet_pkey" PRIMARY KEY ("guildId")
);

CREATE TABLE "discord_alex_caretaker" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "feeds" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "cleans" INTEGER NOT NULL DEFAULT 0,
    "naps" INTEGER NOT NULL DEFAULT 0,
    "talks" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_caretaker_pkey" PRIMARY KEY ("guildId", "userId")
);

CREATE INDEX "discord_alex_caretaker_guildId_points_idx" ON "discord_alex_caretaker"("guildId", "points");
