-- Make sure post_hashtag_hashtagId_createdAt_rmheetId_idx (created CONCURRENTLY by 20261022160100_post_hashtag_keyset_idx) is VALID.
--
-- deploy.sh runs migrations with lock_timeout=5s and retries a failed migration
-- (P3009: resolve --rolled-back, then deploy again). A CREATE INDEX CONCURRENTLY
-- that times out after its catalog entry exists leaves an INVALID index; the retry's
-- IF NOT EXISTS then sees that index and records the migration as applied, and the
-- index is never usable. This migration repairs that case and is a no-op otherwise.
--
-- This one also guards the next migration (20261022160200), which drops the old
-- (hashtagId, createdAt) index: it must only run once this index is valid, or the
-- tag feed would be left with no usable index.
--
-- migration-safety: acknowledged the plain CREATE INDEX below only runs when the
-- concurrent build above failed and left an invalid (or no) index; in the normal
-- case nothing is built or locked. The repair takes a SHARE lock for the build,
-- under the same 5 s lock_timeout, and a failure is retried by deploy.sh.
DO $$
DECLARE
  valid boolean;
BEGIN
  SELECT i.indisvalid INTO valid
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public."post_hashtag_hashtagId_createdAt_rmheetId_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "post_hashtag_hashtagId_createdAt_rmheetId_idx";
    CREATE INDEX "post_hashtag_hashtagId_createdAt_rmheetId_idx" ON "post_hashtag" ("hashtagId", "createdAt" DESC, "rmheetId" DESC);
  END IF;
END $$;
