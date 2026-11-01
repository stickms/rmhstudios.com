-- CreateTable
CREATE TABLE "playlist_collaborator" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_collaborator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playlist_collaborator_userId_idx" ON "playlist_collaborator"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "playlist_collaborator_playlistId_userId_key" ON "playlist_collaborator"("playlistId", "userId");

-- AddForeignKey
ALTER TABLE "playlist_collaborator" ADD CONSTRAINT "playlist_collaborator_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_collaborator" ADD CONSTRAINT "playlist_collaborator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
