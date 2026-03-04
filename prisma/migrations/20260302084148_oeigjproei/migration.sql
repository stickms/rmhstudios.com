-- CreateEnum
CREATE TYPE "NewsStatus" AS ENUM ('STAGING', 'PUBLISHED');

-- AlterTable
ALTER TABLE "user_profile" ADD COLUMN     "profileSongAlbumArt" VARCHAR(500),
ADD COLUMN     "profileSongArtist" VARCHAR(200),
ADD COLUMN     "profileSongPreviewUrl" VARCHAR(500),
ADD COLUMN     "profileSongSpotifyId" VARCHAR(50),
ADD COLUMN     "profileSongTitle" VARCHAR(200);

-- CreateTable
CREATE TABLE "forest_explorer_save" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "saveData" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "forest_explorer_save_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_article" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "tags" TEXT[],
    "featured" BOOLEAN NOT NULL DEFAULT false,
    "sourceTitle" TEXT NOT NULL,
    "sourceUrl" TEXT NOT NULL,
    "sourcePublisher" TEXT NOT NULL,
    "sourceDate" TEXT,
    "image" TEXT,
    "status" "NewsStatus" NOT NULL DEFAULT 'PUBLISHED',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "news_article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "forest_explorer_save_userId_key" ON "forest_explorer_save"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "news_article_slug_key" ON "news_article"("slug");

-- CreateIndex
CREATE INDEX "news_article_status_date_idx" ON "news_article"("status", "date" DESC);

-- CreateIndex
CREATE INDEX "news_article_category_idx" ON "news_article"("category");

-- CreateIndex
CREATE INDEX "news_article_slug_idx" ON "news_article"("slug");

-- AddForeignKey
ALTER TABLE "forest_explorer_save" ADD CONSTRAINT "forest_explorer_save_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
