-- GlobeSet's versus record: one aggregate row per player, written by the socket
-- hub when a race finishes.
--
-- An aggregate rather than a match table, following `laundry_player` — the
-- other casual versus game on the same hub. GlobeSet rooms are ephemeral and
-- have no ladder behind them, so a row per match would be unbounded growth
-- nobody queries. Anonymous racers are never written: their id is
-- `guest:<socketId>` and dies with the connection.
--
-- Safe under blue/green: a brand new table, so old code simply never reads it,
-- and `userId` is nullable-free but unique, which is the shape the upsert in
-- `finishRound()` relies on.
-- CreateTable
CREATE TABLE IF NOT EXISTS "globeset_player" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "racesPlayed" INTEGER NOT NULL DEFAULT 0,
    "racesWon" INTEGER NOT NULL DEFAULT 0,
    "bestRaceMs" INTEGER,
    "setsFound" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "globeset_player_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "globeset_player_userId_key" ON "globeset_player"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "globeset_player_racesWon_idx" ON "globeset_player"("racesWon" DESC);

-- AddForeignKey
ALTER TABLE "globeset_player" ADD CONSTRAINT "globeset_player_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
