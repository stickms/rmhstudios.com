-- Sitewide announcements: a blog post can be flagged as an announcement that
-- pops up once for every visitor and is pinned in the feed.
-- AlterTable
ALTER TABLE "blog_post" ADD COLUMN     "announcement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "business" VARCHAR(40) NOT NULL DEFAULT 'rmh-studios',
ADD COLUMN     "announcedAt" TIMESTAMP(3),
ADD COLUMN     "announcementExpiresAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "blog_announcement_seen" (
    "userId" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "seenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "blog_announcement_seen_pkey" PRIMARY KEY ("userId","postId")
);

-- CreateIndex
CREATE INDEX "blog_announcement_seen_postId_idx" ON "blog_announcement_seen"("postId");

-- CreateIndex
CREATE INDEX "blog_post_announcement_announcedAt_idx" ON "blog_post"("announcement", "announcedAt" DESC);

-- AddForeignKey
ALTER TABLE "blog_announcement_seen" ADD CONSTRAINT "blog_announcement_seen_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_announcement_seen" ADD CONSTRAINT "blog_announcement_seen_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;
