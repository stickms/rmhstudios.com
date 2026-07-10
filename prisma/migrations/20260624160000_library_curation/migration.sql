-- Curation + S3 migration support for the library.
--   official       — curated/official entry (admin upload or migrated static book)
--   position       — manual sort order within a section
--   originFilename — source filename when migrated from public/library (idempotency key)
--   toc            — preserved table of contents for migrated/edited books

-- AlterTable
ALTER TABLE "library_document" ADD COLUMN "official" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "library_document" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "library_document" ADD COLUMN "originFilename" TEXT;
ALTER TABLE "library_document" ADD COLUMN "toc" JSONB;

-- CreateIndex
CREATE UNIQUE INDEX "library_document_originFilename_key" ON "library_document"("originFilename");

-- CreateIndex
CREATE INDEX "library_document_official_idx" ON "library_document"("official");
