-- Contract step for the Event, Streak and /pf2ecal consolidations.
--
-- rmh:contract-ok #1733 (Event/Rsvp), #1734 (/pf2ecal removed) and #1735 (Streak) are deployed; the release serving during this swap (origin/main at #1735) keeps the old models in its schema but has no query on any of them, and the same holds for availability_poll."lockedEventId", which none of its availability_poll queries selects (every one has an explicit select).
-- migration-safety: acknowledged[drop-column] availability_poll."lockedEventId" is superseded by event."pollId" (#1733); the previous release's queries never select it and this release removes it from the model.
--
-- Not dropped here: custom_feed."authorIds" (#1730/#1732). The previous
-- release still has it in its CustomFeed model and runs a bare
-- `tx.customFeed.update` (lib/discovery/feeds.server.ts setSubscribed), whose
-- RETURNING names every scalar column, so dropping it now would fail that
-- update during the swap. This release marks the field `@ignore` (out of the
-- client, still in the schema); the next contract drops the column.
--
-- Order, all in the one transaction Prisma runs this file in:
--   1. Events reconcile, first half: what the release serving before #1733
--      DELETED from the old tables during the #1733 swap, after the expand
--      copy had already carried the row over.
--   2. The events copy block of 20261120000000_events_expand, verbatim.
--   3. Events reconcile, second half: rows the old release EDITED after they
--      were copied, applied only where a timestamp proves the old edit is the
--      later one.
--   4. The two copy statements of 20261120000000_streak_unify, verbatim (they
--      reconcile newest-wins on "updatedAt" themselves).
--   5. Drop the old tables, the column and the enum.
--
-- How a copied row is told apart from a row the new release created itself:
-- the cutoff is "_prisma_migrations".started_at of 20261120000000_events_expand.
-- deploy.sh runs `prisma migrate deploy` before it starts the new web tier, so
-- every row the #1733 release created natively has "createdAt" >= cutoff, while
-- a row the expand copy carried over keeps the old row's "createdAt", which
-- predates the migration. "updatedAt" works the same way for "event": the copy
-- set it from the old row (createdAt, or scheduled_slot.updatedAt), and every
-- write the new release makes goes through Prisma's @updatedAt, which stamps
-- now(). So "createdAt" < cutoff means "came from the copy", and on "event"
-- "updatedAt" < cutoff means "the new release never wrote to it since".
-- A row the old release created in the moments between started_at and the
-- copy itself fails these filters and is left as it is: the reconcile misses
-- it rather than touch a row it cannot classify.

DO $$
DECLARE
  cutoff timestamp(3);
BEGIN
  SELECT (started_at AT TIME ZONE 'UTC')::timestamp(3) INTO cutoff
    FROM "_prisma_migrations"
   WHERE migration_name = '20261120000000_events_expand' AND finished_at IS NOT NULL;
  IF cutoff IS NULL THEN
    RAISE EXCEPTION 'expand migration 20261120000000_events_expand has not run';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "_prisma_migrations"
                  WHERE migration_name = '20261120000000_streak_unify' AND finished_at IS NOT NULL) THEN
    RAISE EXCEPTION 'expand migration 20261120000000_streak_unify has not run';
  END IF;

  -- 1a. Office hours the old release cancelled. It cancelled by DELETING the
  --     booking, its only delete path for an event source: it never deleted a
  --     community_event, game_night or scheduled_slot row, and a user or
  --     community delete cascades on both sides directly. The new release
  --     cancels by stamping canceledAt and clearing slotKey, keeping the
  --     guest's rsvp, so the same is done here. Clearing slotKey before the
  --     re-copy also lets a booking the old release then made for the same
  --     slot be copied instead of losing to the unique key.
  UPDATE "event" AS ev
     SET "canceledAt" = CURRENT_TIMESTAMP, "slotKey" = NULL, "updatedAt" = CURRENT_TIMESTAMP
   WHERE ev."kind" = 'office-hours'
     AND ev."canceledAt" IS NULL
     AND ev."createdAt" < cutoff
     AND ev."updatedAt" < cutoff
     AND NOT EXISTS (SELECT 1 FROM "office_hours_booking" AS b WHERE b."id" = ev."id");

  -- 1b. Answers the old release withdrew: an event_rsvp / event_occurrence_rsvp
  --     it deleted (un-RSVP, or "every time" clearing upcoming one-offs), and a
  --     calendar_feed_slot it replaced (it rewrote a member's slots as
  --     deleteMany + createMany, so the kept slots came back under new ids,
  --     which the re-copy below inserts once the stale ids are gone). An rsvp
  --     is deleted only when it came from the copy ("createdAt" < cutoff), its
  --     id is in none of the four source tables, and it is not a poll
  --     organiser's 'poll-' answer or an office-hours guest's (handled in 1a).
  --     Residual case, accepted: an answer the old release deleted that the
  --     member then changed IN PLACE on the new release (rsvp keeps no update
  --     time) is still deleted. The other choice would leave every
  --     swap-window withdrawal standing.
  DELETE FROM "rsvp" AS r
   WHERE r."createdAt" < cutoff
     AND r."id" NOT LIKE 'poll-%'
     AND NOT EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."id" = r."eventId" AND ev."kind" = 'office-hours')
     AND NOT EXISTS (SELECT 1 FROM "event_rsvp" AS o WHERE o."id" = r."id")
     AND NOT EXISTS (SELECT 1 FROM "event_occurrence_rsvp" AS o WHERE o."id" = r."id")
     AND NOT EXISTS (SELECT 1 FROM "calendar_feed_slot" AS o WHERE o."id" = r."id")
     AND NOT EXISTS (SELECT 1 FROM "office_hours_booking" AS o WHERE o."id" = r."id");
END $$;

-- ═══ 2. Events copy block of 20261120000000_events_expand, verbatim ═════════

-- ─── Copy (idempotent; the contract release re-runs this block verbatim) ────
--
-- Every row reuses its old id, and every INSERT ends in ON CONFLICT DO NOTHING,
-- so a second run inserts only the rows the previous release wrote while the
-- blue/green swap ran, and changes nothing else. RSVPs are guarded by EXISTS on
-- their event so a row whose event was not copied yet cannot fail the FK.

-- 1. community_event -> event (owner COMMUNITY, or USER for a profile event).
INSERT INTO "event" (
  "id", "owner", "hostId", "communityId", "kind", "title", "description",
  "startsAt", "endsAt", "venueKind", "venueRef", "capacity", "visibility",
  "canceledAt", "recurrence", "recurUntil", "recurTz", "rotatingHostIds",
  "createdAt", "updatedAt"
)
SELECT
  e."id",
  (CASE WHEN e."communityId" IS NULL THEN 'USER' ELSE 'COMMUNITY' END)::"EventOwner",
  e."hostId", e."communityId", 'event', e."title", e."description",
  e."startsAt", e."endsAt", e."venueKind", e."venueRef", e."capacity", 'PUBLIC',
  e."canceledAt", e."recurrence", e."recurUntil", e."recurTz",
  COALESCE(e."rotatingHostIds", ARRAY[]::TEXT[]),
  e."createdAt", e."createdAt"
FROM "community_event" AS e
ON CONFLICT DO NOTHING;

-- 2. event_rsvp -> rsvp, about the event as a whole (occurrenceAt = the epoch,
--    WHOLE_EVENT in lib/calendar/rsvp.ts). everyTime keeps its meaning.
INSERT INTO "rsvp" ("id", "eventId", "userId", "status", "occurrenceAt", "everyTime", "createdAt")
SELECT r."id", r."eventId", r."userId", r."status", TIMESTAMP '1970-01-01 00:00:00', r."everyTime", r."createdAt"
FROM "event_rsvp" AS r
WHERE EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."id" = r."eventId")
ON CONFLICT DO NOTHING;

-- 3. event_occurrence_rsvp -> rsvp, about one occurrence (status may be 'no').
INSERT INTO "rsvp" ("id", "eventId", "userId", "status", "occurrenceAt", "everyTime", "createdAt")
SELECT o."id", o."eventId", o."userId", o."status", o."occurrenceAt", false, o."createdAt"
FROM "event_occurrence_rsvp" AS o
WHERE EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."id" = o."eventId")
ON CONFLICT DO NOTHING;

-- 4. game_night -> event: a PLATFORM 'game-night' repeating weekly in UTC from
--    the same fixed anchor the grid used (lib/competitive/game-night.ts
--    gridAnchor: 2024-01-07 was a Sunday). A disabled night is a DRAFT. The
--    rotation (games, minutes per game, live lobby codes) moves to meta.
INSERT INTO "event" (
  "id", "owner", "kind", "title", "description", "startsAt", "endsAt",
  "visibility", "recurrence", "recurTz", "rotatingHostIds", "meta",
  "createdAt", "updatedAt"
)
SELECT
  g."id", 'PLATFORM', 'game-night', g."title", '',
  TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day' + g."startMinute" * INTERVAL '1 minute',
  TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day'
    + (g."startMinute" + g."durationMinutes") * INTERVAL '1 minute',
  (CASE WHEN g."enabled" THEN 'PUBLIC' ELSE 'DRAFT' END)::"EventVisibility",
  'W', 'UTC', ARRAY[]::TEXT[],
  jsonb_build_object(
    'games', COALESCE(g."games", '[]'::jsonb),
    'minutesPerGame', g."minutesPerGame",
    'lobbyCodes', COALESCE(g."lobbyCodes", '{}'::jsonb)
  ),
  g."createdAt", g."createdAt"
FROM "game_night" AS g
ON CONFLICT DO NOTHING;

-- 5. scheduled_slot -> event: a PLATFORM event of the slot's kind. 'daily' and
--    'weekly' become 'D' / 'W' in UTC (the grid's own clock). A zero-minute
--    slot is a moment (endsAt NULL). An unpublished slot is a DRAFT.
--    recurUntil is a calendar DATE in the new model (occurrences may start up
--    to the end of that day), while the slot's `until` was an instant, so it is
--    stored as until - 1 day + 1 ms: the last start it allows is exactly the
--    old `until`.
INSERT INTO "event" (
  "id", "owner", "kind", "title", "description", "href", "startsAt", "endsAt",
  "visibility", "recurrence", "recurUntil", "recurTz", "rotatingHostIds",
  "createdById", "createdAt", "updatedAt"
)
SELECT
  s."id", 'PLATFORM', s."kind", s."title", '', s."href", s."startsAt",
  (CASE WHEN s."durationMinutes" > 0 THEN s."startsAt" + s."durationMinutes" * INTERVAL '1 minute' END),
  (CASE WHEN s."published" THEN 'PUBLIC' ELSE 'DRAFT' END)::"EventVisibility",
  (CASE s."recurrence" WHEN 'daily' THEN 'D' WHEN 'weekly' THEN 'W' END),
  (CASE WHEN s."recurrence" IN ('daily', 'weekly') AND s."until" IS NOT NULL
        THEN s."until" - INTERVAL '1 day' + INTERVAL '1 millisecond' END),
  (CASE WHEN s."recurrence" IN ('daily', 'weekly') THEN 'UTC' END),
  ARRAY[]::TEXT[],
  s."createdById", s."createdAt", s."updatedAt"
FROM "scheduled_slot" AS s
ON CONFLICT DO NOTHING;

-- 6. office_hours_booking -> event (USER-owned, PRIVATE, kind 'office-hours')
--    plus the guest's 'going' rsvp (same id as the booking). slotKey carries
--    the old (hostId, startsAt) uniqueness that makes booking race-safe.
INSERT INTO "event" (
  "id", "owner", "hostId", "kind", "title", "description", "startsAt", "endsAt",
  "visibility", "rotatingHostIds", "slotKey", "createdAt", "updatedAt"
)
SELECT
  b."id", 'USER', b."hostId", 'office-hours', 'Office hours', b."note",
  b."startsAt", b."endsAt", 'PRIVATE', ARRAY[]::TEXT[],
  b."hostId" || ':' || (EXTRACT(EPOCH FROM b."startsAt") * 1000)::BIGINT::TEXT,
  b."createdAt", b."createdAt"
FROM "office_hours_booking" AS b
ON CONFLICT DO NOTHING;

INSERT INTO "rsvp" ("id", "eventId", "userId", "status", "occurrenceAt", "everyTime", "createdAt")
SELECT b."id", b."id", b."guestId", 'going', TIMESTAMP '1970-01-01 00:00:00', false, b."createdAt"
FROM "office_hours_booking" AS b
WHERE EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."id" = b."id")
ON CONFLICT DO NOTHING;

-- 7. A locked-in availability poll -> its event. A community poll whose lock-in
--    already created a community event links that event (pollId). Any other
--    locked poll gets a PRIVATE USER event of its own (id = the poll id) with
--    the organiser 'going'; the poll's respondents keep seeing it through
--    their poll response (lib/calendar/feed.server.ts).
UPDATE "event" AS ev
SET "pollId" = p."id"
FROM "availability_poll" AS p
WHERE p."lockedEventId" = ev."id"
  AND p."lockedStartMin" IS NOT NULL
  AND ev."pollId" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "event" AS other WHERE other."pollId" = p."id");

INSERT INTO "event" (
  "id", "owner", "hostId", "kind", "title", "description", "href", "startsAt", "endsAt",
  "visibility", "rotatingHostIds", "pollId", "createdAt", "updatedAt"
)
SELECT
  p."id", 'USER', p."creatorId", 'event', p."title", p."description", '/when/' || p."id",
  to_timestamp(p."lockedStartMin" * 60) AT TIME ZONE 'UTC',
  to_timestamp(p."lockedEndMin" * 60) AT TIME ZONE 'UTC',
  'PRIVATE', ARRAY[]::TEXT[], p."id",
  COALESCE(p."lockedAt", p."createdAt"), COALESCE(p."lockedAt", p."createdAt")
FROM "availability_poll" AS p
WHERE p."lockedStartMin" IS NOT NULL
  AND p."lockedEndMin" IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."pollId" = p."id")
ON CONFLICT DO NOTHING;

INSERT INTO "rsvp" ("id", "eventId", "userId", "status", "occurrenceAt", "everyTime", "createdAt")
SELECT 'poll-' || p."id", ev."id", p."creatorId", 'going', TIMESTAMP '1970-01-01 00:00:00', false, ev."createdAt"
FROM "availability_poll" AS p
JOIN "event" AS ev ON ev."pollId" = p."id" AND ev."id" = p."id"
ON CONFLICT DO NOTHING;

-- 8. calendar_feed_slot -> rsvp: a grid slot the member added to their feed is
--    a standing 'going' answer to that slot's event (same id).
INSERT INTO "rsvp" ("id", "eventId", "userId", "status", "occurrenceAt", "everyTime", "createdAt")
SELECT f."id", f."slotId", f."userId", 'going', TIMESTAMP '1970-01-01 00:00:00', true, f."createdAt"
FROM "calendar_feed_slot" AS f
WHERE EXISTS (SELECT 1 FROM "event" AS ev WHERE ev."id" = f."slotId")
ON CONFLICT DO NOTHING;

-- ═══ 3. Events reconcile, second half: edits the old release made ══════════
--
-- An "event" row whose "updatedAt" still equals the value the copy derived
-- from its old row was never written by the new release, so any difference
-- from the old row now can only be an edit the old release made after the
-- copy: the old row wins. Where the new release did write to it, it wins,
-- except for the timestamped fact in 3b. RSVP status changes are NOT
-- reconciled: both releases change a status in place and neither table keeps
-- an update time, so an old row that differs is as likely to be stale as
-- newer, and the new value is the one members have seen since the swap.

-- 3a. community_event the old release edited (it has no updatedAt; the copy
--     set "updatedAt" = its "createdAt").
UPDATE "event" AS ev
   SET "title" = e."title", "description" = e."description",
       "startsAt" = e."startsAt", "endsAt" = e."endsAt",
       "venueKind" = e."venueKind", "venueRef" = e."venueRef", "capacity" = e."capacity",
       "canceledAt" = e."canceledAt", "recurrence" = e."recurrence",
       "recurUntil" = e."recurUntil", "recurTz" = e."recurTz",
       "rotatingHostIds" = COALESCE(e."rotatingHostIds", ARRAY[]::TEXT[]),
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "community_event" AS e
 WHERE ev."id" = e."id"
   AND ev."owner" IN ('COMMUNITY', 'USER')
   AND ev."updatedAt" = e."createdAt"
   AND (ev."title", ev."description", ev."startsAt", ev."endsAt", ev."venueKind",
        ev."venueRef", ev."capacity", ev."canceledAt", ev."recurrence", ev."recurUntil",
        ev."recurTz", ev."rotatingHostIds")
       IS DISTINCT FROM
       (e."title", e."description", e."startsAt", e."endsAt", e."venueKind",
        e."venueRef", e."capacity", e."canceledAt", e."recurrence", e."recurUntil",
        e."recurTz", COALESCE(e."rotatingHostIds", ARRAY[]::TEXT[]));

-- 3b. A cancellation on the old release later than the new release's last
--     write to the event (canceledAt is itself the time it happened).
UPDATE "event" AS ev
   SET "canceledAt" = e."canceledAt", "updatedAt" = CURRENT_TIMESTAMP
  FROM "community_event" AS e
 WHERE ev."id" = e."id"
   AND ev."owner" IN ('COMMUNITY', 'USER')
   AND ev."canceledAt" IS NULL
   AND e."canceledAt" IS NOT NULL
   AND e."canceledAt" > ev."updatedAt";

-- 3c. game_night the old release edited (no updatedAt either; the copy set
--     "updatedAt" = its "createdAt"). Same expressions as copy step 4.
UPDATE "event" AS ev
   SET "title" = g."title",
       "startsAt" = TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day' + g."startMinute" * INTERVAL '1 minute',
       "endsAt" = TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day'
         + (g."startMinute" + g."durationMinutes") * INTERVAL '1 minute',
       "visibility" = (CASE WHEN g."enabled" THEN 'PUBLIC' ELSE 'DRAFT' END)::"EventVisibility",
       "meta" = jsonb_build_object(
         'games', COALESCE(g."games", '[]'::jsonb),
         'minutesPerGame', g."minutesPerGame",
         'lobbyCodes', COALESCE(g."lobbyCodes", '{}'::jsonb)
       ),
       "updatedAt" = CURRENT_TIMESTAMP
  FROM "game_night" AS g
 WHERE ev."id" = g."id"
   AND ev."kind" = 'game-night'
   AND ev."updatedAt" = g."createdAt"
   AND (ev."title", ev."startsAt", ev."endsAt", ev."visibility", ev."meta")
       IS DISTINCT FROM
       (g."title",
        TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day' + g."startMinute" * INTERVAL '1 minute',
        TIMESTAMP '2024-01-07 00:00:00' + g."weekday" * INTERVAL '1 day'
          + (g."startMinute" + g."durationMinutes") * INTERVAL '1 minute',
        (CASE WHEN g."enabled" THEN 'PUBLIC' ELSE 'DRAFT' END)::"EventVisibility",
        jsonb_build_object(
          'games', COALESCE(g."games", '[]'::jsonb),
          'minutesPerGame', g."minutesPerGame",
          'lobbyCodes', COALESCE(g."lobbyCodes", '{}'::jsonb)
        ));

-- 3d. scheduled_slot keeps its own "updatedAt", which the copy carried over:
--     newest wins outright. Same expressions as copy step 5.
UPDATE "event" AS ev
   SET "kind" = s."kind", "title" = s."title", "href" = s."href", "startsAt" = s."startsAt",
       "endsAt" = (CASE WHEN s."durationMinutes" > 0 THEN s."startsAt" + s."durationMinutes" * INTERVAL '1 minute' END),
       "visibility" = (CASE WHEN s."published" THEN 'PUBLIC' ELSE 'DRAFT' END)::"EventVisibility",
       "recurrence" = (CASE s."recurrence" WHEN 'daily' THEN 'D' WHEN 'weekly' THEN 'W' END),
       "recurUntil" = (CASE WHEN s."recurrence" IN ('daily', 'weekly') AND s."until" IS NOT NULL
                            THEN s."until" - INTERVAL '1 day' + INTERVAL '1 millisecond' END),
       "recurTz" = (CASE WHEN s."recurrence" IN ('daily', 'weekly') THEN 'UTC' END),
       "updatedAt" = s."updatedAt"
  FROM "scheduled_slot" AS s
 WHERE ev."id" = s."id"
   AND ev."owner" = 'PLATFORM'
   AND s."updatedAt" > ev."updatedAt";

-- ═══ 4. Copy statements of 20261120000000_streak_unify, verbatim ═══════════

-- ─── Copy (idempotent + reconciling; re-run it before the contract drops the old tables) ───

INSERT INTO "streak" (
  "userId", "kind", "current", "longest", "lastDay", "lastCheckIn",
  "totalDays", "freezeTokens", "createdAt", "updatedAt"
)
SELECT
  d."userId", 'daily', d."current", d."longest", d."lastDateKey", d."lastCheckIn",
  d."totalCheckIns", d."freezeTokens", d."createdAt", d."updatedAt"
FROM "daily_streak" AS d
ON CONFLICT ("userId", "kind") DO UPDATE SET
  "current"      = EXCLUDED."current",
  "lastDay"      = EXCLUDED."lastDay",
  "lastCheckIn"  = EXCLUDED."lastCheckIn",
  "freezeTokens" = EXCLUDED."freezeTokens",
  "longest"      = GREATEST("streak"."longest", EXCLUDED."longest"),
  "totalDays"    = GREATEST("streak"."totalDays", EXCLUDED."totalDays"),
  "updatedAt"    = EXCLUDED."updatedAt"
WHERE EXCLUDED."updatedAt" > "streak"."updatedAt";

INSERT INTO "streak" (
  "userId", "kind", "current", "longest", "lastDay", "lastCheckIn",
  "totalDays", "freezeTokens", "createdAt", "updatedAt"
)
SELECT
  a."userId", 'arcade', a."current", a."best", a."lastDay", a."updatedAt",
  0, 0, a."updatedAt", a."updatedAt"
FROM "arcade_streak" AS a
ON CONFLICT ("userId", "kind") DO UPDATE SET
  "current"     = EXCLUDED."current",
  "lastDay"     = EXCLUDED."lastDay",
  "lastCheckIn" = EXCLUDED."lastCheckIn",
  "longest"     = GREATEST("streak"."longest", EXCLUDED."longest"),
  "updatedAt"   = EXCLUDED."updatedAt"
WHERE EXCLUDED."updatedAt" > "streak"."updatedAt";

-- ═══ 5. Drop what nothing reads any more ════════════════════════════════════

-- Events (#1733). The RSVP tables first: they reference community_event.
ALTER TABLE "availability_poll" DROP COLUMN "lockedEventId";
DROP TABLE IF EXISTS "event_occurrence_rsvp";
DROP TABLE IF EXISTS "event_rsvp";
DROP TABLE IF EXISTS "calendar_feed_slot";
DROP TABLE IF EXISTS "community_event";
DROP TABLE IF EXISTS "game_night";
DROP TABLE IF EXISTS "scheduled_slot";
DROP TABLE IF EXISTS "office_hours_booking";

-- Streaks (#1735).
DROP TABLE IF EXISTS "daily_streak";
DROP TABLE IF EXISTS "arcade_streak";

-- /pf2ecal (#1734). The children of pf2e_session first; the enum once no
-- column uses it.
DROP TABLE IF EXISTS "pf2e_session_response";
DROP TABLE IF EXISTS "pf2e_recap";
DROP TABLE IF EXISTS "pf2e_announcement";
DROP TABLE IF EXISTS "pf2e_session";
DROP TABLE IF EXISTS "pf2e_settings";
DROP TYPE IF EXISTS "Pf2eAvailability";
