-- Rolling per-channel memory of Alex's @mention conversations, so his replies
-- remember what was said beyond Discord's recent-message window and persist
-- across bot restarts (previously @mentions were stateless and forgot anything
-- that scrolled out of view). `messages` holds a trimmed JSON transcript of
-- recent channel turns; the discord-bot worker prunes it by count and age on
-- every write. See go-services/internal/discordbot/chat_memory.go.
CREATE TABLE "discord_alex_channel_memory" (
    "channelId" TEXT NOT NULL,
    "guildId"   TEXT NOT NULL,
    "messages"  JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_alex_channel_memory_pkey" PRIMARY KEY ("channelId")
);
