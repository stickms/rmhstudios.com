-- s13-12: a member follows a news story and is told once when a published article is linked to it.
CREATE TABLE "news_story_follow" (
    "storyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "news_story_follow_pkey" PRIMARY KEY ("storyId","userId")
);

-- CreateIndex
CREATE INDEX "news_story_follow_userId_idx" ON "news_story_follow"("userId");

-- AddForeignKey
ALTER TABLE "news_story_follow" ADD CONSTRAINT "news_story_follow_storyId_fkey" FOREIGN KEY ("storyId") REFERENCES "news_story"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_story_follow" ADD CONSTRAINT "news_story_follow_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
