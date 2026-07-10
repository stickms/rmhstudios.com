-- Rich media on direct messages: an optional single GIF and up to 4 images,
-- mirroring RMHark posts. Existing rows default to no media.
ALTER TABLE "direct_message" ADD COLUMN "gifUrl" TEXT;
ALTER TABLE "direct_message" ADD COLUMN "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
