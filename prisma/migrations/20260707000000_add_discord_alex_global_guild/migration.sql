-- Alex becomes a single global pet shared across all servers. Per-guild data
-- (which channel to talk in, whether he's introduced himself there) moves out of
-- the now-global discord_alex_pet row into this table, so his proactive messages
-- can broadcast to every server's last-used channel.

CREATE TABLE "discord_alex_guild" (
    "guildId" TEXT NOT NULL,
    "lastChannelId" TEXT,
    "introSentAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_guild_pkey" PRIMARY KEY ("guildId")
);
