-- RMH News discussions (lib/news-wire/discussion.server.ts): an article's comments and reposts live on one ordinary
-- post by the RMH News account, linked here, and the feed pick records when it put an article in the feed.
-- Both columns are nullable and additive: the old web container never reads them.
-- migration-safety: acknowledged[create-index-not-concurrent] news_article holds at most a few thousand rows (wire rows are pruned after 21 days) and its only writers are the jobs worker and the summary endpoint
ALTER TABLE "news_article" ADD COLUMN "postId" VARCHAR(64),
ADD COLUMN "featuredAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "news_article_postId_key" ON "news_article"("postId");
CREATE INDEX "news_article_featuredAt_idx" ON "news_article"("featuredAt" DESC);
