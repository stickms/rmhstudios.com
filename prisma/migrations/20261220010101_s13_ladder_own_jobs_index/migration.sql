-- RMHLadder own jobs (s13-08): the owner's jobs are read by "ownerId" (the pipeline, the 300-job cap, erasure).
-- Built CONCURRENTLY so it never blocks writes to the large ladder_job table, so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "ladder_job_ownerId_idx"
  ON "ladder_job" ("ownerId");
