-- "Your co-op runs" (s15-09): a member's runs are found by "memberIds" @> ARRAY[<id>]. Built CONCURRENTLY so it never
-- blocks writes to "DreamRiftCoopRun" (the model has no @@map), so this file holds exactly ONE statement.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "DreamRiftCoopRun_memberIds_idx"
  ON "DreamRiftCoopRun" USING GIN ("memberIds");
