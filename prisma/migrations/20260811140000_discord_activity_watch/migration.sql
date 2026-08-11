-- Discord activity watch: the tables behind /sohumbum2.
--
-- Six tables, written by the discord-bot worker's watch tracker
-- (go-services/internal/discordbot/watch*.go):
--   * two open/close session logs (voice, rich presence),
--   * one raw message log kept only long enough to summarise,
--   * one daily rollup the calendar renders from,
--   * one summary table holding the DeepSeek day/week/month write-ups,
--   * one single-row-per-user "now" record for the live profile card.
--
-- Nothing here is scoped to a guild-wide audience: the tracker only writes rows
-- for the Discord IDs in DISCORD_WATCH_USER_IDS, so these tables hold an
-- explicit allowlist rather than everyone the bot can see.

-- ── Voice ────────────────────────────────────────────────────────────────────
CREATE TABLE "discord_watch_voice_session" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "joinedAt" TIMESTAMP(3) NOT NULL,
    "leftAt" TIMESTAMP(3),
    "endedReason" TEXT,
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "mutedSec" INTEGER NOT NULL DEFAULT 0,
    "deafenedSec" INTEGER NOT NULL DEFAULT 0,
    "streamingSec" INTEGER NOT NULL DEFAULT 0,
    "videoSec" INTEGER NOT NULL DEFAULT 0,
    "aloneSec" INTEGER NOT NULL DEFAULT 0,
    "selfMute" BOOLEAN NOT NULL DEFAULT false,
    "selfDeaf" BOOLEAN NOT NULL DEFAULT false,
    "streaming" BOOLEAN NOT NULL DEFAULT false,
    "video" BOOLEAN NOT NULL DEFAULT false,
    "serverMute" BOOLEAN NOT NULL DEFAULT false,
    "serverDeaf" BOOLEAN NOT NULL DEFAULT false,
    "peerCount" INTEGER NOT NULL DEFAULT 0,
    "peakPeers" INTEGER NOT NULL DEFAULT 0,
    "flagsChangedAt" TIMESTAMP(3) NOT NULL,
    "peersChangedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_voice_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_discord_watch_voice_user" ON "discord_watch_voice_session"("discordId", "joinedAt" DESC);
-- The open-session lookup the tracker runs on every restart and every flush.
CREATE INDEX "idx_discord_watch_voice_open" ON "discord_watch_voice_session"("discordId", "leftAt");

-- ── Messages ─────────────────────────────────────────────────────────────────
CREATE TABLE "discord_watch_message" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "messageId" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "content" VARCHAR(500),
    "charCount" INTEGER NOT NULL DEFAULT 0,
    "wordCount" INTEGER NOT NULL DEFAULT 0,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "embeds" INTEGER NOT NULL DEFAULT 0,
    "links" INTEGER NOT NULL DEFAULT 0,
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "emoji" INTEGER NOT NULL DEFAULT 0,
    "stickers" INTEGER NOT NULL DEFAULT 0,
    "isReply" BOOLEAN NOT NULL DEFAULT false,
    "isQuestion" BOOLEAN NOT NULL DEFAULT false,
    "isLateNight" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_watch_message_pkey" PRIMARY KEY ("id")
);

-- Unique so a gateway redelivery cannot double-count a message.
CREATE UNIQUE INDEX "discord_watch_message_messageId_key" ON "discord_watch_message"("messageId");
CREATE INDEX "idx_discord_watch_message_user" ON "discord_watch_message"("discordId", "sentAt" DESC);

-- ── Rich presence (games) ────────────────────────────────────────────────────
CREATE TABLE "discord_watch_presence_session" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "activityName" TEXT NOT NULL,
    "activityType" INTEGER NOT NULL DEFAULT 0,
    "details" TEXT,
    "state" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_presence_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_discord_watch_presence_user" ON "discord_watch_presence_session"("discordId", "startedAt" DESC);
CREATE INDEX "idx_discord_watch_presence_open" ON "discord_watch_presence_session"("discordId", "endedAt");

-- ── Daily rollup ─────────────────────────────────────────────────────────────
CREATE TABLE "discord_watch_day" (
    "discordId" TEXT NOT NULL,
    "dateKey" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/New_York',
    "voiceSec" INTEGER NOT NULL DEFAULT 0,
    "voiceSessions" INTEGER NOT NULL DEFAULT 0,
    "longestVoiceSec" INTEGER NOT NULL DEFAULT 0,
    "mutedSec" INTEGER NOT NULL DEFAULT 0,
    "deafenedSec" INTEGER NOT NULL DEFAULT 0,
    "streamingSec" INTEGER NOT NULL DEFAULT 0,
    "videoSec" INTEGER NOT NULL DEFAULT 0,
    "aloneSec" INTEGER NOT NULL DEFAULT 0,
    "lateNightSec" INTEGER NOT NULL DEFAULT 0,
    "messages" INTEGER NOT NULL DEFAULT 0,
    "words" INTEGER NOT NULL DEFAULT 0,
    "characters" INTEGER NOT NULL DEFAULT 0,
    "attachments" INTEGER NOT NULL DEFAULT 0,
    "links" INTEGER NOT NULL DEFAULT 0,
    "mentions" INTEGER NOT NULL DEFAULT 0,
    "emoji" INTEGER NOT NULL DEFAULT 0,
    "stickers" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "questions" INTEGER NOT NULL DEFAULT 0,
    "lateNightMessages" INTEGER NOT NULL DEFAULT 0,
    "reactionsGiven" INTEGER NOT NULL DEFAULT 0,
    "reactionsReceived" INTEGER NOT NULL DEFAULT 0,
    "gamingSec" INTEGER NOT NULL DEFAULT 0,
    "gameSessions" INTEGER NOT NULL DEFAULT 0,
    "topGame" TEXT,
    "topGameSec" INTEGER NOT NULL DEFAULT 0,
    "topChannel" TEXT,
    "topChannelMessages" INTEGER NOT NULL DEFAULT 0,
    "hourlyMessages" JSONB,
    "hourlyVoiceSec" JSONB,
    "firstSeenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_day_pkey" PRIMARY KEY ("discordId", "dateKey")
);

CREATE INDEX "idx_discord_watch_day_user_date" ON "discord_watch_day"("discordId", "dateKey" DESC);

-- ── Summaries (day / week / month) ───────────────────────────────────────────
CREATE TABLE "discord_watch_summary" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "periodKey" TEXT NOT NULL,
    "headline" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "verdict" TEXT,
    "mood" TEXT,
    "topics" JSONB,
    "model" TEXT NOT NULL,
    "sourceHash" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_summary_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_watch_summary_discordId_period_periodKey_key" ON "discord_watch_summary"("discordId", "period", "periodKey");
CREATE INDEX "idx_discord_watch_summary_lookup" ON "discord_watch_summary"("discordId", "period", "periodKey" DESC);

-- ── Live state (the profile card) ────────────────────────────────────────────
-- A "now" record rather than a log: one row per tracked user, overwritten in
-- place. Discord's online/idle/dnd status is a level, not an interval, so there
-- is nothing in the session tables to derive it from after the event passes.
CREATE TABLE "discord_watch_live" (
    "discordId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'offline',
    "statusChangedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "username" TEXT,
    "globalName" TEXT,
    "avatarHash" TEXT,
    "activityName" TEXT,
    "activityType" INTEGER,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_live_pkey" PRIMARY KEY ("discordId")
);
