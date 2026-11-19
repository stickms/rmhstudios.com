-- Contract step for the Feed consolidation (#1730, migration
-- 20261119230000_feeds_fold_lists_searches_alerts).
-- rmh:contract-ok #1730 is deployed (deploy run 1180); the release now serving
-- reads and writes custom_feed / custom_feed_member only, and so does this one.
--
-- 1. Re-copy what the previous release wrote to the old tables during the
--    blue/green swap. Only rows created after the expand migration STARTED are
--    considered: anything older was copied by it, and an unfiltered re-run would
--    resurrect lists, members, searches or alerts users deleted since.
-- 2. Refuse to drop saved_search if it holds rows of a surface the copy never
--    carried (none ever had a writer); the deploy stops instead of losing them.
-- 3. Drop the old tables and the custom_feed.authorIds mirror column.

DO $$
DECLARE cutoff timestamptz;
BEGIN
  SELECT started_at INTO cutoff FROM "_prisma_migrations"
   WHERE migration_name = '20261119230000_feeds_fold_lists_searches_alerts';
  IF cutoff IS NULL THEN
    RAISE EXCEPTION 'expand migration 20261119230000 has not run';
  END IF;

  IF EXISTS (SELECT 1 FROM "saved_search" WHERE "surface" <> 'search') THEN
    RAISE EXCEPTION 'saved_search has non-search rows; they were never copied into custom_feed';
  END IF;

  -- People the previous release set on a feed (it wrote authorIds only).
  INSERT INTO "custom_feed_member" ("feedId", "userId", "addedAt")
  SELECT f."id", a."userId", f."updatedAt"
  FROM "custom_feed" AS f
  CROSS JOIN LATERAL unnest(COALESCE(f."authorIds", ARRAY[]::TEXT[])) AS a("userId")
  JOIN "user" AS u ON u."id" = a."userId"
  WHERE f."kind" = 'feed' AND f."updatedAt" >= cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "custom_feed" (
    "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
    "isPublic", "visibility", "pinned", "types", "notify", "createdAt", "updatedAt"
  )
  SELECT
    l."id", l."ownerId", 'list', l."name", l."bio", ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[],
    l."visibility" = 'PUBLIC', l."visibility", l."pinned", ARRAY[]::TEXT[], false, l."createdAt", l."createdAt"
  FROM "user_list" AS l
  WHERE l."createdAt" >= cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "custom_feed_member" ("feedId", "userId", "addedAt")
  SELECT m."listId", m."userId", m."addedAt"
  FROM "user_list_member" AS m
  JOIN "custom_feed" AS f ON f."id" = m."listId" AND f."kind" = 'list'
  WHERE m."addedAt" >= cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "custom_feed" (
    "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
    "isPublic", "visibility", "query", "types", "notify", "lastRunAt", "createdAt", "updatedAt"
  )
  SELECT
    s."id", s."userId", 'search', LEFT(COALESCE(NULLIF(s."name", ''), s."query"), 60), NULL,
    ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], false, 'PRIVATE', s."query",
    CASE WHEN jsonb_typeof(s."types") = 'array'
      THEN ARRAY(SELECT jsonb_array_elements_text(s."types"))
      ELSE ARRAY[]::TEXT[] END,
    s."alerts", s."lastRunAt", s."createdAt", s."createdAt"
  FROM "saved_search" AS s
  WHERE s."surface" = 'search' AND s."createdAt" >= cutoff
  ON CONFLICT DO NOTHING;

  INSERT INTO "custom_feed" (
    "id", "ownerId", "kind", "name", "description", "tags", "authorIds", "keywords",
    "isPublic", "visibility", "query", "anchor", "types", "notify", "createdAt", "updatedAt"
  )
  SELECT
    k."id", k."userId", 'alert', LEFT(k."query", 60), NULL,
    ARRAY[]::TEXT[], ARRAY[]::TEXT[], ARRAY[]::TEXT[], false, 'PRIVATE', k."query", k."anchor",
    ARRAY[]::TEXT[], true, k."createdAt", k."createdAt"
  FROM "keyword_alert" AS k
  WHERE k."createdAt" >= cutoff
  ON CONFLICT DO NOTHING;
END $$;

DROP TABLE IF EXISTS "user_list_member";
DROP TABLE IF EXISTS "user_list";
DROP TABLE IF EXISTS "saved_search";
DROP TABLE IF EXISTS "keyword_alert";
ALTER TABLE "custom_feed" DROP COLUMN IF EXISTS "authorIds";
