-- Nightrail — one record row per account that has finished a run.
-- Written through the shared game-score pipeline (lib/game/adapters.server.ts),
-- so every column here is a personal best that only ever moves upward.
--
-- `bestMultiplier` is stored alongside `highScore` because the score alone
-- cannot tell a long careful delivery from a short brilliant one: the
-- multiplier is the number that reflects trick skill, and the leaderboard
-- would hide it otherwise. It defaults to 1 rather than 0 because a run with
-- no combo at all still scores at ×1 — zero is not a reachable value.
--
-- IF NOT EXISTS throughout so re-running against a database that already has
-- the table is a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "NightrailPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "highScore" INTEGER NOT NULL DEFAULT 0,
    "bestDistance" INTEGER NOT NULL DEFAULT 0,
    "bestMultiplier" INTEGER NOT NULL DEFAULT 1,
    "bestLevel" INTEGER NOT NULL DEFAULT 1,
    "runsFinished" INTEGER NOT NULL DEFAULT 0,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "NightrailPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NightrailPlayer_username_key" ON "NightrailPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "NightrailPlayer_userId_key" ON "NightrailPlayer"("userId");

-- CreateIndex: the board sorts on the high score.
CREATE INDEX IF NOT EXISTS "idx_nightrail_high_score" ON "NightrailPlayer"("highScore" DESC);

-- AddForeignKey. `ADD CONSTRAINT` has no IF NOT EXISTS in Postgres, so the
-- catalog is checked first to keep the whole migration re-runnable.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'NightrailPlayer_userId_fkey'
    ) THEN
        ALTER TABLE "NightrailPlayer"
            ADD CONSTRAINT "NightrailPlayer_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
