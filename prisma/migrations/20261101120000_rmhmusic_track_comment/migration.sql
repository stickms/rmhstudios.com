-- CreateTable
CREATE TABLE "rmh_music_track_comment" (
    "id" TEXT NOT NULL,
    "trackUri" VARCHAR(256) NOT NULL,
    "userId" TEXT NOT NULL,
    "positionMs" INTEGER NOT NULL,
    "body" VARCHAR(280) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rmh_music_track_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "rmh_music_track_comment_trackUri_positionMs_idx" ON "rmh_music_track_comment"("trackUri", "positionMs");

-- CreateIndex
CREATE INDEX "rmh_music_track_comment_userId_trackUri_idx" ON "rmh_music_track_comment"("userId", "trackUri");

-- AddForeignKey
ALTER TABLE "rmh_music_track_comment" ADD CONSTRAINT "rmh_music_track_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
