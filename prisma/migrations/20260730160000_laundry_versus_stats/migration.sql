-- Laundry Sort gained a multiplayer race mode, so LaundryPlayer needs a versus
-- record alongside the existing solo one. The two modes are scored separately:
-- a 90-second solo run and a 90-second race against seven other people are not
-- the same achievement, and folding them into one column would make the
-- leaderboard unreadable.
--
-- All columns default, so existing rows are valid without a backfill.
-- IF NOT EXISTS so re-running against a database that already has them is a no-op.

ALTER TABLE "LaundryPlayer"
  ADD COLUMN IF NOT EXISTS "versusWins" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "versusPlayed" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "versusBest" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "bestCombo" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "totalSorted" INTEGER NOT NULL DEFAULT 0;

-- The versus board sorts on wins, the same way the solo board sorts on
-- highScore (idx_laundry_high_score).
CREATE INDEX IF NOT EXISTS "idx_laundry_versus_wins"
  ON "LaundryPlayer" ("versusWins" DESC);
