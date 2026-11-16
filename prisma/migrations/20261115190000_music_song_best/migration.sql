-- RMH Music songs (Phase 4): a learner's best score per song per mode (wait / play). Additive: one
-- new table, nothing existing changes.

-- CreateTable
CREATE TABLE "music_song_best" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "songId" VARCHAR(64) NOT NULL,
    "mode" VARCHAR(8) NOT NULL,
    "bestScore" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "music_song_best_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "music_song_best_userId_songId_mode_key" ON "music_song_best"("userId", "songId", "mode");

-- AddForeignKey
ALTER TABLE "music_song_best" ADD CONSTRAINT "music_song_best_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
