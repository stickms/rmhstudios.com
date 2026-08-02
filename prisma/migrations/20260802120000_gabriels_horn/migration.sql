-- Gabriel's Horn — one record row per account that has finished a game.
-- Written fire-and-forget by the socket hub when hands are counted.
--
-- `bestHand` is deliberately nullable rather than `DEFAULT 0`: zero is a real
-- hand (an empty one, which is the best possible result), so it cannot double
-- as "no game finished yet".
--
-- IF NOT EXISTS throughout so re-running against a database that already has
-- the table is a no-op.

-- CreateTable
CREATE TABLE IF NOT EXISTS "GabrielsHornPlayer" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "gamesPlayed" INTEGER NOT NULL DEFAULT 0,
    "wins" INTEGER NOT NULL DEFAULT 0,
    "bestHand" INTEGER,
    "hornsSounded" INTEGER NOT NULL DEFAULT 0,
    "hornsWon" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userId" TEXT,

    CONSTRAINT "GabrielsHornPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GabrielsHornPlayer_username_key" ON "GabrielsHornPlayer"("username");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "GabrielsHornPlayer_userId_key" ON "GabrielsHornPlayer"("userId");

-- CreateIndex: the board sorts on wins.
CREATE INDEX IF NOT EXISTS "idx_gabriels_horn_wins" ON "GabrielsHornPlayer"("wins" DESC);

-- AddForeignKey. `ADD CONSTRAINT` has no IF NOT EXISTS in Postgres, so the
-- catalog is checked first to keep the whole migration re-runnable.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'GabrielsHornPlayer_userId_fkey'
    ) THEN
        ALTER TABLE "GabrielsHornPlayer"
            ADD CONSTRAINT "GabrielsHornPlayer_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
