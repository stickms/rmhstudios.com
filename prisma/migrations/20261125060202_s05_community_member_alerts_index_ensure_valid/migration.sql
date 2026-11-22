-- Make sure the community_member ("communityId", "postAlerts") index, created CONCURRENTLY by the migration before
-- this one, is VALID.
--
-- deploy.sh runs migrations with lock_timeout=5s and retries a failed migration. A CREATE INDEX CONCURRENTLY that times
-- out after its catalog entry exists leaves an INVALID index; the retry's IF NOT EXISTS then sees it and records the
-- migration as applied, and the index is never usable. This repairs that case and is a no-op otherwise.
--
-- migration-safety: acknowledged the plain CREATE INDEX below only runs when the concurrent build failed and left an
-- invalid (or no) index; in the normal case nothing is built or locked. The repair runs under the same 5 s lock_timeout
-- and is retried.
DO $$
DECLARE
  valid boolean;
BEGIN
  SELECT i.indisvalid INTO valid
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public."community_member_communityId_postAlerts_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "community_member_communityId_postAlerts_idx";
    CREATE INDEX "community_member_communityId_postAlerts_idx" ON "community_member" ("communityId", "postAlerts");
  END IF;
END $$;
