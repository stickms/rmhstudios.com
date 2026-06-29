-- AlterTable: idempotency key for retry-safe album slide uploads
ALTER TABLE "album_slide" ADD COLUMN "uploadKey" TEXT;

-- CreateIndex: a slide's uploadKey is unique within its album (NULLs allowed,
-- Postgres permits multiple NULLs in a unique index).
CREATE UNIQUE INDEX "album_slide_albumId_uploadKey_key" ON "album_slide"("albumId", "uploadKey");
