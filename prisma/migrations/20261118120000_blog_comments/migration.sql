-- CreateTable
CREATE TABLE "blog_comment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" VARCHAR(2000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "blog_comment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blog_comment_postId_createdAt_idx" ON "blog_comment"("postId", "createdAt");

-- AddForeignKey
ALTER TABLE "blog_comment" ADD CONSTRAINT "blog_comment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "blog_post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blog_comment" ADD CONSTRAINT "blog_comment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
