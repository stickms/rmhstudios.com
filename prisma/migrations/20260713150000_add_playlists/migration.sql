-- CreateTable
CREATE TABLE "playlist" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "kind" VARCHAR(16) NOT NULL DEFAULT 'music',
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "playlist_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "playlist_item" (
    "id" TEXT NOT NULL,
    "playlistId" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "externalId" VARCHAR(255) NOT NULL,
    "title" VARCHAR(300) NOT NULL,
    "subtitle" VARCHAR(300),
    "thumbnail" VARCHAR(500),
    "url" VARCHAR(1000),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "playlist_userId_updatedAt_idx" ON "playlist"("userId", "updatedAt" DESC);

-- CreateIndex
CREATE INDEX "playlist_item_playlistId_position_idx" ON "playlist_item"("playlistId", "position");

-- AddForeignKey
ALTER TABLE "playlist" ADD CONSTRAINT "playlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_item" ADD CONSTRAINT "playlist_item_playlistId_fkey" FOREIGN KEY ("playlistId") REFERENCES "playlist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

