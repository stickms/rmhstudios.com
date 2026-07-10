-- CreateTable
CREATE TABLE "album" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "album_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "album_slide" (
    "id" TEXT NOT NULL,
    "albumId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "fullKey" TEXT,
    "srcKey" TEXT NOT NULL,
    "thumbKey" TEXT NOT NULL,
    "mime" TEXT,
    "alt" TEXT NOT NULL DEFAULT '',
    "download" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "album_slide_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "album_slug_key" ON "album"("slug");

-- CreateIndex
CREATE INDEX "album_position_idx" ON "album"("position");

-- CreateIndex
CREATE INDEX "album_slide_albumId_position_idx" ON "album_slide"("albumId", "position");

-- AddForeignKey
ALTER TABLE "album_slide" ADD CONSTRAINT "album_slide_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "album"("id") ON DELETE CASCADE ON UPDATE CASCADE;
