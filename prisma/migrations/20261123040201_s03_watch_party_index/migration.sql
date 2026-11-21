-- Scheduled watch parties (s03-09): public parties by start time for the landing's Upcoming list.
--
-- Built CONCURRENTLY: "rmhtube_room" takes writes while the site runs, and a plain build would block
-- them. CONCURRENTLY cannot run inside a multi-statement migration transaction, so this file
-- holds exactly ONE statement. The next migration repairs an invalid index a timed-out build leaves.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rmhtube_room_isPublic_scheduledFor_idx"
  ON "rmhtube_room" ("isPublic", "scheduledFor");
