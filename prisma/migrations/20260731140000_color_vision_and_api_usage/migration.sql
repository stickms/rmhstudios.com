-- Colour-vision preference + persistent developer-API usage.

-- ─── 1. Colour-vision mode ──────────────────────────────────────────────────
-- Retints the semantic success/danger/warning tokens for viewers with a
-- colour-vision deficiency. NULL means no override (the default palette).
ALTER TABLE "appearance_preference" ADD COLUMN "colorVision" VARCHAR(16);

-- ─── 2. Developer API usage ─────────────────────────────────────────────────
-- Per-key, per-UTC-day rollup. The rate limiter's counters live in Redis with a
-- 26-hour TTL, which is right for enforcement and useless for everything else:
-- a developer could not see how much of their quota they had consumed, there
-- was no history to reason about a spike, and support had nothing to look at.
-- One row per key per day is a rollup, not a request log — cheap to keep and
-- enough to answer every question the headers can't.
CREATE TABLE "api_usage_daily" (
    "id"        TEXT NOT NULL,
    "keyId"     TEXT NOT NULL,
    -- UTC day as "YYYYMMDD"; matches the rate limiter's bucket exactly so the
    -- two never disagree about which day a request belongs to.
    "day"       VARCHAR(8) NOT NULL,
    -- Requests served, and cost-weighted units drawn against the daily quota.
    "requests"  INTEGER NOT NULL DEFAULT 0,
    "units"     INTEGER NOT NULL DEFAULT 0,
    -- 4xx and 5xx counts, split: a client integrating badly and a server
    -- failing are different problems and should not sum into one number.
    "clientErrors" INTEGER NOT NULL DEFAULT 0,
    "serverErrors" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "api_usage_daily_pkey" PRIMARY KEY ("id")
);

-- The upsert target: one row per (key, day).
CREATE UNIQUE INDEX "api_usage_daily_keyId_day_key" ON "api_usage_daily"("keyId", "day");
-- Reading a key's history is always "this key, most recent days first".
CREATE INDEX "api_usage_daily_keyId_day_idx" ON "api_usage_daily"("keyId", "day" DESC);

ALTER TABLE "api_usage_daily"
  ADD CONSTRAINT "api_usage_daily_keyId_fkey"
  FOREIGN KEY ("keyId") REFERENCES "developer_api_key"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
