-- Event waitlists (s04-02): the FIFO read and the promotion count filter rsvp by (eventId, occurrenceAt, status)
-- and order by waitlistedAt. Built CONCURRENTLY so it never blocks RSVP writes; that cannot run inside a
-- multi-statement migration transaction, so this file holds exactly ONE statement. The _ensure_valid migration
-- repairs a timed-out build.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "rsvp_eventId_occurrenceAt_status_waitlistedAt_idx"
  ON "rsvp" ("eventId", "occurrenceAt", "status", "waitlistedAt");
