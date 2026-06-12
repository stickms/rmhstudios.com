CREATE TABLE "discord_chat_session" (
    "discordUserId" TEXT NOT NULL,
    "username"      TEXT NOT NULL,
    "history"       JSONB NOT NULL,
    "lastMessageId" TEXT,
    "updatedAt"     TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_chat_session_pkey" PRIMARY KEY ("discordUserId")
);
