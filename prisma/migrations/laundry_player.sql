-- LaundryPlayer table for Laundry Sort game leaderboard
-- Run this against your PostgreSQL database.

CREATE TABLE IF NOT EXISTS "LaundryPlayer" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    "highScore"   INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_laundry_high_score ON "LaundryPlayer" ("highScore" DESC);
