-- Updated AltairPlayer table with totalXP column and proper indexes for all 3 leaderboards.
-- Run this against your PostgreSQL database.

CREATE TABLE IF NOT EXISTS "AltairPlayer" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    "bestTime"    DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalKills"  INTEGER NOT NULL DEFAULT 0,
    "totalXP"     INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add totalXP if upgrading from old schema
ALTER TABLE "AltairPlayer" ADD COLUMN IF NOT EXISTS "totalXP" INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_altair_best_time  ON "AltairPlayer" ("bestTime" DESC);
CREATE INDEX IF NOT EXISTS idx_altair_kills      ON "AltairPlayer" ("totalKills" DESC);
CREATE INDEX IF NOT EXISTS idx_altair_xp         ON "AltairPlayer" ("totalXP" DESC);
