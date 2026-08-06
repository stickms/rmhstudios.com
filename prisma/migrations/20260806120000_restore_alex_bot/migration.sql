-- Bring Alex back, and retire the Liquid Globe bot that replaced him.
--
-- 20260803120000_retire_alex_bot dropped these five tables when the discord-bot
-- worker became the one-command /liquid bot. The worker is Alex again, so the
-- tables he keeps his state in have to exist again.
--
-- This is a forward migration, not a revert of that one: the drop has already
-- been applied to production, so the history has to replay as
-- create → drop → create rather than pretend the drop never happened. The
-- tables are recreated in their FINAL shape — every ALTER between
-- 20260706000000 and 20260710000000 folded in — because replaying those
-- incremental steps against tables that no longer exist is not possible.
--
-- The data Alex had before the drop is gone; nothing here restores it. A pet
-- that comes back is a new generation, and the caretaker leaderboard starts
-- from zero. IF NOT EXISTS throughout, so this is a no-op on a database where
-- the retirement never ran.
--
-- "image_gen_budget" is untouched: it survived the retirement, it is shared
-- with the bot-worker, and Alex's /show selfies reserve against the same row.

CREATE TABLE IF NOT EXISTS "discord_chat_session" (
    "discordUserId" TEXT NOT NULL,
    "username"      TEXT NOT NULL,
    "history"       JSONB NOT NULL,
    "lastMessageId" TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_chat_session_pkey" PRIMARY KEY ("discordUserId")
);

CREATE TABLE IF NOT EXISTS "discord_alex_channel_memory" (
    "channelId" TEXT NOT NULL,
    "guildId"   TEXT NOT NULL,
    "messages"  JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_channel_memory_pkey" PRIMARY KEY ("channelId")
);

CREATE TABLE IF NOT EXISTS "discord_alex_pet" (
    "guildId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Alex',
    "generation" INTEGER NOT NULL DEFAULT 1,
    "bornAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hunger" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "happiness" DOUBLE PRECISION NOT NULL DEFAULT 80,
    "energy" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "hygiene" DOUBLE PRECISION NOT NULL DEFAULT 90,
    "health" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "intelligence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "alive" BOOLEAN NOT NULL DEFAULT true,
    "lifeStage" TEXT NOT NULL DEFAULT 'infant',
    "career" TEXT,
    "statsUpdatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastInteractionAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastChannelId" TEXT,
    "lastFedAt" TIMESTAMP(3),
    "lastPlayedAt" TIMESTAMP(3),
    "lastCleanedAt" TIMESTAMP(3),
    "lastSleptAt" TIMESTAMP(3),
    "lastStudiedAt" TIMESTAMP(3),
    "lastChatAt" TIMESTAMP(3),
    "lastCareAlertAt" TIMESTAMP(3),
    "lastAmbientAt" TIMESTAMP(3),
    "diedAt" TIMESTAMP(3),
    "introSentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_pet_pkey" PRIMARY KEY ("guildId")
);

-- messageLevel replaced the original ambientEnabled boolean in
-- 20260707140000; customPrompt arrived in 20260709190000.
CREATE TABLE IF NOT EXISTS "discord_alex_guild" (
    "guildId" TEXT NOT NULL,
    "lastChannelId" TEXT,
    "introSentAt" TIMESTAMP(3),
    "messageLevel" TEXT NOT NULL DEFAULT 'all',
    "customPrompt" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_guild_pkey" PRIMARY KEY ("guildId")
);

-- avatarHash arrived in 20260707160000, interactions in 20260709000000.
CREATE TABLE IF NOT EXISTS "discord_alex_caretaker" (
    "guildId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarHash" TEXT,
    "feeds" INTEGER NOT NULL DEFAULT 0,
    "plays" INTEGER NOT NULL DEFAULT 0,
    "cleans" INTEGER NOT NULL DEFAULT 0,
    "naps" INTEGER NOT NULL DEFAULT 0,
    "talks" INTEGER NOT NULL DEFAULT 0,
    "studies" INTEGER NOT NULL DEFAULT 0,
    "interactions" INTEGER NOT NULL DEFAULT 0,
    "points" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_caretaker_pkey" PRIMARY KEY ("guildId", "userId")
);

CREATE INDEX IF NOT EXISTS "discord_alex_caretaker_guildId_points_idx" ON "discord_alex_caretaker"("guildId", "points");
