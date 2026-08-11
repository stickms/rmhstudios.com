-- Time online, broken down by status and by client.
--
-- `discord_watch_live` records a LEVEL — the status right now, and when it last
-- changed. That answers "is he online" and cannot answer "how long was he online
-- yesterday, and how much of it was on his phone". This is the log that can:
-- one row per contiguous run of (status × client set), same open/close shape as
-- the voice sessions, resumed across a brief restart by the same heartbeat rule.
--
-- Offline is the ABSENCE of a row rather than a row of its own — a gap is
-- already unambiguous, and storing it would double the write volume to record
-- something derivable.
CREATE TABLE "discord_watch_status_session" (
    "id" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "desktop" BOOLEAN NOT NULL DEFAULT false,
    "mobile" BOOLEAN NOT NULL DEFAULT false,
    "web" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "endedAt" TIMESTAMP(3),
    "durationSec" INTEGER NOT NULL DEFAULT 0,
    "endedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discord_watch_status_session_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "idx_discord_watch_status_user" ON "discord_watch_status_session"("discordId", "startedAt" DESC);
CREATE INDEX "idx_discord_watch_status_open" ON "discord_watch_status_session"("discordId", "endedAt");

-- Per-status time is mutually exclusive and sums to presence for the day.
ALTER TABLE "discord_watch_day" ADD COLUMN "onlineSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "idleSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "dndSec" INTEGER NOT NULL DEFAULT 0;

-- Per-client time OVERLAPS: desktop and mobile are routinely both signed in, so
-- these three can sum to more than the day's presence. Deliberate.
ALTER TABLE "discord_watch_day" ADD COLUMN "desktopSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "mobileSec" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "discord_watch_day" ADD COLUMN "webSec" INTEGER NOT NULL DEFAULT 0;
