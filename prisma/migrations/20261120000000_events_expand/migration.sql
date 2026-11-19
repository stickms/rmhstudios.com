-- Expand step: one Event model and one Rsvp model for "a time, and who's
-- coming" (docs/plans/2026-11-19-feature-consolidation-audit.md, Scheduling).
--
-- Adds "event" + "rsvp" and copies into them every row of community_event,
-- event_rsvp, event_occurrence_rsvp, game_night, scheduled_slot,
-- office_hours_booking, calendar_feed_slot and each locked-in availability
-- poll. This release reads and writes only the new tables; the previous
-- release keeps using the old ones while the blue/green swap runs, so they are
-- dropped in a LATER release (contract), which first re-runs the copy block
-- below to pick up what the old release wrote meanwhile.
--
-- Nothing here drops, renames or tightens anything.

-- CreateEnum
CREATE TYPE "EventOwner" AS ENUM ('COMMUNITY', 'USER', 'PLATFORM');

-- CreateEnum
CREATE TYPE "EventVisibility" AS ENUM ('PUBLIC', 'PRIVATE', 'DRAFT');

-- CreateTable

-- CreateTable
CREATE TABLE "event" (
    "id" TEXT NOT NULL,
    "owner" "EventOwner" NOT NULL,
    "hostId" TEXT,
    "communityId" TEXT,
    "kind" VARCHAR(24) NOT NULL DEFAULT 'event',
    "title" VARCHAR(120) NOT NULL,
    "description" VARCHAR(2000) NOT NULL DEFAULT '',
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3),
    "venueKind" "EventVenueKind",
    "venueRef" VARCHAR(191),
    "href" VARCHAR(200),
    "capacity" INTEGER,
    "visibility" "EventVisibility" NOT NULL DEFAULT 'PUBLIC',
    "canceledAt" TIMESTAMP(3),
    "recurrence" VARCHAR(4),
    "recurUntil" TIMESTAMP(3),
    "recurTz" VARCHAR(64),
    "rotatingHostIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "meta" JSONB NOT NULL DEFAULT '{}',
    "pollId" VARCHAR(40),
    "slotKey" VARCHAR(96),
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rsvp" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" VARCHAR(8) NOT NULL,
    "occurrenceAt" TIMESTAMP(3) NOT NULL,
    "everyTime" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rsvp_pkey" PRIMARY KEY ("id")
);

-- CreateIndex

-- CreateIndex

-- CreateIndex
CREATE UNIQUE INDEX "event_pollId_key" ON "event"("pollId");

-- CreateIndex
CREATE UNIQUE INDEX "event_slotKey_key" ON "event"("slotKey");

-- CreateIndex
CREATE INDEX "event_communityId_startsAt_idx" ON "event"("communityId", "startsAt");

-- CreateIndex
CREATE INDEX "event_hostId_startsAt_idx" ON "event"("hostId", "startsAt");

-- CreateIndex
CREATE INDEX "event_startsAt_idx" ON "event"("startsAt");

-- CreateIndex
CREATE INDEX "event_owner_visibility_startsAt_idx" ON "event"("owner", "visibility", "startsAt");

-- CreateIndex
CREATE INDEX "rsvp_eventId_occurrenceAt_status_idx" ON "rsvp"("eventId", "occurrenceAt", "status");

-- CreateIndex
CREATE INDEX "rsvp_userId_occurrenceAt_idx" ON "rsvp"("userId", "occurrenceAt");

-- CreateIndex
CREATE INDEX "rsvp_userId_createdAt_idx" ON "rsvp"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "rsvp_eventId_userId_occurrenceAt_key" ON "rsvp"("eventId", "userId", "occurrenceAt");

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event" ADD CONSTRAINT "event_communityId_fkey" FOREIGN KEY ("communityId") REFERENCES "community"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rsvp" ADD CONSTRAINT "rsvp_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;


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
