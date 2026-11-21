-- Tournament check-in (s04-03): the per-minute notice job finds tournaments by (status, checkInNoticeAt, startsAt).
-- Built CONCURRENTLY so it never blocks writes; that cannot run inside a multi-statement migration transaction, so
-- this file holds exactly ONE statement. The _ensure_valid migration after it repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "tournament_status_checkInNoticeAt_startsAt_idx"
  ON "tournament" ("status", "checkInNoticeAt", "startsAt");
