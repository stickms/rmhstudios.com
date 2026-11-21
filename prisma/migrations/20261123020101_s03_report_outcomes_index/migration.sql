-- "Your reports" (s03-16): a member's own reports, newest first.
--
-- Built CONCURRENTLY: "content_report" takes writes while the site runs, and a plain build would block
-- them. CONCURRENTLY cannot run inside a multi-statement migration transaction, so this file
-- holds exactly ONE statement. The next migration repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "content_report_reporterId_createdAt_idx"
  ON "content_report" ("reporterId", "createdAt" DESC);
