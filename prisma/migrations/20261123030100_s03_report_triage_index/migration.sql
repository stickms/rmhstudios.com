-- Moderation queue triage (s03-20): the grouped queue counts open reports per target.
--
-- Built CONCURRENTLY: "content_report" takes writes while the site runs, and a plain build would block
-- them. CONCURRENTLY cannot run inside a multi-statement migration transaction, so this file
-- holds exactly ONE statement. The next migration repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_report_status_entityType_entityId_idx"
  ON "content_report" ("status", "entityType", "entityId");
