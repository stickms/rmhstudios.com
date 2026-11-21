-- Make sure the two poll-ended indexes, created CONCURRENTLY by the migration(s) before this one, are VALID.
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
  SELECT i.indisvalid INTO valid FROM pg_index i WHERE i.indexrelid = to_regclass('public."rmheet_poll_endNotifiedAt_closesAt_idx"');
  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "rmheet_poll_endNotifiedAt_closesAt_idx";
    CREATE INDEX "rmheet_poll_endNotifiedAt_closesAt_idx" ON "rmheet_poll" ("endNotifiedAt", "closesAt");
  END IF;
  SELECT i.indisvalid INTO valid FROM pg_index i WHERE i.indexrelid = to_regclass('public."rmheet_poll_endNotifiedAt_closedAt_idx"');
  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "rmheet_poll_endNotifiedAt_closedAt_idx";
    CREATE INDEX "rmheet_poll_endNotifiedAt_closedAt_idx" ON "rmheet_poll" ("endNotifiedAt", "closedAt");
  END IF;
END $$;
