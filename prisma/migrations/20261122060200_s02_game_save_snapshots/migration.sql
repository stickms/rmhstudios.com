-- Version history for cloud saves: the previous blob is kept when a save is overwritten, restored or deleted
-- (lib/game-saves/snapshots.server.ts), ten per game, so a bad autosave is never final.

-- CreateTable
CREATE TABLE "game_save_snapshot" (
    "id" BIGSERIAL NOT NULL,
    "userId" TEXT NOT NULL,
    "gameId" VARCHAR(48) NOT NULL,
    "saveData" JSONB NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "reason" VARCHAR(16) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_save_snapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "game_save_snapshot_userId_gameId_createdAt_idx" ON "game_save_snapshot"("userId", "gameId", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "game_save_snapshot" ADD CONSTRAINT "game_save_snapshot_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

