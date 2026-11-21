-- Log drafts, scheduled publishing and revisions: a status on every Log (existing rows stay published) and
-- a revision table. publishedAt is backfilled from createdAt so readers keep their order.

-- AlterTable
ALTER TABLE "blog_post" ADD COLUMN     "publishAt" TIMESTAMP(3),
ADD COLUMN     "publishedAt" TIMESTAMP(3) DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "status" VARCHAR(12) NOT NULL DEFAULT 'published',
ADD COLUMN     "updatedById" TEXT;

-- CreateTable
CREATE TABLE "blog_post_revision" (
    "id" BIGSERIAL NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tags" TEXT[],
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_post_revision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_post_revision_postId_createdAt_idx" ON "blog_post_revision"("postId", "createdAt" DESC);

-- migration-safety: acknowledged[create-index-not-concurrent] blog_post holds the Logs (well under a
-- thousand rows, written only by admins), so the build takes a negligible lock.
-- CreateIndex
CREATE INDEX "blog_post_status_publishedAt_idx" ON "blog_post"("status", "publishedAt" DESC);

-- AddForeignKey
ALTER TABLE "blog_post_revision" ADD CONSTRAINT "blog_post_revision_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: the column default stamped every existing row with the migration time; restore the real date.
UPDATE "blog_post" SET "publishedAt" = "createdAt";
