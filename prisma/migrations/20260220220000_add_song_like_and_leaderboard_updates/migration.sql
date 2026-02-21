-- CreateTable
CREATE TABLE "SongLike" (
    "id" TEXT NOT NULL,
    "songId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SongLike_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "SongLeaderboard" ADD COLUMN "modifiers" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "SongLike_songId_userId_key" ON "SongLike"("songId", "userId");

-- CreateUniqueIndex (SongLeaderboard)
CREATE UNIQUE INDEX "SongLeaderboard_songId_userId_key" ON "SongLeaderboard"("songId", "userId");

-- AddForeignKey
ALTER TABLE "SongLike" ADD CONSTRAINT "SongLike_songId_fkey" FOREIGN KEY ("songId") REFERENCES "Song"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SongLike" ADD CONSTRAINT "SongLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
