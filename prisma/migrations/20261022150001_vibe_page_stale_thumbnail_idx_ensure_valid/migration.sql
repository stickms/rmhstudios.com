-- Make sure vibe_page_stale_updated_idx (created CONCURRENTLY by 20261022150000_vibe_page_stale_thumbnail_idx) is VALID.
--
-- deploy.sh runs migrations with lock_timeout=5s and retries a failed migration
-- (P3009: resolve --rolled-back, then deploy again). A CREATE INDEX CONCURRENTLY
-- that times out after its catalog entry exists leaves an INVALID index; the retry's
-- IF NOT EXISTS then sees that index and records the migration as applied, and the
-- index is never usable. This migration repairs that case and is a no-op otherwise.
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
  WHERE i.indexrelid = to_regclass('public."vibe_page_stale_updated_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "vibe_page_stale_updated_idx";
    CREATE INDEX "vibe_page_stale_updated_idx" ON "vibe_page" ("updatedAt") WHERE "thumbnailStale" = true;
  END IF;
END $$;
