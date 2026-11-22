-- Make sure the flashcard frontImageUrl and backImageUrl indexes, created CONCURRENTLY by the two migrations before
-- this one, are VALID.
--
-- deploy.sh runs migrations with lock_timeout=5s and retries a failed migration. A CREATE INDEX CONCURRENTLY that times
-- out after its catalog entry exists leaves an INVALID index; the retry's IF NOT EXISTS then sees it and records the
-- migration as applied, and the index is never usable. This repairs that case and is a no-op otherwise.
--
-- migration-safety: acknowledged the plain CREATE INDEX statements below only run when a concurrent build failed and left
-- an invalid (or no) index; in the normal case nothing is built or locked. The repair runs under the same 5 s
-- lock_timeout and is retried.
DO $$
DECLARE
  valid boolean;
BEGIN
  SELECT i.indisvalid INTO valid
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public."flashcard_frontImageUrl_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "flashcard_frontImageUrl_idx";
    CREATE INDEX "flashcard_frontImageUrl_idx" ON "flashcard" ("frontImageUrl");
  END IF;

  SELECT i.indisvalid INTO valid
  FROM pg_index i
  WHERE i.indexrelid = to_regclass('public."flashcard_backImageUrl_idx"');

  IF valid IS DISTINCT FROM true THEN
    DROP INDEX IF EXISTS "flashcard_backImageUrl_idx";
    CREATE INDEX "flashcard_backImageUrl_idx" ON "flashcard" ("backImageUrl");
  END IF;
END $$;
