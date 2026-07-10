-- Library: EPUB support + reader-made collections ("series").
--
-- 1. LibraryDocument gains a `format` column ("pdf" | "epub") so the upload,
--    storage, serving and reader paths know which kind of file a row is. Existing
--    rows default to "pdf" — unchanged behaviour.
-- 2. Two new tables back collections: a grouping owned by a user (or admin, for
--    "official" series) and its ordered member books, referenced by stable slug.

-- AlterTable
ALTER TABLE "library_document" ADD COLUMN "format" TEXT NOT NULL DEFAULT 'pdf';

-- CreateTable
CREATE TABLE "library_collection" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "ownerUserId" TEXT,
    "official" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "library_collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "library_collection_item" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "bookSlug" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_collection_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_collection_slug_key" ON "library_collection"("slug");

-- CreateIndex
CREATE INDEX "library_collection_ownerUserId_idx" ON "library_collection"("ownerUserId");

-- CreateIndex
CREATE INDEX "library_collection_official_idx" ON "library_collection"("official");

-- CreateIndex
CREATE UNIQUE INDEX "library_collection_item_collectionId_bookSlug_key" ON "library_collection_item"("collectionId", "bookSlug");

-- CreateIndex
CREATE INDEX "library_collection_item_collectionId_idx" ON "library_collection_item"("collectionId");

-- AddForeignKey
ALTER TABLE "library_collection" ADD CONSTRAINT "library_collection_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "library_collection_item" ADD CONSTRAINT "library_collection_item_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "library_collection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
