-- RMH News (lib/news-wire/): the News table now also holds headlines pulled from public feeds (origin WIRE), ordered by
-- the outlet's publication time, with a DeepSeek summary cached the first time a reader opens one. Every column is
-- additive with a default, so the old web container keeps reading and writing during the blue/green swap.
-- migration-safety: acknowledged[create-index-not-concurrent] news_article holds a few hundred editorial rows and its only writer is the jobs worker's ingest, which is added in this release
CREATE TYPE "NewsOrigin" AS ENUM ('EDITORIAL', 'WIRE');

ALTER TABLE "news_article" ADD COLUMN "origin" "NewsOrigin" NOT NULL DEFAULT 'EDITORIAL',
ADD COLUMN "feedId" TEXT,
ADD COLUMN "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "summary" TEXT,
ADD COLUMN "summarizedAt" TIMESTAMP(3);

-- Existing articles keep their place: their publication time is their `date` (YYYY-MM-DD), else when they were made.
UPDATE "news_article"
SET "publishedAt" = CASE
  WHEN "date" ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}' THEN to_timestamp(substring("date" from 1 for 10), 'YYYY-MM-DD')::timestamp
  ELSE "createdAt"
END;

-- The keyword categorizer's twelve categories replace the pipeline's eight (lib/news-wire/categorize.ts).
UPDATE "news_article"
SET "category" = CASE "category"
  WHEN 'AI/ML' THEN 'AI'
  WHEN 'Tech Industry' THEN 'Technology'
  WHEN 'Neuroscience' THEN 'Science'
  WHEN 'Cognitive Science' THEN 'Science'
  WHEN 'Culture' THEN 'Entertainment'
  WHEN 'Arts' THEN 'Entertainment'
  ELSE "category"
END
WHERE "category" IN ('AI/ML', 'Tech Industry', 'Neuroscience', 'Cognitive Science', 'Culture', 'Arts');

-- Follows of a renamed category follow its new name. A member who followed two categories that merge (Neuroscience and
-- Cognitive Science, or Science and Neuroscience) keeps one follow, because (userId, kind, target) is unique.
DELETE FROM "reading_subscription" a
USING "reading_subscription" b
WHERE a."kind" = 'news_category' AND b."kind" = 'news_category' AND a."userId" = b."userId" AND a."id" <> b."id"
  AND a."target" IN ('AI/ML', 'Tech Industry', 'Neuroscience', 'Cognitive Science', 'Culture', 'Arts')
  AND (CASE a."target"
    WHEN 'AI/ML' THEN 'AI' WHEN 'Tech Industry' THEN 'Technology' WHEN 'Neuroscience' THEN 'Science'
    WHEN 'Cognitive Science' THEN 'Science' WHEN 'Culture' THEN 'Entertainment' WHEN 'Arts' THEN 'Entertainment'
    ELSE a."target" END) = (CASE b."target"
    WHEN 'AI/ML' THEN 'AI' WHEN 'Tech Industry' THEN 'Technology' WHEN 'Neuroscience' THEN 'Science'
    WHEN 'Cognitive Science' THEN 'Science' WHEN 'Culture' THEN 'Entertainment' WHEN 'Arts' THEN 'Entertainment'
    ELSE b."target" END)
  AND (b."target" NOT IN ('AI/ML', 'Tech Industry', 'Neuroscience', 'Cognitive Science', 'Culture', 'Arts') OR b."id" < a."id");

UPDATE "reading_subscription"
SET "target" = CASE "target"
    WHEN 'AI/ML' THEN 'AI' WHEN 'Tech Industry' THEN 'Technology' WHEN 'Neuroscience' THEN 'Science'
    WHEN 'Cognitive Science' THEN 'Science' WHEN 'Culture' THEN 'Entertainment' WHEN 'Arts' THEN 'Entertainment'
    ELSE "target" END
WHERE "kind" = 'news_category'
  AND "target" IN ('AI/ML', 'Tech Industry', 'Neuroscience', 'Cognitive Science', 'Culture', 'Arts');

CREATE INDEX "news_article_status_publishedAt_idx" ON "news_article"("status", "publishedAt" DESC);
CREATE INDEX "news_article_status_category_publishedAt_idx" ON "news_article"("status", "category", "publishedAt" DESC);
CREATE INDEX "news_article_sourceUrl_idx" ON "news_article"("sourceUrl");
