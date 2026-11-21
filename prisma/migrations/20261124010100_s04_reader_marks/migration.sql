-- Reader sync: a signed-in reader's place, bookmarks and page notes per book, so they follow
-- the member across devices (lib/library/reader-sync.server.ts). Additive: one new table.

-- CreateTable
CREATE TABLE "library_reader_mark" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "docSlug" VARCHAR(200) NOT NULL,
    "clientId" VARCHAR(40) NOT NULL,
    "kind" VARCHAR(8) NOT NULL,
    "page" INTEGER NOT NULL,
    "location" VARCHAR(200),
    "label" VARCHAR(120),
    "body" VARCHAR(2000),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "library_reader_mark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "library_reader_mark_userId_docSlug_idx" ON "library_reader_mark"("userId", "docSlug");

-- CreateIndex
CREATE INDEX "library_reader_mark_userId_kind_updatedAt_idx" ON "library_reader_mark"("userId", "kind", "updatedAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "library_reader_mark_userId_docSlug_clientId_key" ON "library_reader_mark"("userId", "docSlug", "clientId");

-- AddForeignKey
ALTER TABLE "library_reader_mark" ADD CONSTRAINT "library_reader_mark_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

