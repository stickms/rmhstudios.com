-- Collection cover image (AI-generated), served via /api/library/cover/<collectionId>.
ALTER TABLE "library_collection" ADD COLUMN "coverKey" TEXT;
