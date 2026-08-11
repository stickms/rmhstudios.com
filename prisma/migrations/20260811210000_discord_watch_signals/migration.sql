-- /sohumtracker — the three signals the tracker was not recording, plus the
-- bookkeeping two features need to be idempotent.
--
-- 1. Job mentions. A boolean on the message, counted onto the day. The flag is
--    decided when the message arrives and lives on the DAY row, which is what
--    lets "days since he mentioned applying for a job" keep working after the
--    45-day retention sweep has deleted the text it was decided from.
--
-- 2. Compose sessions. One row per run of typing, `sent` recording whether a
--    message came out of it. A separate table rather than counters because the
--    day rollups are RECOMPUTED from raw rows, not incremented — a counter here
--    would be wiped by the next recompute.
--
-- 3. Voice-join alerts. `alerted_at` on the voice session is the claim a sweep
--    takes before pushing, so two workers racing cannot both notify.
--
-- 4. `digest_posted_at` on the summary, so a weekly digest is announced once
--    even when the summary behind it is regenerated as the figures settle.

-- 1 ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "discord_watch_message" ADD COLUMN "mentionsJob" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "discord_watch_day" ADD COLUMN "jobMentions" INTEGER NOT NULL DEFAULT 0;

-- 2 ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "discord_watch_day" ADD COLUMN "typingStarts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "typingAbandoned" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "typingAbandonedSec" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "discord_watch_typing_session" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "guildId" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "channelName" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastTypingAt" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "sent" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_typing_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_discord_watch_typing_user" ON "discord_watch_typing_session"("discordId", "startedAt" DESC);
-- The open-run lookup: one row at a time per channel, found on every typing
-- event and every message, so it is the hot path of this table.
CREATE INDEX "idx_discord_watch_typing_open" ON "discord_watch_typing_session"("discordId", "settledAt");

-- 3 ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "discord_watch_voice_session" ADD COLUMN "alertedAt" TIMESTAMP(3);

CREATE TABLE "discord_watch_alert" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'voice',
    "lastNotifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discord_watch_alert_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "discord_watch_alert_userId_discordId_kind_key" ON "discord_watch_alert"("userId", "discordId", "kind");
CREATE INDEX "idx_discord_watch_alert_target" ON "discord_watch_alert"("discordId", "kind");

ALTER TABLE "discord_watch_alert" ADD CONSTRAINT "discord_watch_alert_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4 ────────────────────────────────────────────────────────────────────────────
ALTER TABLE "discord_watch_summary" ADD COLUMN "digestPostedAt" TIMESTAMP(3);
