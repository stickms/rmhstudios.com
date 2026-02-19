-- SignalForgePlayer table for Signal Forge game leaderboard
-- Run this against your PostgreSQL database.

CREATE TABLE IF NOT EXISTS "SignalForgePlayer" (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username      TEXT NOT NULL UNIQUE,
    "highScore"   INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "floorReached" INTEGER NOT NULL DEFAULT 1,
    "updatedAt"   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_signal_forge_high_score ON "SignalForgePlayer" ("highScore" DESC);
CREATE INDEX IF NOT EXISTS idx_signal_forge_floor ON "SignalForgePlayer" ("floorReached" DESC);
