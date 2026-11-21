-- Make sure content_report_reporterId_createdAt_idx (created CONCURRENTLY by 20261123020101_s03_report_outcomes_index) is VALID.
--
-- deploy.sh runs migrations with lock_timeout=5s and retries a failed migration. A
-- CREATE INDEX CONCURRENTLY that times out after its catalog entry exists leaves an
-- INVALID index; the retry's IF NOT EXISTS then sees it and records the migration as
-- applied, and the index is never usable. This repairs that case and is a no-op otherwise.
--
-- migration-safety: acknowledged the plain CREATE INDEX below only runs when the
-- concurrent build failed and left an invalid (or no) index; in the normal case nothing
-- is built or locked. The repair runs under the same 5 s lock_timeout and is retried.
DO $$
DECLARE
  valid boolean;
BEGIN
  SELECT i.indisvalid INTO valid
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public."content_report_reporterId_createdAt_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "content_report_reporterId_createdAt_idx";
    CREATE INDEX "content_report_reporterId_createdAt_idx" ON "content_report" ("reporterId", "createdAt" DESC);
  END IF;
END $$;
