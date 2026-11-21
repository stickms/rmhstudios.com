-- Make sure the build_view / build_like / build_unlock (buildId, createdAt) indexes, created CONCURRENTLY by the three
-- migrations before this one, are VALID.
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
  t text;
  valid boolean;
BEGIN
  FOREACH t IN ARRAY ARRAY['build_view', 'build_like', 'build_unlock'] LOOP
    SELECT i.indisvalid INTO valid
    FROM pg_index i
    WHERE i.indexrelid = to_regclass(format('public.%I', t || '_buildId_createdAt_idx'));

    IF valid IS DISTINCT FROM true THEN
      EXECUTE format('DROP INDEX IF EXISTS %I', t || '_buildId_createdAt_idx');
      EXECUTE format('CREATE INDEX %I ON %I ("buildId", "createdAt")', t || '_buildId_createdAt_idx', t);
    END IF;
  END LOOP;
END $$;
