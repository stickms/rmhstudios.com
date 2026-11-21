-- Build releases (s04-04): releases of a User Build are listed newest first on the build page and in the public API;
-- this index serves that read (build_version already has its (buildId, version) unique key). Built CONCURRENTLY so it
-- never blocks writes; that cannot run inside a multi-statement migration transaction, so this file holds exactly ONE
-- statement. The _ensure_valid migration repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "build_version_buildId_createdAt_idx"
  ON "build_version" ("buildId", "createdAt" DESC);
