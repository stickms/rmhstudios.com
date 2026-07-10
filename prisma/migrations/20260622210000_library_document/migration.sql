-- User-uploaded library books. The PDF + cover live in R2 (keyed by id); this
-- row holds the metadata the bookshelf and reader resolve. The static catalog
-- (public/library + data/library-metadata.json) is unaffected.

-- CreateTable
CREATE TABLE "library_document" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "pages" INTEGER NOT NULL DEFAULT 0,
    "pdfKey" TEXT NOT NULL,
    "coverKey" TEXT,
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "uploadedByUserId" TEXT,
    "reported" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_document_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "library_document_slug_key" ON "library_document"("slug");

-- CreateIndex
CREATE INDEX "library_document_createdAt_idx" ON "library_document"("createdAt");

-- CreateIndex
CREATE INDEX "library_document_uploadedByUserId_idx" ON "library_document"("uploadedByUserId");

-- AddForeignKey
ALTER TABLE "library_document" ADD CONSTRAINT "library_document_uploadedByUserId_fkey" FOREIGN KEY ("uploadedByUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
