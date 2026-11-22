-- Post alerts (s05-17): the fan-out reads a community's opted-in members by ("communityId", "postAlerts").
-- Built CONCURRENTLY so it never blocks writes to the large community_member table; that cannot run inside a
-- multi-statement migration transaction, so this file holds exactly ONE statement. The _ensure_valid migration repairs it.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "community_member_communityId_postAlerts_idx"
  ON "community_member" ("communityId", "postAlerts");
